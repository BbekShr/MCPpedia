-- Restore the security hardening that 20260610000000_security_hardening.sql
-- was supposed to apply and never did.
--
-- =====================================================================
-- !! MERGE ORDER: PR #156 (20260907120000) MUST LAND FIRST !!
-- =====================================================================
--
-- 20260907120000_restore_profiles_self_update_policy.sql (S99) fixes a LIVE
-- outage — 16 accounts cannot update their own profile row. If THIS file
-- merges to `main` first, the remote high-water mark in
-- `supabase_migrations.schema_migrations` becomes 20260908000000 and
-- `supabase db push` will refuse the lower 20260907120000 FOREVER: the workflow
-- withholds `--include-all` on purpose (.github/workflows/migrate.yml:107-112),
-- so out-of-order application is not available as an escape hatch. The outage
-- fix would then be permanently stranded.
--
-- The repo has already paid for exactly this. 20260718000000 was stranded the
-- same way and had to be renamed to land at all — the incident is written up in
-- 20260803120000_publisher_claims_user_id_fk_profiles.sql:12-20.
--
-- If for any reason #156 does NOT merge before this file, this file must be
-- RE-STAMPED to a version above whatever #156 finally lands as. There is no
-- content dependency in either direction — #156 touches only `public.profiles`,
-- which this file does not reference — so the ordering constraint is purely
-- about the ledger high-water mark, and re-stamping is the whole fix.
--
-- Anything added after this file must likewise sort above 20260908000000.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- 20260610000000_security_hardening.sql is recorded in
-- `supabase_migrations.schema_migrations` with all 13 of its statements, but it
-- was never EXECUTED against production. Verified 2026-09-08 by direct
-- read-only query: the ledger row is present and complete, yet every object it
-- claims to have changed is still in its pre-hardening state (enumerated
-- per-section below). The first `migrate.yml` run after that row appeared
-- logged only "Remote database is up to date."
--
-- `supabase db push` keys purely on the ledger version, so it will skip
-- 20260610000000 forever. It is also run deliberately WITHOUT `--include-all`
-- (.github/workflows/migrate.yml:107-112 — the comment there explains that
-- out-of-order application silently reorders DDL against a schema built in
-- filename order). So editing 20260610000000 in place would change nothing,
-- and back-dating this file below the ledger high-water mark would make it
-- unapplied history too. A NEW migration with a LATER version is the only
-- mechanism that can land these changes.
--
-- WHAT IS RESTATED
-- ----------------
-- Sections 1, 2, 3, 5 and 6 of 20260610000000, renumbered 1-5 here (each
-- section names its original). Section 4 of that file (the `profiles` UPDATE
-- policy) is DELIBERATELY EXCLUDED: it already shipped as
-- 20260907120000_restore_profiles_self_update_policy.sql (S99). Restating it
-- here would be a duplicate create of a policy another in-flight migration
-- owns.
--
-- THREE DELIBERATE DIVERGENCES from 20260610000000, each argued in place:
--   * section 1 pins more columns than 20260610000000 did — the five score
--     SUB-scores, `score_computed_at`, and four trust flags. `score_total`
--     alone was cosmetic; see section 1.
--   * section 2 additionally pins `reviewed_by IS NULL` on the `edits` INSERT
--     policy (S101).
--   * section 3 DROPS the `discussions` UPDATE policy rather than re-creating
--     it with the WITH CHECK 20260610000000 proposed, and pins `upvotes = 0` on
--     the INSERT policy instead. That WITH CHECK did not do what its comment
--     claimed; see section 3.
--
-- NO ALTER TABLE, no data repair, no GRANT. This file only replaces RLS
-- policies and re-declares three function search_paths.
--
-- Idempotent: every policy is `DROP ... IF EXISTS` then `CREATE`, and every
-- function is `CREATE OR REPLACE` restating the body already in production
-- (with one deliberate change — `p_threshold` is ignored, flagged in section
-- 5), so a re-apply changes nothing.


-- =====================================================================
-- 0. Fail fast rather than queue behind a lock on a hot table
-- =====================================================================
--
-- Section 1 and section 3 take ACCESS EXCLUSIVE on `servers` (~56k rows, every
-- ISR page, the whole bot fleet) and on `discussions`. If the apply lands while
-- a long read holds a conflicting lock, the DROP waits — and every subsequent
-- `servers` read queues behind the waiting DROP, because lock requests are
-- ordered. `app/servers/loading.tsx` exists, so Next commits 200 + shell and
-- streams; an overrun there renders as a permanently stuck skeleton, not an
-- error page. A migration that fails in 5s and can simply be re-run is strictly
-- better than one that converts contention into a sitewide stall.
--
-- `set local` scopes this to the migration's own transaction and leaves no role
-- setting behind — same idiom and reasoning as
-- 20260804120000_content_updated_at.sql:46-48. Outside a transaction block
-- Postgres downgrades `SET LOCAL` to a warning rather than an error, so this is
-- safe under any apply harness.

set local lock_timeout = '5s';


-- =====================================================================
-- POLICY NAMES — why there is exactly one DROP per policy
-- =====================================================================
--
-- S21 (20260719150000_drop_stale_search_servers_overload.sql) and S23
-- (20260725000000_fix_profiles_privilege_escalation.sql:27-43) are the same
-- failure: a later CREATE did not supersede the earlier object because the
-- IDENTIFIER had changed — an argument signature there, a policy name here —
-- and Postgres ORs PERMISSIVE policies for the same command, so the WEAKEST
-- surviving one decides. The rule that came out of S23 is: drop the policy
-- under EVERY name it has ever carried, or a weaker sibling outlives the fix.
--
-- That check was run for all five policies below. Each has carried exactly ONE
-- name for its whole history — original creation and 20260610000000's
-- re-creation use identical strings:
--
--   "Authed users can insert servers"    20260402000000_initial_schema.sql:301
--   "Authed users can propose edits"     20260402000000_initial_schema.sql:319
--   "Authed users can post discussions"  20260402000000_initial_schema.sql:328
--   "Users can update own discussions"   20260402000000_initial_schema.sql:331
--   "Authed users can submit claims"     20260402020000_trust_features.sql:57
--
-- No migration renames any of them (the only other policies touching these
-- tables are "Admins can update servers"/"Admins can update edits" in
-- 20260404010000_restrict_profile_role_update.sql:24,31 and
-- 20260417210403_tighten_admin_rls.sql:18,28 — both UPDATE, neither an alias of
-- the five here). So one DROP per policy is sufficient, and adding speculative
-- drops for names that never existed would be noise. The assertion in section 6
-- covers the case this static check cannot: an alias created outside migration
-- history, e.g. by hand in the SQL editor.


-- =====================================================================
-- 1. servers INSERT — pin trust-sensitive columns to safe defaults
--    (was section 1 of 20260610000000, :10-21)
-- =====================================================================
--
-- Production today: WITH CHECK is `(auth.uid() = submitted_by)` only — i.e.
-- still the 20260402000000_initial_schema.sql:301-302 version. So an authed
-- user can PostgREST-INSERT a row with verified=true, publisher_verified=true,
-- a full set of scores and claimed_by set to themselves. `anon`/`authenticated`
-- hold full DML grants on this table, so RLS is the only boundary, and the
-- repo's rate limiting is entirely route-side — it does not apply to a direct
-- PostgREST call.
--
-- WHY MORE COLUMNS THAN 20260610000000 PINNED. That file pinned `score_total`,
-- which is COSMETIC on its own: neither component that renders a server's score
-- reads it. components/ServerSidebar.tsx:86-92 and components/ScoreCard.tsx:
-- 147-148 both sum the five `score_*` sub-scores, and ScoreCard explicitly
-- prefers that sum over `score_total`. Pinning the total while leaving
-- `score_security` … `score_compatibility` free lets a forged 100 render
-- anyway. `score_computed_at` matters for a different reason: the re-scoring
-- bot picks rows off a `score_computed_at`-keyed staleness filter
-- (bots/compute-scores.ts:103-108 — `is.null`, or `.lt.<now-7d>` live, or
-- `.lt.<now-30d>` archived). A FUTURE timestamp fails all three arms, so once
-- the row's fourth, unrelated arm expires (`created_at.gt.<now-3d>`, :107) the
-- forged scores are never revisited.
--
-- The four trust flags are each independently load-bearing:
--   * `registry_verified` renders the "Registry verified" badge
--     (components/server/Hero.tsx:180) and a +2 row in the score breakdown
--     (components/server/ScorePanel.tsx:94-98);
--   * `security_verified` has ZERO writers anywhere in the repo — every
--     reference is a read (app/api/submit/route.ts:192,
--     app/api/server/[slug]/refresh-score/route.ts:114,
--     bots/compute-scores.ts:249, lib/mcp/tools.ts:164) — so nothing would ever
--     correct a forged value. BOTH live scoring engines read it (the duplicate
--     engine is BACKLOG S42), and they value it differently:
--       - lib/scoring.ts feeds it to checkRepoSignals (:816-834), whose two
--         regimes are MUTUALLY EXCLUSIVE, because `pass` is
--         `isArchived ? false : securityVerified ? true : null` (:829). On an
--         ARCHIVED server the flag is worth a real +2 — base 2, −4 archived,
--         +2 verified, i.e. 0 instead of −2 — while `pass` stays false. On a
--         LIVE server it flips `pass` from null to true but is worth 0, because
--         2 + 2 is clamped straight back to 2 by
--         `Math.max(-2, Math.min(2, points))` (:824).
--       - The SQL `compute_server_score` is blunter and the better forgery
--         target: a flat +5 on the 0-30 security sub-score, archived or not
--         (20260426120000_fix_scoring_formula.sql:25; the same term appears in
--         that file's one-off bulk recompute at :125). That RPC is still
--         reachable and still called — scripts/apply-classifications.ts:197,282.
--     It also prints "Security verified: Yes" to every MCP client
--     (lib/mcp/tools.ts:164);
--   * `community_verified` forces indexability (lib/seo.tsx:55) and sitemap
--     inclusion (lib/sitemap-shared.ts:162);
--   * `community_verification_count` renders "N confirmed installs"
--     (components/server/Hero.tsx:243-246).
--
-- VERIFIED SAFE for the app: app/api/submit/route.ts:139-167 is the ONLY authed
-- insert into `servers` in the repo (`grep -rn "from('servers')" app/
-- components/ | grep insert` returns that one site), and it satisfies every
-- predicate below. `submitted_by: user.id`, `verified: false` and
-- `author_type: 'community'` are written literally; all eleven remaining pinned
-- columns are OMITTED from the payload, so their column defaults apply, and
-- every one of those defaults conforms to the pinned value:
--
--   publisher_verified          default false  20260402020000_trust_features.sql:62
--   claimed_by                  default NULL   20260402020000_trust_features.sql:61
--   score_total                 default 0      20260402010000_scores_security_registry.sql:6
--   score_security              default 0      20260402010000_scores_security_registry.sql:7
--   score_maintenance           default 0      20260402010000_scores_security_registry.sql:8
--   score_documentation         default 0      20260402010000_scores_security_registry.sql:9
--   score_compatibility         default 0      20260402010000_scores_security_registry.sql:10
--   score_efficiency            default 0      20260402010000_scores_security_registry.sql:11
--   score_computed_at           no default     20260402010000_scores_security_registry.sql:12
--   security_verified           default false  20260402010000_scores_security_registry.sql:19
--   registry_verified           default false  20260402010000_scores_security_registry.sql:30
--   community_verification_count default 0     20260403030000_community_verification.sql:16
--   community_verified          default false  20260403030000_community_verification.sql:17
--
-- No migration alters any of those defaults (`grep -rn "alter column"
-- supabase/migrations/` returns nothing for `servers`). This check is the whole
-- risk of this section: a pin whose default does NOT conform makes the WITH
-- CHECK evaluate to NULL and denies every submission.
--
-- The scores ARE written a moment later, by the same route — but on
-- `createAdminClient` (app/api/submit/route.ts:239-241), which is service-role
-- and RLS-exempt, as is every bot insert.

DROP POLICY IF EXISTS "Authed users can insert servers" ON servers;

CREATE POLICY "Authed users can insert servers"
  ON servers FOR INSERT
  WITH CHECK (
    auth.uid() = submitted_by
    AND verified = false
    AND publisher_verified = false
    AND author_type = 'community'
    AND claimed_by IS NULL
    AND score_total = 0
    AND score_security = 0
    AND score_maintenance = 0
    AND score_documentation = 0
    AND score_compatibility = 0
    AND score_efficiency = 0
    AND score_computed_at IS NULL
    AND registry_verified = false
    AND security_verified = false
    AND community_verified = false
    AND community_verification_count = 0
  );


-- =====================================================================
-- 2. edits INSERT — prevent self-approval farming  [STRENGTHENED, S101]
--    (was section 2 of 20260610000000, :28-35)
-- =====================================================================
--
-- Production today: WITH CHECK is `(auth.uid() = user_id)` only — the
-- 20260402000000_initial_schema.sql:319-320 version. So today a user can
-- insert `status = 'approved'` rows directly, and the auto-approve trust gate
-- counts them.
--
-- That gate derives its count from this same table:
--
--     app/api/edit/route.ts:101-106
--       .from('edits').select('id', {count:'exact', head:true})
--       .eq('user_id', user.id).eq('status','approved')
--       .not('reviewed_by','is',null)
--
-- 20260610000000 would have pinned `status = 'pending'`. That alone DOES close
-- the hole: a pending row cannot be flipped to 'approved' by its author,
-- because the only `edits` UPDATE policy requires
-- role IN ('editor','admin','maintainer')
-- (20260417210403_tighten_admin_rls.sql:28-37). So `status` is the load-bearing
-- pin, and this file's addition is not a correction of that.
--
-- What `reviewed_by IS NULL` adds is defence in depth on the DISCRIMINATOR.
-- `reviewed_by is not null` is the filter that stops this route's own
-- auto-approved rows (written with `reviewed_by: null`) from feeding the gate
-- that authorized them, yet `reviewed_by` is a plain nullable uuid FK to
-- auth.users (20260402000000_initial_schema.sql:125) constrained by no policy.
-- Leaving it writable means the gate's integrity rests entirely on that one
-- UPDATE policy staying role-gated; pinning it means a future loosening of that
-- policy cannot silently reopen trust farming. Two locks on a two-lock door,
-- and the second lock costs nothing (S101).
--
-- VERIFIED SAFE for the app — every legitimate writer still passes:
--   * the ordinary proposal path inserts `status: 'pending'` on the AUTHED
--     client and never sets `reviewed_by`, so the column default NULL applies;
--   * every `status: 'approved'` insert already goes through
--     `createAdminClient`, which bypasses RLS — app/api/edit/route.ts:135 (the
--     auto-approve arm), app/api/admin/archive/route.ts:60-71 and
--     app/api/admin/verify/route.ts:51-62 (the two audit rows, both stamping
--     `reviewed_by: user.id`). Those three call sites already carry comments
--     saying they use the service role BECAUSE of this policy;
--   * moderator approval is an UPDATE, governed by "Admins can update edits"
--     (20260417210403_tighten_admin_rls.sql:28-37), which this file leaves
--     alone.
-- Production's three existing pending rows all have `reviewed_by` null, so no
-- stored row contradicts the new predicate (WITH CHECK applies to new rows
-- only, but a contradiction would have signalled an unknown writer).

DROP POLICY IF EXISTS "Authed users can propose edits" ON edits;

CREATE POLICY "Authed users can propose edits"
  ON edits FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_by IS NULL
  );


-- =====================================================================
-- 3. discussions — DROP the UPDATE policy, and pin upvotes on INSERT
--    (diverges from section 3 of 20260610000000, :43-48)
-- =====================================================================
--
-- Production today: UPDATE is `USING (auth.uid() = user_id)` with NO WITH CHECK
-- at all (20260402000000_initial_schema.sql:331-332), and INSERT is
-- `WITH CHECK (auth.uid() = user_id)` (:328-329). A missing WITH CHECK on an
-- UPDATE policy means the NEW row is entirely unconstrained.
--
-- WHY THIS FILE DOES NOT RESTATE 20260610000000's FIX. That fix was
-- `WITH CHECK (auth.uid() = user_id)`, which constrains ONLY `user_id`. On
-- their own row a user could still set `upvotes` to any value — defeating
-- `vote_and_recount` (section 5) outright, and `upvotes` is both the thread's
-- sort key (components/DiscussionSection.tsx:29) and rendered text (:147) —
-- reassign `server_id` to move their comment onto another server's page, and
-- rewrite `body`/`parent_id`. It also left the INSERT policy untouched, so
-- `upvotes: 99999` stayed forgeable at insert time no matter what the UPDATE
-- policy said. Re-creating it would have shipped a comment claiming a fix the
-- predicate does not deliver.
--
--   (a) DROP the UPDATE policy outright instead. NO app path updates
--       `discussions`: all five `from('discussions')` sites across app/, lib/,
--       components/, bots/ and scripts/ are reads or the single INSERT
--       (app/api/discuss/route.ts:32,48,59 — count, parent lookup, insert;
--       components/DiscussionSection.tsx:25,37 — two selects), and a grep for a
--       following `.update(`/`.upsert(`/`.delete(` on the table returns nothing.
--       With no UPDATE policy, `authenticated` simply cannot UPDATE the table,
--       which is what the app already assumes. `vote_and_recount` is unaffected:
--       it is SECURITY DEFINER, so its `UPDATE discussions SET upvotes` runs as
--       the table owner and bypasses RLS entirely. If a comment-edit feature is
--       ever built, re-adding an UPDATE policy scoped to the editable columns is
--       a few lines — this is a cheap, reversible removal, not a design.
--
--   (b) Pin `upvotes = 0` on the INSERT policy, which 20260610000000 left
--       alone. Without it (a) buys little: a user could still mint a comment
--       that arrives pre-upvoted and sorts to the top of the thread.
--
-- VERIFIED SAFE for the app: app/api/discuss/route.ts:60-64 inserts exactly
-- `{ server_id, user_id, parent_id, body }` on the authed client — `upvotes` is
-- omitted, so the column default 0 applies
-- (20260402000000_initial_schema.sql:144).

DROP POLICY IF EXISTS "Users can update own discussions" ON discussions;

DROP POLICY IF EXISTS "Authed users can post discussions" ON discussions;

CREATE POLICY "Authed users can post discussions"
  ON discussions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND upvotes = 0
  );


-- =====================================================================
-- 4. publisher_claims INSERT — prevent self-verification
--    (was section 5 of 20260610000000, :75-84)
-- =====================================================================
--
-- Production today: WITH CHECK is `(auth.uid() = user_id)` only — the
-- 20260402020000_trust_features.sql:57-58 version. So a user can insert their
-- own claim pre-marked `verified = true`. That matters because
-- app/api/admin/approve-claim/route.ts is the only intended path to a verified
-- claim, and a self-verified row would additionally be INVISIBLE to the
-- moderation queue: the pending-claims badge counts `.eq('verified', false)`
-- (app/admin/page.tsx:216-218).
--
-- VERIFIED SAFE for the app: app/api/claim/route.ts:49-53 inserts exactly
-- `{ server_id, user_id, proof_type, proof_value }` — all three pinned columns
-- are omitted, so the defaults (verified false, verified_by NULL, verified_at
-- NULL) apply. The only write of `verified = true` in the repo is
-- app/api/admin/approve-claim/route.ts:70-73 (with the rollback at :88-91), on
-- the admin client, which bypasses RLS.

DROP POLICY IF EXISTS "Authed users can submit claims" ON publisher_claims;

CREATE POLICY "Authed users can submit claims"
  ON publisher_claims FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND verified = false
    AND verified_by IS NULL
    AND verified_at IS NULL
  );


-- =====================================================================
-- 5. SECURITY DEFINER functions — pin search_path
--    (was section 6 of 20260610000000, :91-201)
-- =====================================================================
--
-- Production today: `vote_and_recount`, `increment_mcp_usage` and
-- `toggle_community_verify` all have `proconfig = NULL` — no pinned
-- search_path. Every OTHER SECURITY DEFINER function in `public` is pinned, so
-- these three are the exact residue of the migration that did not run. An
-- unpinned SECURITY DEFINER function resolves its unqualified names through
-- the CALLER's search_path, so a caller who can create objects in a schema
-- earlier on that path can shadow `votes`, `discussions`, `servers`,
-- `mcp_api_usage` or `community_verifications` and have the definer's
-- privileges operate on their table instead.
--
-- The three bodies below are restated from
-- 20260610000000_security_hardening.sql:91-201 byte-for-byte, with ONE
-- deliberate exception: the `p_threshold` clamp at the top of
-- `toggle_community_verify`, argued at that function. Nothing else is
-- reverted — no migration after 2026-06-10 redefines any of them (the only
-- other definitions are 20260404020000_indexes_and_atomic_ops.sql:20,75 and
-- 20260408010000_mcp_api_usage.sql:17, both earlier), and production's stored
-- bodies were confirmed to match the repo.
--
-- ON THE IDIOM — what `= public` does and does not buy. The newer house style
-- is `set search_path = ''` with fully-qualified names
-- (20260725000000_fix_profiles_privilege_escalation.sql:84-88 states the
-- reasoning; live at that file's :94, 20260421010000_multi_provider_signup.sql:28,
-- 20260421020000_username_rules.sql:49 and
-- 20260402000000_initial_schema.sql:253). `= public` does NOT close the
-- schema-injection hole; it NARROWS it. Postgres searches an unlisted `pg_temp`
-- FIRST for RELATION names, and every unqualified name in these three bodies is
-- a relation, so a caller who can create temp tables can still shadow `votes`,
-- `discussions`, `servers`, `mcp_api_usage` and `community_verifications`. What
-- `= public` does close is shadowing from any other schema the caller controls
-- on their own search_path, which is the whole of today's exposure for a
-- PostgREST caller. Closing the `pg_temp` residue means rewriting twelve
-- unqualified relation references across three function bodies to `public.x` —
-- a behaviour-change risk this corrective migration deliberately does not take,
-- and a separate, separately-verified item.

CREATE OR REPLACE FUNCTION vote_and_recount(
  p_user_id uuid,
  p_discussion_id uuid,
  p_value int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing int;
  v_net int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT value INTO v_existing
    FROM votes
   WHERE user_id = p_user_id AND discussion_id = p_discussion_id;

  IF FOUND THEN
    IF v_existing = p_value THEN
      DELETE FROM votes
       WHERE user_id = p_user_id AND discussion_id = p_discussion_id;
    ELSE
      UPDATE votes SET value = p_value
       WHERE user_id = p_user_id AND discussion_id = p_discussion_id;
    END IF;
  ELSE
    INSERT INTO votes (user_id, discussion_id, value)
    VALUES (p_user_id, p_discussion_id, p_value);
  END IF;

  SELECT COALESCE(SUM(value), 0) INTO v_net
    FROM votes
   WHERE discussion_id = p_discussion_id;

  UPDATE discussions SET upvotes = v_net WHERE id = p_discussion_id;

  RETURN v_net;
END;
$$;


CREATE OR REPLACE FUNCTION increment_mcp_usage(p_date date, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO mcp_api_usage (usage_date, action, count)
  VALUES (p_date, p_action, 1)
  ON CONFLICT (usage_date, action)
  DO UPDATE SET count = mcp_api_usage.count + 1;
END;
$$;


-- `p_threshold` is CALLER-SUPPLIED over PostgREST. The function carries the
-- default PUBLIC EXECUTE grant and no migration in supabase/migrations/ ever
-- REVOKEs it, so a direct caller names whatever value they like — and the
-- parameter is abusable in BOTH directions.
--
-- DOWNWARD, forced verification:
--
--     POST /rest/v1/rpc/toggle_community_verify
--     {"p_user_id":<self>,"p_server_id":<any>,"p_threshold":0}
--
-- marks ANY server community-verified off a single vote — which forces
-- indexability (lib/seo.tsx:55) and sitemap inclusion
-- (lib/sitemap-shared.ts:162).
--
-- UPWARD, forced DE-verification — the more damaging direction, because it
-- vandalises a server the attacker does not own:
--
--     {"p_user_id":<self>,"p_server_id":<victim>,"p_threshold":2147483647}
--
-- inserts the attacker's own verification, recounts (say v_count = 6), then
-- evaluates `v_verified := 6 >= 2147483647` to FALSE and writes
-- community_verified = false over a server with five legitimate verifications.
-- The row is left self-inconsistent (community_verification_count = 6 next to
-- community_verified = false) and PERMANENTLY so: this function is the ONLY
-- writer of servers.community_verified in the repo — every other reference is a
-- read (lib/seo.tsx:55, lib/sitemap-shared.ts:162,245,275,
-- app/api/mcp/route.ts:33, lib/constants.ts:145, lib/types.ts:108) — so nothing
-- ever re-derives it. The victim loses forced indexability and drops out of the
-- sitemap: exactly the two consequences cited above as why this parameter
-- matters.
--
-- The `auth.uid() != p_user_id` guard stops neither direction: the attacker IS
-- the authenticated user.
--
-- So the parameter is IGNORED, not clamped. A one-sided `greatest(..., 3)`
-- bounds only from below and leaves the upward vandalism open; an unconditional
-- overwrite closes both, and covers an explicit `null` (which would otherwise
-- make `v_count >= p_threshold` NULL and hence `v_verified` NULL) for free.
-- This is behaviour-identical for the sole legitimate caller — the route passes
-- the constant THRESHOLD = 3 (app/api/community-verify/route.ts:6,27) — and for
-- the DEFAULT 3 path.
--
-- The SIGNATURE IS PRESERVED BYTE-IDENTICAL ON PURPOSE: changing it (dropping
-- the parameter or its DEFAULT, renaming, retyping) would CREATE A SECOND
-- OVERLOAD rather than replace this one — the S21 trap
-- (20260719150000_drop_stale_search_servers_overload.sql) — and PostgREST
-- refuses to choose between overloads, breaking the route's named-argument
-- call. Removing the now-dead parameter properly (DROP the old function, CREATE
-- the two-argument one, ship the route change in the same deploy) is a
-- follow-up, not something to smuggle into a restore migration.

CREATE OR REPLACE FUNCTION toggle_community_verify(
  p_user_id uuid,
  p_server_id uuid,
  p_threshold int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existed boolean;
  v_count int;
  v_verified boolean;
BEGIN
  p_threshold := 3;  -- see comment: caller-supplied over PostgREST, and 3 is the only value the app ever passes

  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF EXISTS (
    SELECT 1 FROM community_verifications
     WHERE user_id = p_user_id AND server_id = p_server_id
  ) THEN
    DELETE FROM community_verifications
     WHERE user_id = p_user_id AND server_id = p_server_id;
    v_existed := true;
  ELSE
    INSERT INTO community_verifications (user_id, server_id)
    VALUES (p_user_id, p_server_id);
    v_existed := false;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM community_verifications
   WHERE server_id = p_server_id;

  v_verified := v_count >= p_threshold;

  UPDATE servers
     SET community_verification_count = v_count,
         community_verified = v_verified
   WHERE id = p_server_id;

  RETURN jsonb_build_object(
    'count', v_count,
    'verified', v_verified,
    'user_verified', NOT v_existed
  );
END;
$$;


-- =====================================================================
-- 6. Assertion — RLS on, and exactly ONE permissive policy per command
-- =====================================================================
--
-- WHAT THIS CAN AND CANNOT DO — stated plainly, because an assertion that
-- overstates its reach is worse than none:
--
--   * It runs ONCE, at apply time. It can never detect later drift; a policy
--     added by hand tomorrow is invisible to it.
--   * It CANNOT detect the failure that made this whole file necessary. The
--     "recorded in the ledger but never executed" class is undetectable from
--     inside the thing that did not execute — if this migration is skipped the
--     way 20260610000000 was, this block does not run either. Only an external
--     probe of live `pg_policies` / `pg_proc.proconfig` can catch that, and
--     that check does not belong in a migration.
--
-- It checks two things this file's own DDL cannot determine.
--
-- FIRST, that ROW LEVEL SECURITY IS ENABLED on each table. `ALTER TABLE servers
-- DISABLE ROW LEVEL SECURITY` is in exactly the hand-edit threat class this
-- block exists for, and it is invisible to a policy COUNT: the policies remain
-- listed in `pg_policies` and are simply never consulted. Combined with the
-- full `anon`/`authenticated` DML grants these tables carry, that turns each of
-- them into an open write surface while every count below still reads 1.
--
-- SECOND, the TOTAL number of permissive policies per command. Sections 1-4
-- guarantee that at least one exists and what it says; they say nothing about
-- whether a SECOND, weaker policy exists under a different name. Since Postgres
-- ORs permissive policies and the weakest decides (the S21/S23 lesson at the
-- top), an unexpected alias silently voids the section above it. Static
-- analysis of migration history ruled out an alias created BY a migration; only
-- this runtime count rules out one created outside it — a hand-edit in the
-- Supabase SQL editor, which is exactly how earlier incidents in this repo were
-- hot-patched (20260719150000_drop_stale_search_servers_overload.sql:15-16).
--
-- `cmd IN (<command>, 'ALL')` because a FOR ALL policy also governs the
-- command; counting only the exact `cmd` would miss the broadest alias of all.
-- Asserting = 1 rather than <= 1: a zero would mean a section above silently
-- failed to create its policy, leaving the table open to `authenticated`.
--
-- `discussions` appears with INSERT, not UPDATE, because section 3 removes its
-- UPDATE policy deliberately — that removal gets its own = 0 assertion after
-- the loop, which is what proves the DROP landed and that no alias survived it.

DO $$
DECLARE
  r record;
  v_count int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('servers',          'INSERT'),
      ('edits',            'INSERT'),
      ('discussions',      'INSERT'),
      ('publisher_claims', 'INSERT')
    ) AS t(tbl, command)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relname = r.tbl AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'restore_security_hardening: RLS is DISABLED on public.% — policies are inert', r.tbl;
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = r.tbl
       AND permissive = 'PERMISSIVE'
       AND cmd IN (r.command, 'ALL');

    IF v_count <> 1 THEN
      RAISE EXCEPTION
        'restore_security_hardening: public.% has % permissive %-capable policies, expected exactly 1. Postgres ORs permissive policies and the weakest decides — resolve by hand before re-running.',
        r.tbl, v_count, r.command;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'discussions'
     AND permissive = 'PERMISSIVE'
     AND cmd IN ('UPDATE', 'ALL');

  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'restore_security_hardening: public.discussions still has % permissive UPDATE-capable policies, expected 0 — section 3 drops the only one this repo knows about, so a survivor is an alias created outside migration history.',
      v_count;
  END IF;
END;
$$;
