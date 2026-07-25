-- Drop the stale duplicate UPDATE policy on `profiles`.
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
-- trust gate in app/api/edit/route.ts — after which low-risk edits bypass
-- moderator review entirely.
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
-- "Users can update own profile", which still permits the app's legitimate
-- self-update path at app/api/username/route.ts:70-72 (username /
-- username_set). The one other self-write, the discussions_count recount at
-- app/api/discuss/route.ts, targets a column the hardening migration
-- deliberately froze — it only reaches Postgres today because this stale
-- policy ORs it in, so part 2 below moves that column to a trigger and the
-- route's write is deleted in the same commit.
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
-- Since 20260610000000 froze `discussions_count` in the profiles UPDATE
-- policy, that route-handler write has been permitted ONLY by the stale
-- policy dropped above — and a PostgREST RLS denial comes back as a returned
-- error, not a thrown one, so the route's try/catch never saw it. Dropping
-- the stale policy alone would therefore have silently frozen every user's
-- discussion counter. This trigger takes ownership of the column instead,
-- matching sync_servers_submitted / sync_edits_approved in
-- 20260421000000_sync_profile_counters.sql: SECURITY DEFINER (so it runs
-- above the RLS freeze) with a pinned search_path.
--
-- `discussions` has no soft-delete or moderation-status column
-- (20260402000000_initial_schema.sql:137-148), so a countable discussion is
-- simply a row with that user_id — exactly what the route counted
-- (`.eq('user_id', user.id)`, no further filter). Ownership can only move via
-- an UPDATE of user_id, handled the same way sync_servers_submitted handles
-- submitted_by.

create or replace function sync_discussions_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null then
      update profiles
      set discussions_count = discussions_count + 1
      where id = new.user_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.user_id is not null then
      update profiles
      set discussions_count = greatest(discussions_count - 1, 0)
      where id = old.user_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if coalesce(new.user_id::text, '') <> coalesce(old.user_id::text, '') then
      if old.user_id is not null then
        update profiles
        set discussions_count = greatest(discussions_count - 1, 0)
        where id = old.user_id;
      end if;
      if new.user_id is not null then
        update profiles
        set discussions_count = discussions_count + 1
        where id = new.user_id;
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_discussions_count on discussions;
create trigger trg_sync_discussions_count
  after insert or update of user_id or delete on discussions
  for each row execute function sync_discussions_count();

-- Backfill. Unlike the two backfills in 20260421000000 this LEFT JOINs from
-- profiles rather than grouping over the child table, so profiles with zero
-- discussions are reset to 0 too — under the stale policy a user could PATCH
-- any number into this column, and a group-over-children backfill would leave
-- a forged count on a profile that has never posted.

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
