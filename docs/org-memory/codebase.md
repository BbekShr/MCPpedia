# Codebase facts

Verified facts about MCPpedia, one dated bullet each, with `file:line` evidence and the
originating cycle/PR. Read before every task; written at the Records step; delete when
falsified; promote hardened facts to CLAUDE.md via human-approved PR. Keep ~120 lines.

## Gates & environment

- 2026-07-16 (bootstrap): The full local bar is green on main — `npx tsc --noEmit` (0 errors),
  `npm run lint` (0 errors, 11 warnings), `npm test` (97/97 in ~1.2s across 9 files).
- 2026-07-17 (S1): CI (`.github/workflows/ci.yml`) runs typecheck → lint → test → build. The
  build step is deliberately env-less: without env the Supabase factories fall back to mock
  clients (lib/supabase/server.ts, public.ts, client.ts) and build-time DB callers skip
  fetching — placeholder Supabase URLs would defeat those guards (comment in ci.yml documents
  it). Still no smoke gate (S3 open).
- 2026-07-17 (S1): The `ci` job carries `timeout-minutes: 15` (.github/workflows/ci.yml) so a
  stalled build-time `next/font/google` fetch (Inter + JetBrains_Mono, app/layout.tsx:2) —
  which has NO timeout in production builds (node_modules/next/.../google/fetch-resource.js:19,
  `timeout = isDev ? 3000 : undefined`) — fails in minutes, not GitHub's 6-hour default.
- 2026-07-17 (S1): Env-less `next build` completes in ~20s in a clean clone (compile ~5s),
  zero Supabase/network activity during prerender — timing baseline for the CI Build step.
  A `git clone` of the local repo faithfully simulates CI (gitignored `.env.local` is absent).
- 2026-07-17 (S1): LATENT TRAP — the `lib/supabase/server.ts` mock (lines 33-67) is thinner
  than the `public.ts` mock: it lacks `maybeSingle/gt/gte/lt/lte/in/not/ilike/overlaps`. Any
  future build-time-reachable server-client caller using those methods would TypeError in the
  env-less CI build while building fine on Vercel. `createAdminClient` (admin.ts:18-20) has no
  env fallback at all — every build-time admin caller must self-guard on env presence.
- 2026-07-16 (bootstrap): Tests live in two places: `__tests__/` (rate-limit, scoring,
  validators, widget-escaping) and `lib/__tests__/` (scoring-all, scoring-security).

## Security & auth

- 2026-07-16 (bootstrap): The rate limiter fails OPEN intentionally — documented trade-off in
  the header comment, lib/rate-limit.ts:1-14; backed by the atomic `check_rate_limit` RPC
  from supabase/migrations/20260417155046_rate_limits.sql.
- 2026-07-16 (bootstrap): `sanitizeSearchQuery` (lib/validators.ts:6-8) strips PostgREST
  filter-syntax injection; required for raw user input reaching `.or()`/`.ilike`.
- 2026-07-16 (bootstrap): Admin routes gate on `profiles.role IN ('maintainer','admin')` —
  reference pattern at app/api/admin/bots/route.ts:61-65.
- 2026-07-16 (bootstrap): proxy.ts gates on Supabase cookie presence (not path) to cut Vercel
  invocations; path-narrowing previously BROKE auth — the file's comment explains why.

## Structure

- 2026-07-16 (bootstrap): ~28 API routes under app/api/**/route.ts; 14 bots in bots/ driven
  by 17 workflow files; bots share helpers in bots/lib/ (bot-run, categorize, github, supabase).
- 2026-07-16 (bootstrap): lib/scoring.ts is ~1,080 lines — the scoring engine; its tests are
  the largest suites (lib/__tests__/scoring-all.test.ts, scoring-security.test.ts).
- 2026-07-16 (bootstrap): Sitemaps are code-generated routes (app/sitemap.xml,
  app/sitemap-servers-{1,2,3}.xml, app/sitemap-static.xml), not static files.

## Audit log (discovery grounds)

_(record "audited <ground> under <lens>: clean" entries here so discovery skips them)_
