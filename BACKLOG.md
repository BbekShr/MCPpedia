# Backlog

The org's work queue — one of the three memory stores (see `docs/org-memory/README.md`).

**Bright line:** improvement cycles may ONLY change a row's Status, append notes to it, and
append new rows. Priority and acceptance criteria are the human's lever — cycles never edit
them and never delete rows. Status values: `open` · `in-progress` · `in-review` · `done`.

ID taxonomy mirrors the standing goals: **S** = stability/features/bugs, **R** = refactors,
**W** = keep-current/dependency drift, **M** = org/process improvements. Priority P1 (urgent)
→ P4 (someday). Protected = the change will touch a protected path (CLAUDE.md §5), so its PR
needs the human-approved label.

| ID | P | Item | Acceptance criteria | Status | Protected |
|----|---|------|---------------------|--------|-----------|
| S1 | P2 | CI has no build gate — `next build` never runs in CI, so type-safe-but-unbuildable changes (bad route exports, RSC violations, config errors) surface only at Vercel deploy time | `.github/workflows/ci.yml` runs `npm run build` on every PR (with placeholder env vars as needed) and it passes on main | in-review | yes |
| S2 | P3 | `npm run lint` reports 11 warnings (unused vars etc.) — warning noise hides new ones | `npm run lint` exits with 0 errors and 0 warnings, with no `eslint-disable` added and no rule weakened | in-progress | no |
| S3 | P3 | No smoke check exists — nothing verifies the built app boots and serves pages | A scripted smoke check (build + `next start` + curl of `/`, one server page, and one API route asserting HTTP 200) exists as an npm script, is documented in CLAUDE.md §2, and runs in CI | open | yes |
| M1 | P3 | Pre-existing `.claude/commands/qa.md` predates the org and overlaps qa-verifier | A human decision is recorded in `docs/org-memory/codebase.md`: fold it into qa-verifier's feature-specific checks, keep it as a standalone manual skill, or delete it | open | no |
| W1 | P4 | Dependency drift is untracked — Next.js 16 / React 19 / Supabase SDKs move fast and this repo pins a breaking-changes Next version | A dated drift report appended to `docs/org-memory/codebase.md`: `npm outdated` summary, upstream breaking changes that affect this codebase, and any W rows filed for needed migrations | open | no |
| S4 | P3 | Env-less CI build prerenders 701 `/compare/[slugs]` pages that all render `notFound()` — `app/compare/[slugs]/page.tsx:40-47` lacks the env guard that `app/s/[slug]/page.tsx:98-101` has, so with the mock client every pair 404s (~15–40s of CI time producing 701 useless 404 pages) (found in S1 perf review) | Compare's `generateStaticParams` returns `[]` when Supabase env is absent (mirroring `s/[slug]`), or an equivalent guard; env-present builds still prerender all pairs; the ~700 build-time 404s no longer occur | open | no |
| R1 | P4 | The two Supabase mock clients diverge — `lib/supabase/server.ts` mock lacks `maybeSingle/gt/gte/lt/lte/in/not/ilike/overlaps` that `lib/supabase/public.ts` has; a future build-time-reachable server-client caller using a missing method would TypeError only in the env-less CI build (found in S1 correctness/regression review) | The two mocks expose an identical method surface (shared factory or aligned method set) so env-less builds cannot fail on a method the real client supports; note: touches `lib/supabase/**` (protected) | open | yes |
| S5 | P4 | CI has no `.next/cache` persistence and no `concurrency` cancel-in-progress — every PR is a cold Turbopack build (~2–4 min) that re-downloads Google Fonts, and rapid pushes run redundant full builds (found in S1 perf review; deferred by CEO decision that cycle) | `.github/workflows/ci.yml` caches `.next/cache` keyed on lockfile+source and adds a `concurrency` group with `cancel-in-progress: true` for the CI workflow; build time drops on warm cache and superseded runs cancel | open | yes |
| S6 | P3 | Publisher-claim verification is manual only — the MVP (`app/api/claim`, `app/api/admin/approve-claim`, claims tab) requires a maintainer to eyeball each proof, and there is no claimant notification (notifications.type CHECK is limited to `edit_approved`/`edit_rejected`, so adding claim events needs a migration) | Automated proof verification for at least `github_repo`/`github_org` (issue a `mcppedia-<token>`, fetch GitHub to confirm, auto-verify), plus a `claim_approved`/`claim_rejected` notification type (migration) so claimants are told the outcome | open | yes |
