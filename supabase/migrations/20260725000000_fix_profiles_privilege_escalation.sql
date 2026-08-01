-- Fix the privilege escalation caused by a stale duplicate UPDATE policy on
-- `profiles`, and repair the state it allowed to be forged.
--
-- Four parts, in this order and this order only:
--   1. drop the stale policy                (stops new exploitation)
--   2. give discussions_count a trigger     (the drop would otherwise freeze it)
--   3. snapshot counter discrepancies       (evidence, before it is overwritten)
--   4. re-derive all four counters          (ends the existing exposure)


-- =====================================================================
-- 1. profiles UPDATE — drop the stale duplicate policy
-- =====================================================================
--
-- 20260404010000_restrict_profile_role_update.sql:4 dropped
--   "Users can update own profile"
-- and created
--   "Users can update own profile except role"        -- i.e. a RENAME
-- whose WITH CHECK freezes only `role` and `created_at`.
--
-- 20260610000000_security_hardening.sql:55 then dropped
--   "Users can update own profile"                    -- a name that no longer existed
-- (a silent no-op — `if exists`) and re-created it at :57 with a hardened
-- WITH CHECK that additionally freezes `karma`, `edits_approved`,
-- `servers_submitted` and `discussions_count`.
--
-- Nothing ever dropped the 20260404 policy, so after an in-order apply BOTH
-- policies exist on profiles FOR UPDATE. Postgres ORs PERMISSIVE policies for
-- the same command, so the WEAKEST one decides: a signed-in user PATCHing
-- /rest/v1/profiles?id=eq.<self> with {"karma": 999999, "edits_approved": 99}
-- is rejected by the hardened policy but accepted by the 20260404 one (role and
-- created_at are unchanged), and the OR lets the write through. `edits_approved`
-- is only ever incremented by trigger (20260421000000_sync_profile_counters.sql)
-- and never recomputed, so a forged value persists and clears the auto-approve
-- trust gate at app/api/edit/route.ts:54 — after which low-risk edits bypass
-- moderator review.
--
-- Same class as the S21 stale `search_servers` overload
-- (20260719150000_drop_stale_search_servers_overload.sql): a later migration's
-- CREATE did not supersede the earlier object because the IDENTIFIER changed —
-- an argument signature there, a policy name here. When hardening an existing
-- policy, drop it under EVERY name it has ever had, or a weaker sibling
-- survives and the permissive OR hands it the decision.
--
-- Unaffected: "Admins can update any profile", recreated under its own name by
-- 20260417210403_tighten_admin_rls.sql:7-16 (the path used by
-- app/api/admin/role/route.ts:45-47), and the surviving hardened
-- "Users can update own profile", which still permits the app's one legitimate
-- self-update path at app/api/username/route.ts:70-72 (username /
-- username_set).
--
-- Idempotent: `if exists` makes this a no-op wherever the stale policy was
-- already removed by hand.

DROP POLICY IF EXISTS "Users can update own profile except role" ON profiles;


-- =====================================================================
-- 2. discussions_count — move from the route handler to a trigger
-- =====================================================================
--
-- SUPERSEDES the note at the top of
-- 20260421000000_sync_profile_counters.sql ("discussions_count is maintained
-- by the /api/discuss route handler and left alone here"). That file is
-- applied history and is not edited; this is the correction of record.
--
-- Since 20260610000000 froze `discussions_count` in the profiles UPDATE policy,
-- that route-handler write has been permitted ONLY by the stale policy dropped
-- above — and a PostgREST RLS denial comes back as a returned error, not a
-- thrown one, so the route's try/catch never saw it. Dropping the stale policy
-- alone would therefore have silently frozen every user's discussion counter.
-- This trigger takes ownership of the column instead, matching
-- sync_servers_submitted / sync_edits_approved in
-- 20260421000000_sync_profile_counters.sql; the route's write is deleted in the
-- same commit.
--
-- `discussions` has no soft-delete or moderation-status column
-- (20260402000000_initial_schema.sql:137-148), so a countable discussion is
-- simply a row with that user_id — exactly what the route counted
-- (`.eq('user_id', user.id)`, no further filter). Ownership can only move via an
-- UPDATE of user_id, handled the way sync_servers_submitted handles
-- submitted_by.
--
-- `set search_path = ''` (not `= public`, as the 2026-04-21 counter functions
-- use) with fully-qualified names: `= public` still leaves pg_temp implicitly
-- searched ahead of it, which a SECURITY DEFINER function should not allow.
-- This matches handle_new_user (20260421010000_multi_provider_signup.sql:28)
-- and is the idiom to copy from here on.

create or replace function sync_discussions_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null then
      update public.profiles
      set discussions_count = coalesce(discussions_count, 0) + 1
      where id = new.user_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.user_id is not null then
      update public.profiles
      set discussions_count = greatest(coalesce(discussions_count, 0) - 1, 0)
      where id = old.user_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if coalesce(new.user_id::text, '') <> coalesce(old.user_id::text, '') then
      if old.user_id is not null then
        update public.profiles
        set discussions_count = greatest(coalesce(discussions_count, 0) - 1, 0)
        where id = old.user_id;
      end if;
      if new.user_id is not null then
        update public.profiles
        set discussions_count = coalesce(discussions_count, 0) + 1
        where id = new.user_id;
      end if;
    end if;
  end if;
  return null;
end;
$$;

-- The coalesce()s above are not defensive noise: servers_submitted,
-- edits_approved and discussions_count are `integer default 0` with NO NOT NULL
-- (20260402000000_initial_schema.sql:100-102) and the stale policy accepted any
-- value, NULL included. Without them a NULL counter would stay NULL forever
-- (NULL + 1 = NULL). Part 4 repairs any NULL already stored.

drop trigger if exists trg_sync_discussions_count on discussions;
create trigger trg_sync_discussions_count
  after insert or update of user_id or delete on discussions
  for each row execute function sync_discussions_count();


-- =====================================================================
-- 3. Forensics — snapshot the discrepancies BEFORE overwriting them
-- =====================================================================
--
-- The gap between a stored counter and its derived value is the only evidence
-- that the stale policy was ever exploited, and part 4 is about to erase it for
-- four columns. Capture it first: an empty table after apply means the
-- escalation was never used; a non-empty one is the incident record and the
-- list of accounts to audit.
--
-- DELIBERATELY KEPT after apply, not dropped — do not clean this up until a
-- human has reviewed it. A discrepancy is suggestive, not proof:
-- sync_servers_submitted / sync_edits_approved are delta-only, so a half-applied
-- migration or a direct SQL-editor write could also have drifted a counter.
--
-- RLS enabled with NO policies, for the karma_events reason
-- (20260421030000_karma.sql:44-50): the service role is then the only reader.
-- Without it this table is readable through PostgREST with the public anon key,
-- and it names accounts.

create table if not exists profiles_counter_forensics (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  column_name text not null,
  stored_value integer,
  derived_value integer not null,
  captured_at timestamptz not null default now()
);

alter table profiles_counter_forensics enable row level security;

insert into profiles_counter_forensics (profile_id, column_name, stored_value, derived_value)
select id, 'edits_approved', stored, derived from (
  select p.id, p.edits_approved as stored,
         (select count(*)::int from edits e
           where e.user_id = p.id and e.status = 'approved') as derived
  from profiles p
) s where stored is distinct from derived

union all
select id, 'servers_submitted', stored, derived from (
  select p.id, p.servers_submitted as stored,
         (select count(*)::int from servers sv where sv.submitted_by = p.id) as derived
  from profiles p
) s where stored is distinct from derived

union all
select id, 'discussions_count', stored, derived from (
  select p.id, p.discussions_count as stored,
         (select count(*)::int from discussions d where d.user_id = p.id) as derived
  from profiles p
) s where stored is distinct from derived

union all
select id, 'karma', stored, derived from (
  select p.id, p.karma as stored,
         (select coalesce(sum(ke.points), 0)::int from karma_events ke
           where ke.user_id = p.id) as derived
  from profiles p
) s where stored is distinct from derived;


-- =====================================================================
-- 4. Re-derive every counter the stale policy left writable
-- =====================================================================
--
-- Dropping the policy stops NEW forgeries; it does not undo old ones. All four
-- columns are maintained by delta-only triggers that never re-derive, and the
-- two one-shot backfills in 20260421000000 grouped over the CHILD table — so a
-- profile carrying a forged count with no matching child rows was never
-- corrected by them and never would be. `edits_approved` gates auto-approval at
-- app/api/edit/route.ts:54, so leaving a forged value in place would lock the
-- door behind an attacker who is already inside.
--
-- Every LEFT JOIN below is FROM profiles, so profiles with zero child rows are
-- reset too — that is the point, and the difference from the 2026-04-21 idiom
-- (which grouped over the child table and therefore could not see them).
-- `is distinct from` both keeps a re-apply a no-op and repairs NULLs: a NULL
-- counter makes the surviving policy's `col = (SELECT col ...)` evaluate to NULL
-- rather than true, permanently locking that user out of EVERY self-profile
-- update, /api/username included, surfacing as a generic 500.
--
-- Each source is ground truth because the source itself is not forgeable:
--   edits        — INSERT pins status='pending' (20260610000000:28-36); only
--                  admins/maintainers may UPDATE it (20260417210403:28+).
--   servers      — INSERT pins submitted_by=auth.uid(), verified=false,
--                  score_total=0, claimed_by null (20260610000000:10-21).
--   karma_events — RLS on, a SELECT policy and deliberately NO
--                  insert/update/delete policy at all (20260421030000:44-50);
--                  written only by SECURITY DEFINER award triggers whose point
--                  values are hardcoded constants.

update profiles p
set edits_approved = sub.c
from (
  select p2.id, count(e.id)::int as c
  from profiles p2
  left join edits e on e.user_id = p2.id and e.status = 'approved'
  group by p2.id
) sub
where p.id = sub.id
  and p.edits_approved is distinct from sub.c;

update profiles p
set servers_submitted = sub.c
from (
  select p2.id, count(s.id)::int as c
  from profiles p2
  left join servers s on s.submitted_by = p2.id
  group by p2.id
) sub
where p.id = sub.id
  and p.servers_submitted is distinct from sub.c;

update profiles p
set discussions_count = sub.c
from (
  select p2.id, count(d.id)::int as c
  from profiles p2
  left join discussions d on d.user_id = p2.id
  group by p2.id
) sub
where p.id = sub.id
  and p.discussions_count is distinct from sub.c;

update profiles p
set karma = sub.c
from (
  select p2.id, coalesce(sum(ke.points), 0)::int as c
  from profiles p2
  left join karma_events ke on ke.user_id = p2.id
  group by p2.id
) sub
where p.id = sub.id
  and p.karma is distinct from sub.c;
