-- Restore the `profiles` self-UPDATE policy that production has been missing
-- since 2026-07-29, which has RLS-filtered every non-admin's /api/username call.
--
-- SUPERSEDES §4 of 20260610000000_security_hardening.sql:51-68. That file is
-- recorded in supabase_migrations.schema_migrations with all 13 of its
-- statements, but NONE of them are in effect in production (BACKLOG S98 — a
-- direct read of prod `pg_policies` on 2026-09-07 shows the hardened policy
-- absent). Applied migrations are never edited in this repo, so a correction is
-- a new, later-versioned file; precedent 20260725000000:62-65 ("that file is
-- applied history and is not edited; this is the correction of record") and
-- 20260803120000_publisher_claims_user_id_fk_profiles.sql:12-20.
--
-- THE CASCADE that left `profiles` with no self-UPDATE policy at all:
--   20260404010000_restrict_profile_role_update.sql:7  created
--     "Users can update own profile except role"       (role/created_at frozen)
--   20260725000000_fix_profiles_privilege_escalation.sql:55  DROPPED it, on the
--     stated assumption (:47-51, "the surviving hardened 'Users can update own
--     profile'") that 20260610000000's replacement existed. It did not.
-- What remains on `profiles` FOR UPDATE is only "Admins can update any
-- profile", whose USING matches `role = 'admin'` alone
-- (20260417210403_tighten_admin_rls.sql:10-12). So the app's one legitimate
-- self-update path, app/api/username/route.ts:69-72, has been silently
-- RLS-filtered for every non-admin since 2026-07-29 07:59 — the 24 profiles
-- created before that timestamp have username_set = true, the 16 created after
-- have false, with zero exceptions.
--
-- VERSION ORDERING: .github/workflows/migrate.yml:107-112 deliberately withholds
-- `--include-all`, so `supabase db push` will only apply a version that sorts
-- AFTER the last applied one. If BACKLOG S98's sibling migration merges before
-- this one, THIS FILE MUST BE RENAMED to a later version before merge.
--
-- SCOPE — deliberately narrow. S98's other five sections (the `servers` INSERT
-- pin, the `edits` INSERT status pin, the `publisher_claims` INSERT policy, the
-- `discussions` UPDATE WITH CHECK, and the three SECURITY DEFINER search_path
-- pins) are NOT in this file. `supabase db push` applies a file atomically, so
-- bundling them would couple this P1 user-facing fix to unrelated hardening:
-- either everything lands or nothing does.
--
-- SCOPE, the other direction — what this RESTORES, stated plainly. The policy
-- below leaves SIX columns self-writable: `username`, `username_set`,
-- `display_name`, `avatar_url`, `bio`, `github_username`. That is a RESTORATION
-- of the 2026-04-04 → 2026-07-29 status quo and matches 20260610000000's intent
-- exactly; production is immune to the two gaps below today only as a side
-- effect of the very outage this file ends. Restoring the policy therefore
-- reopens both. Each is filed as its own BACKLOG row and each is deliberately
-- NOT closed here, because this file is a P1 outage fix:
--   1. Reserved usernames (`admin`, `mcppedia`, `official`, `staff`, …) are
--      enforced in APPLICATION CODE ONLY (lib/username.ts:17-29). The DB trigger
--      `validate_profile_username` checks FORMAT alone
--      (20260421025000_username_format_trigger.sql:22-25), by explicit decision
--      (20260421020000_username_rules.sql:9-10). A direct anon-key PostgREST
--      PATCH therefore bypasses the reserved list entirely.
--   2. `bio`, `display_name`, `avatar_url` and `github_username` are bare `text`
--      with no length bound and NO application writer at all — the only two
--      `profiles` writers in the app are app/api/username/route.ts:71 and
--      app/api/admin/role/route.ts:46 — and `avatar_url` reaches a raw
--      `<img src>` at app/profile/[username]/page.tsx:83-87.


-- =====================================================================
-- 1. Drop every name this policy has ever had
-- =====================================================================
--
-- Postgres ORs PERMISSIVE policies for the same command, so the WEAKEST one
-- decides (20260725000000:27-43). The S21 precedent is
-- 20260719150000_drop_stale_search_servers_overload.sql, where a changed
-- IDENTIFIER let a stale object survive a later CREATE — an argument signature
-- there, a policy name here.
--
-- Production holds NEITHER name today, so both drops are no-ops there. They
-- exist for divergent environments (a local stack or branch DB that DID apply
-- 20260404010000 or 20260610000000) and to honour the permissive-OR rule itself.
--
-- The policy below is created under the FIRST name. Inventing a third alias is
-- exactly the defect that produced S23.

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can update own profile except role" on public.profiles;


-- =====================================================================
-- 2. The policy
-- =====================================================================
--
-- (a) `is not distinct from`, NOT `=`. With `=`, a stored NULL in any frozen
--     column makes that conjunct evaluate to NULL, so the whole WITH CHECK is
--     never true and that user is locked out of EVERY self-update, /api/username
--     included — the trap documented at 20260725000000:216-219. Production has
--     zero NULLs across all six columns today (40/40 profiles, verified
--     2026-09-07), but five of them remain nullable:
--     `servers_submitted`, `edits_approved`, `discussions_count`, `role` and
--     `created_at` are all bare `default`s with no NOT NULL
--     (20260402000000_initial_schema.sql:100-107); only `karma` is
--     `not null default 0` (20260421030000_karma.sql:57).
--     This is the FIRST use of `is not distinct from` in this repo —
--     `grep -rn "is not distinct from" supabase/migrations/` returns hits in
--     this file and nowhere else. It is NOT precedent; it stands on the
--     NULL-safety argument above alone. The repo does use the related but
--     DIFFERENT `is distinct from` (e.g. 20260725000000:240), which is
--     change-detection in an `UPDATE ... WHERE`, not a NULL-safe column freeze.
--     Adding NOT NULL DEFAULTs instead was considered and REJECTED: that
--     rewrites the table and changes behaviour for every writer, which is a
--     different change class than restoring a missing policy.
--
-- (b) Freezing the counters does not break counter maintenance — but not for
--     the reason "SECURITY DEFINER" suggests. SECURITY DEFINER confers NO RLS
--     exemption by itself; it only runs the body as the function's OWNER. The
--     exemption comes from that owner also being the TABLE owner: Postgres does
--     not apply RLS to a table's owner unless the table carries FORCE ROW LEVEL
--     SECURITY. `profiles` does not — `grep -rni "force row level security"
--     supabase/migrations/` returns nothing. So the `sync_*` triggers
--     (20260421000000_sync_profile_counters.sql; sync_discussions_count at
--     20260725000000:90-136) write the frozen counters unimpeded today.
--     FORWARD WARNING: if `profiles` ever gains FORCE ROW LEVEL SECURITY, that
--     owner bypass disappears and every SECURITY DEFINER writer becomes subject
--     to these policies with auth.uid() NULL, so BOTH UPDATE policies' USING is
--     false. `apply_karma_event`'s `update profiles set karma = karma +
--     new.points` (20260421030000_karma.sql:67) would then stop syncing
--     SILENTLY, because a USING filter-out is not an error
--     (docs/org-memory/codebase.md:1112-1115).
--
-- (c) The subqueries read `profiles` from inside a `profiles` policy. This
--     terminates because the SELECT policy is "Profiles are viewable by
--     everyone" using (true) (20260402000000_initial_schema.sql:307-308), and
--     the live proof is "Admins can update any profile", which already does
--     EXISTS (SELECT 1 FROM profiles ...) inside a profiles policy
--     (20260417210403:11,14).
--     FORWARD WARNING — and the failure mode is NOT the loud one. If the
--     `profiles` SELECT policy is ever narrowed so these scalar subqueries
--     return no row, each yields NULL, and `col is not distinct from null`
--     reduces to `col is null`. Ordinary self-updates WOULD be denied, but a
--     CRAFTED update that explicitly sets all six frozen columns to NULL would
--     be PERMITTED — a silent UNFREEZE, not an outage. Five of the six are
--     nullable (only `karma` is NOT NULL, 20260421030000_karma.sql:57), and
--     `created_at = null` alone defeats the new-account anti-spam gate at
--     app/api/discuss/route.ts:21-38: `new Date(null)` is the epoch, so
--     `isNewAccount` is false and the poster's limit goes 3/day to 30/day.
--     That is why the WITH CHECK ends with an `exists` conjunct (see below):
--     it makes the property structural instead of comment-dependent.
--
-- (d) `role` and `created_at` stay frozen — dropping them reintroduces exactly
--     the escalation 20260404010000:10-14 was written to prevent.
--     `username` and `username_set` are deliberately ABSENT from the freeze
--     list; that is the entire point of this file
--     (app/api/username/route.ts:69-72 is the app's ONE legitimate self-update
--     path; app/api/admin/role/route.ts:44-47 rides the admin policy instead).
--
-- No `TO` clause, matching the original and every existing `profiles` policy:
-- `anon` has a NULL auth.uid(), so the USING clause is NULL and denies anyway.
--
-- Two non-semantic deviations from the 2026-06-10 text: the subqueries are
-- aliased `p`, and identifiers are schema-qualified.

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role              is not distinct from (select p.role              from public.profiles p where p.id = auth.uid())
    and created_at        is not distinct from (select p.created_at        from public.profiles p where p.id = auth.uid())
    and karma             is not distinct from (select p.karma             from public.profiles p where p.id = auth.uid())
    and edits_approved    is not distinct from (select p.edits_approved    from public.profiles p where p.id = auth.uid())
    and servers_submitted is not distinct from (select p.servers_submitted from public.profiles p where p.id = auth.uid())
    and discussions_count is not distinct from (select p.discussions_count from public.profiles p where p.id = auth.uid())
    -- Fail CLOSED, per (c). Today this is always true — the SELECT policy is
    -- `using (true)` (20260402000000_initial_schema.sql:307-308) — so it is a
    -- no-op. It exists so that narrowing that SELECT policy DENIES self-updates
    -- outright, instead of silently permitting a write that NULLs all six
    -- frozen columns. The whole S98/S99 incident is a documented assumption
    -- that did not hold, so this one is enforced rather than asserted in prose.
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );


-- =====================================================================
-- 3. Assert the end state
-- =====================================================================
--
-- HONEST LIMIT, stated up front. This block runs ONCE, at apply time, in the
-- same transaction as the DDL above, and NEVER AGAIN: `supabase db push` does
-- not re-execute a version already recorded in
-- supabase_migrations.schema_migrations (docs/org-memory/codebase.md:1022-1029).
-- It therefore CANNOT detect future drift of any kind. It also cannot detect
-- the S98 class — "recorded in schema_migrations but never executed" — because
-- it lives inside the very thing that did not execute. The detector for BOTH is
-- BACKLOG M19's standing definition-level sweep plus the post-merge
-- `pg_policies` read.
--
-- What it CAN assert, at apply time only, is the one fact the statements above
-- do not already determine: that no unexpected THIRD permissive UPDATE policy
-- exists on this database. The two drops and the create fully determine both
-- names this policy has ever had; they say nothing about a third alias — which
-- is precisely the S21/S23 shape, and precisely what matters, because Postgres
-- ORs permissive policies and the WEAKEST one decides. Relevant for a divergent
-- local stack or branch DB; a no-op on prod.

do $$
declare
  v_total int;
begin
  select count(*) into v_total
  from pg_policies
  where schemaname = 'public'
    and tablename  = 'profiles'
    and cmd        = 'UPDATE'
    and permissive = 'PERMISSIVE';

  if v_total <> 2 then
    raise exception
      'S99: expected exactly 2 permissive UPDATE policies on public.profiles (this self policy + "Admins can update any profile"), observed %. A third permissive UPDATE policy is ORed in and the WEAKEST decides.',
      v_total;
  end if;
end
$$;
