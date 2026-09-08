# Schema drift: migration intent vs. the live catalog

**Date:** 2026-09-08 · **Backlog:** M19 · **Script:** `scripts/check-schema-drift.ts`

> **A file in `supabase/migrations/` proves only that it was merged. Only the live catalog
> describes production.**

That sentence is the whole point of this document, and it is not a style preference. It was
paid for.

## 1. Why this exists

`supabase/migrations/20260610000000_security_hardening.sql` is recorded in
`supabase_migrations.schema_migrations` with all 13 of its statements — and **none of them ever
ran in production.** Because the ledger says applied, `supabase db push` skips it forever; it
will never self-correct. The consequences were a five-week user-facing outage and four live
security holes.

Worse, the file kept lying to us after the fact. Three separate org records —
`docs/PLATFORM_REVIEW_2026-07.md`, BACKLOG S13 and BACKLOG S48 — each diagnosed a production
bug from a policy that was never live, because each of them read a merged migration file as the
schema of record. Reading migrations to learn the schema is the normal, obvious, wrong thing to
do, and this repo did it three times independently.

A one-off sweep on 2026-09-07 established that `20260610000000` is a one-off and not a class:
production is otherwise clean. This script makes that sweep repeatable instead of a memory.

## 2. What the check compares

**Definitions, not names.** A name sweep is worthless here. The repo idiom is

```sql
DROP POLICY IF EXISTS "Authed users can propose edits" ON edits;
CREATE POLICY "Authed users can propose edits" ON edits FOR INSERT WITH CHECK (…);
```

so when the `CREATE` never runs, the name is still there, still attached to the **old** body.
Of `20260610000000`'s eight missing effects, a name-only check would notice exactly one.

The script parses every file under `supabase/migrations/**` with `pg-query-emscripten`
(libpg_query, the real Postgres grammar — regexes produced false positives here, reporting
columns as missing because an `ALTER TABLE … ADD COLUMN` pattern spanned a statement boundary),
derives the intent as *last write wins in filename order*, then reads the live catalog:

| Intent from the migrations | Compared against |
|---|---|
| `CREATE POLICY` — `USING` and `WITH CHECK` bodies, `FOR <cmd>`, permissive/restrictive | `pg_policies.qual`, `.with_check`, `.cmd`, `.permissive` |
| `CREATE FUNCTION … SET search_path = X` / `SECURITY DEFINER` | `pg_proc.proconfig`, `pg_proc.prosecdef` |
| `ALTER TABLE … ADD COLUMN` | `information_schema.columns` |
| `ALTER TABLE … ENABLE ROW LEVEL SECURITY` | `pg_class.relrowsecurity` |
| `CREATE TRIGGER` | `pg_trigger` (non-internal) |

`DROP POLICY` / `DROP TRIGGER` after the last `CREATE` retract the intent, so a deliberately
removed object is not reported as missing.

### How predicates are compared without crying wolf

Postgres does not store your SQL text, it stores a tree and deparses it back. `status =
'pending'` returns as `(status = 'pending'::text)`, `role IN ('a','b')` returns as `(role = ANY
(ARRAY['a'::text, 'b'::text]))`, sub-selects come back table-qualified and aliased
(`profiles profiles_1`). String equality against the migration text would flag **every policy in
the database**, and a check that cries wolf gets ignored — which would leave us exactly where we
started.

So both sides are parsed by the same parser and compared as ASTs, after canonicalising away:
casts, parenthesisation, `AND`/`OR` and `=`/`<>` operand order, `IN` vs `= ANY (ARRAY[…])`,
table-qualification of column references, sub-select aliases, and a redundant `public.` prefix.

Each predicate is then split into its **top-level `AND` conjuncts**, and the check reports the
intended conjuncts that are **absent from the live predicate**. That is the direction that
matters: `20260610000000` failed by leaving conditions out, and every one of the four security
holes was a missing conjunct.

### What it cannot see

Stated plainly, because a check whose limits are unwritten gets over-trusted:

- **It does not prove the live predicate is equivalent, only that it contains the intended
  conditions.** A live `USING (intended_condition OR true)` still *contains* the conjunct and
  passes. Extra live conditions are reported as NOTES, never as drift.
- **It does not check policy grantee roles** (`pg_policies.roles`).
- **It does not check function bodies**, only `proconfig` and `prosecdef`. A function whose SQL
  drifted while keeping its search_path passes.
- **It does not check column types, defaults, constraints, indexes or grants** — only that an
  `ADD COLUMN`'s column exists.
- **Function properties are asserted per name, not per signature.** If the migrations pin
  `search_path` on one overload, every live overload of that name is held to it.
- **It says nothing about data**, and nothing about whether a migration that *did* run produced
  the intended result.
- **It reads `supabase/migrations/**`, not `schema_migrations`.** It answers "does prod match
  what we merged", not "what does the ledger claim". Those are different questions and the whole
  incident lives in the gap between them.

Objects that exist live but appear in no migration are listed under NOTES rather than DRIFT —
they are usually dashboard edits, and the permissive-OR hazard makes them worth an eyeball, but
they are not evidence that a migration failed to apply.

## 3. Running it

```bash
npm run check:schema-drift
# or, to point at a different tree of migrations
npx tsx scripts/check-schema-drift.ts --migrations path/to/migrations
```

Needs `SUPABASE_DB_URL` — the same variable `.github/workflows/migrate.yml` uses. Put it in
`.env.local` (the script loads it via `dotenv`, matching the other `scripts/*.ts`) or export it.
Use the **session pooler** string on port 5432, as `migrate.yml`'s error text explains.

Exit codes: `0` clean · `1` drift found · `2` could not check (no URL, parse error, query error).
A file that fails to parse is a hard `2`, never a quiet "clean" — a checker that reports green
because it parsed nothing is worse than no checker.

**It is read-only, and not merely by convention.** Every query runs inside `BEGIN TRANSACTION
READ ONLY`, so the *server* rejects a write:

```
write rejected: SQLSTATE 25006 - cannot execute CREATE TABLE in a read-only transaction
```

Every statement it issues is a `SELECT` against `pg_policies`, `pg_proc`,
`information_schema.columns`, `pg_class` and `pg_trigger`. It reads catalog metadata only —
roughly 700 rows, no table data — so it costs essentially nothing against the Supabase free-plan
egress ceiling, and runs in about 1.9 s.

## 4. Current state (2026-09-08)

Against production, the check reports **8 findings, all of them from
`20260610000000_security_hardening.sql`, and nothing else**:

- `servers` "Authed users can insert servers" — live `WITH CHECK` missing 5 of 6 conditions
- `edits` "Authed users can propose edits" — missing `status = 'pending'`
- `discussions` "Users can update own discussions" — the live policy has no `WITH CHECK` at all
- `profiles` "Users can update own profile" — no policy of that name exists live
- `publisher_claims` "Authed users can submit claims" — missing 3 of 4 conditions
- `vote_and_recount`, `toggle_community_verify`, `increment_mcp_usage` — `proconfig` is `NULL`
  where the migration pins `SET search_path = public`

Remove that one file from the input and the check is **clean, exit 0**, across 43 policies,
32 functions, 54 added columns, 25 RLS tables and 15 triggers, with zero NOTES. So the eight
findings are attributable to one migration, not to a noisy comparison.

PRs #156, S106 and S102/S103 are open and will fix those effects in production once merged.
**A clean run after they land is the success condition for this check** — and the first time
this repo will have a mechanical answer to "is production what we think it is".

## 5. When should it run? (needs a human decision)

Wiring this into CI or a cron edits `.github/workflows/**`, a **protected path** under
CLAUDE.md §5. This document deliberately stops at a recommendation; the wiring is left as an
explicit human decision.

**Option A — scheduled bot.** A workflow on a daily/weekly cron, like the other 14 bots.
*Cost:* ~1 min of Actions per run (free tier), negligible DB cost. *Against:* migrations in this
repo are applied by `migrate.yml` on merge to `main`, but a migration can sit unapplied for a
human-latency window, and a permanently-red scheduled bot masks genuine failures — this repo has
that failure mode written into `bots/compute-scores.ts:369-377`. A drift bot would go red on
every legitimate lag and be muted within a month.

**Option B — an assertion step after `supabase db push` in `migrate.yml`. (recommended)**
The job already has `SUPABASE_DB_URL`, already runs only when `supabase/migrations/**` changes,
and is already the serialised writer. Adding `npm run check:schema-drift` after the `Apply
migrations` step converts "`db push` exited 0" into "the live catalog actually agrees" — which
is precisely the assertion `20260610000000` needed and did not have. *Cost:* a few seconds on a
job that only runs on migration merges; no standing cost, no cron, no red-bot decay. *Caveat:*
it only fires when a migration changes, so drift introduced by a dashboard edit is invisible
until the next migration lands. Note the job would need `npm ci` and a Node setup step, which
it does not have today.

**Option C — a manual runbook step.** Run it by hand after applying a migration, and during any
investigation that is about to reason from a migration file. *Cost:* zero. *Against:* it depends
on someone remembering, which is exactly the failure that produced three wrong org records.

**Recommendation: B, with C as the standing habit until B is wired.** B costs nothing, sits on
the one workflow that is already the single writer, and guards the exact statement — "push
succeeded" — that was false for five weeks. C is available today with no protected-path change
at all: the npm script exists.

Regardless of which is chosen: **before diagnosing any production bug from a migration file,
run this check.** That is the cheap half of the lesson.
