# Codebase facts

Verified facts about MCPpedia, one dated bullet each, with `file:line` evidence and the
originating cycle/PR. Read before every task; written at the Records step; delete when
falsified; promote hardened facts to CLAUDE.md via human-approved PR. Keep ~120 lines.

## Gates & environment

- 2026-08-01 (S58): **Supersedes the 2026-07-16 bootstrap baseline below, which is stale.** The
  green bar is `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors, **1** warning),
  `npm test` (**221** in ~1.2s across **16** files as of S48, 2026-08-01 — was 186/13 at S58 and
  208/15 on `main` before S48; this figure moves most cycles, so re-measure rather than trust it).
  The single lint warning is the load-bearing `app/admin/page.tsx:**246**` directive (S2/S7) —
  the line moved from `:245`, recorded here because an off-by-one reads as a new finding. Anyone using "97 tests / 11 warnings"
  as a regression check is comparing against the wrong figures.
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
- 2026-07-18 (S2): ESLint is `@typescript-eslint/no-unused-vars: 'warn'` with NO options
  (node_modules/eslint-config-next/dist/typescript.js:36), so `args` defaults to `'after-used'`
  — an unused parameter positioned before a used one is NOT flagged (why `rawName` in
  app/api/badge/[slug]/route.ts stays unflagged after its only use was deleted).
- 2026-07-18 (S2): TRAP — a `// eslint-disable-next-line react-hooks/exhaustive-deps` can be
  reported as "unused directive" yet still be load-bearing: at app/admin/page.tsx:245 removing
  it surfaces 3 `react-hooks/set-state-in-effect` ERRORS in sibling effects (:223, :233, :239).
  Do not delete a react-hooks disable directive on the "unused" warning alone — run eslint
  without it first. This is the sole residual lint warning; the real fix (effect refactor) is S7.
- 2026-07-18 (S2): The score badge SVG (app/api/badge/[slug]/route.ts `generateScoreSVG`)
  renders a fixed "MCPpedia" label and never interpolates the server name — no user-controlled
  text, so no escaping needed there (unlike the widget at app/api/widget/[slug]/route.ts which
  does escape `server.name`). `ScoreCard` (components/ScoreCard.tsx) renders only in
  app/compare/[slugs]/page.tsx and its `advisories` prop was dead (removed in S2).
- 2026-07-16 (bootstrap): Tests live in two places: `__tests__/` (rate-limit, scoring,
  validators, widget-escaping) and `lib/__tests__/` (scoring-all, scoring-security).
- 2026-07-18 (S4): `generateStaticParams` env guards must key on the env vars of the client the
  page actually renders with. `app/s/[slug]/page.tsx:100` guards on `SUPABASE_SERVICE_ROLE_KEY`
  (uses `createAdminClient`); `app/compare/[slugs]/page.tsx:41` guards on
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (uses `createPublicClient`, whose mock trigger is exactly
  `!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY`, lib/supabase/public.ts:32-36).
  Not a copy-paste inconsistency between the two files.
- 2026-07-18 (S4): The compare route's curated-pair list is read from `data/comparison-pairs.json`
  in three independent places — `generateStaticParams` (app/compare/[slugs]/page.tsx:46), the
  sitemap (lib/sitemap-shared.ts:118-127), and on-demand revalidate (lib/revalidate.ts:10-12).
  The static-params env guard gates only prerendering; the route is ISR (`revalidate = 604800`,
  default `dynamicParams: true`), so `return []` drops build-time prerender only — indexing and
  on-demand serving of real pairs are unaffected.
- 2026-07-18 (S4): Env-less `next build` prints `● /compare/[slugs]` as SSG with ZERO enumerated
  child paths (no `[+N more paths]` line) — the signature of a `generateStaticParams` returning
  `[]`; other SSG routes (`/best/[category]`, `/blog/[slug]`, `/skills/[slug]`) still enumerate
  and summarize children, so an empty compare child set is meaningful, not a print quirk. Full
  env-less build now generates 262 static pages in ~3.9s (compile ~8.8s).

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

## Discovery 2026-07-24 (5-lens hunt, S23–S45 + M3/M4)

- 2026-07-24: Anon per-statement timeout is **3s** (`supabase/migrations/20260430160000_home_stats_snapshot_cache.sql:1-2`);
  prod catalog is **39,409 non-archived** servers. Any full-table scan on the anon role is
  within ~2x of failing — treat 2s+ measured page latency as pre-outage, not "fine".
- 2026-07-24: A page with NO `revalidate` export that queries Supabase is prerendered **once
  per deploy and never refreshed** — prod `/badge` serves `age: 452489` (5.2 days) and still
  says "17,000 servers" (S28). Build-time query failures on such pages are permanent,
  invisible content bugs.
- 2026-07-24: `/servers` and `/category/[category]` are **fully dynamic** in prod
  (`cache-control: private, no-store`, `x-vercel-cache: MISS`, absent from
  `.next/prerender-manifest.json`) because they `await searchParams` before their fetches —
  their `revalidate` exports are inert (S35). `/best/[category]` and `/best-for/[usecase]`
  (no searchParams) are genuine PRERENDER/ISR.
- 2026-07-24: PERMISSIVE-POLICY OR HAZARD, same class as S21 — when a migration RENAMES a
  policy/function, later hardening that `DROP ... IF EXISTS` the OLD name and re-`CREATE`s it
  **adds** a policy instead of replacing it, and Postgres ORs permissive policies, so the
  WEAKER one decides. Live on `profiles` UPDATE (S23). Check `pg_policies` after any such
  migration pair.
- 2026-07-24: `score_security`/`score_total` and friends are `integer default 0`, **NOT
  nullable** (`supabase/migrations/20260402010000_scores_security_registry.sql:6-11`) — every
  `server.score_x ?? fallback` in bots/routes is dead code that silently means 0 (S25).
- 2026-07-24: There are **two** live scoring implementations — `lib/scoring.ts`
  (evidence-summing, 30/25/20/15/10) and the SQL `compute_server_score`
  (subtract-from-ceiling, no tool-poisoning/injection/dep-health terms,
  `20260426120000_fix_scoring_formula.sql:19-26`), still RPC-called by
  `scripts/apply-classifications.ts:197,282` (S42).
- 2026-07-24: `search_servers` is `returns setof servers`
  (`20260719120000_search_servers_filters.sql:21`) — i.e. EVERY column. Any route returning
  its result unprojected bypasses the `PUBLIC_SERVER_FIELDS`/`PUBLIC_CARD_FIELDS` allow-lists
  in `lib/constants.ts:99,113` (S30).
- 2026-07-24: `bots/lib/supabase.ts:fetchAllRows` appends `.range()` pages to a caller-built
  query and therefore **requires the caller to supply a unique tiebreak in `.order()`**;
  `bots/compute-scores.ts:52` does, `bots/detect-duplicates.ts:86` does not (S32).
- 2026-07-24: WHEN HARDENING A QUERY PATTERN, CHECK THE BOT TWIN. The `/analytics` fix
  (keyset + throw-on-error + no `tools`, `app/analytics/page.tsx:500-537`) was never mirrored
  into `bots/snapshot-metrics.ts:17-34`, which still carries all three defects and is the bot
  that PERSISTS `daily_metrics` forever (S24).
- 2026-07-24: The hosted `/mcp` endpoint does not query the DB directly — it self-fetches
  `https://mcppedia.org/api/mcp` over the public internet (`lib/mcp/api.ts:1,86-100`), one
  round trip per tool call, with a per-lambda in-process cache. Any reasoning about `/mcp`
  latency, caching, or rate limiting must account for that hop (S36).
- 2026-07-24: `mcppedia-server/` is a **gitignored sibling checkout**, not part of this repo
  (`.gitignore:46-47`), byte-identical to `lib/mcp/*` except `.js` import suffixes — fixes to
  `lib/mcp/**` do not reach it (M3). CLAUDE.md §3 currently implies otherwise.

### Audit log (discovery grounds)

- 2026-07-24 `app/api/**` (30 route files) × **security**: admin role gates,
  `sanitizeSearchQuery` coverage on `.or()/.ilike`, SSRF in `github-metadata`, SVG escaping in
  `badge`/`widget`, the `/api/revalidate` `timingSafeEqual` comparison, and the
  `vote_and_recount`/`toggle_community_verify` `auth.uid()` guards are **clean**. Residue is
  S23/S30/S31/S39. Noted below the filing bar: `/api/admin/categorize` is a state-changing GET
  (`route.ts:8`) reachable by a maintainer clicking a link (SameSite=Lax) — not filed only
  because the write is rule-derived and roughly idempotent.
- 2026-07-24 `lib/scoring.ts` + `bots/compute-scores.ts` + refresh-score + submit ×
  **correctness**: `SCORE_WEIGHTS` sums to 100 with every sub-score clamped; `scoreMaintenance`
  tier boundaries; `measureTokenEfficiency` grade thresholds; `scoreDocumentation` boundaries;
  `walkSchemaStrings` depth cap; order-independent stability hash; date math (GitHub
  `pushed_at` makes negative/future `daysSinceCommit` unreachable) — all **clean**. Future
  correctness passes can skip the tier tables; the residue is entirely in the CVE/OSV severity
  path and the derived-column writers (S25/S26/S34/S42/S43).
- 2026-07-24 `components/**` markdown-render paths (`InlineMarkdown.tsx:34`,
  `ServerReadme.tsx:91`), the three `dangerouslySetInnerHTML` sites (`app/layout.tsx:54`,
  `lib/seo.tsx:16`, `app/badge/page.tsx:117` — no user/bot data), `lib/compareStore.ts`
  `useSyncExternalStore` snapshot caching, `components/CompareTray.tsx:36-54` keying, and
  `components/ScoreCard.tsx` field coverage × **correctness/regression**: **clean**.
- 2026-07-24 `lib/mcp/resources.ts` URI round-trip, SDK error-to-JSON-RPC conversion, tool
  `outputSchema`/`structuredContent` validation, and the route's `ALLOWED_CATEGORIES` vs
  `lib/constants.ts` `CATEGORIES` × **correctness**: **clean**. Residue is S36-S38/S44/S45.

## Batch 1 fixes, 2026-07-24/25 (S24, S25/S34, S27/S28, S29 — PRs #72–#75)

- 2026-07-25 (S25): Any "was this row previously scanned successfully" predicate must key on
  `last_security_scan`, **never** on `security_scan_status` — all three score writers overwrite
  `security_scan_status` AND `last_security_scan` on every run *including failures*
  (`bots/compute-scores.ts:186-187`, `app/api/server/[slug]/refresh-score/route.ts:180-181`,
  `app/api/submit/route.ts:250-251`), so a status-based predicate is **self-erasing after one
  cycle**. This caused a real regression caught by two review lenses: the fix would have held a
  score for exactly one failed run instead of through an outage.
- 2026-07-25 (S25): `scan_status: 'failed'` on a `SecurityScanResult` means "the OSV.dev query
  failed" specifically (`lib/scoring.ts:736`), never the deps.dev call in
  `checkDependencyHealth` (`:759`). So `dep_health_score` is deliberately written on a failed
  scan while the other evidence-derived columns are skipped — "CVE-derived" and
  "evidence-derived" are NOT the same set. All three writers now carry a comment saying so.
  Also: a package-less server is `'pending'`, never `'failed'` (`:777`).
- 2026-07-25 (S24): A fail-loud data guard in an UNATTENDED bot needs an age bound on whatever it
  compares against, or it converts a one-day anomaly into a permanent outage — the failing run
  writes nothing, so the next run re-reads the identical comparison row and fails identically.
  `bots/snapshot-metrics.ts` bounds its >20% guard to snapshots from the last 3 days, so it
  self-releases after three loud failures. An override env var was rejected: nobody is on call
  for a bot, so an override needing a human is a wedge with extra steps.
- 2026-07-25 (S24): `fetchAllRows` (`bots/lib/supabase.ts:23-68`) paginates by offset and
  explicitly delegates ordering to the caller (doc at :32) — **every** call site needs a unique
  `.order()` or its pages can skip rows. It does handle transient errors properly (4 attempts,
  2s/4s/8s backoff, throws when exhausted, :54-59), which hand-rolled offset loops do not. Four
  callers still pass no ordering at all: filed as S47.
- 2026-07-25 (S29): Validate caller-supplied indices against a **static** ceiling, not a
  DB-derived one, in anything a crawler can hit — a derived read puts the database in front of
  every URL and converts a transient failure into a total outage of that route family. Derived
  counts belong on the build/index path, where ISR serves the last good page on a throw.
  `MAX_SERVER_CHUNKS = 100` in `lib/sitemap-shared.ts` is the DoS bound; `getServerChunkCount()`
  is the coverage number and is clamped to it.
- 2026-07-25 (S29): A cheap env short-circuit must sit **before** the `await import` of the
  Supabase client, not after — that ordering is what keeps a deliberately loud `throw`
  unreachable during the env-less CI build. `lib/sitemap-shared.ts:fetchServerTotal` mirrors the
  mock trigger at `lib/supabase/public.ts:32-36` verbatim (the S4 rule).
- 2026-07-25 (S29): Partial dynamic segments (`foo-[bar].xml/`) are UNUSABLE in this Next
  version — `getRouteRegex` drops the literal prefix/suffix unless `includePrefix`/
  `includeSuffix` are passed, collapsing the route to `^\/([^/]+?)$`, which would swallow every
  top-level path (`node_modules/next/dist/shared/lib/router/utils/route-regex.js:55-70`). Wrap
  the whole folder and rewrite in `next.config.ts`. The rewrite's `:chunk(\d{1,})` custom group
  depends on Next 16.2.2 pinning `path-to-regexp` 6.3.0 — custom groups were removed in v8.
  CORRECTION to the 2026-07-16 bootstrap fact: the server sitemaps are no longer
  `app/sitemap-servers-{1,2,3}.xml` but one derived `app/sitemap-servers/[chunk]/route.ts`.
- 2026-07-25 (S29): `home_stats` can hit Postgres 57014 during `next build` under build-worker
  concurrency — `app/page.tsx:31-34` and `app/security/page.tsx:8-10` both carry
  `export const dynamic = 'force-dynamic'` solely for that. Any new build-time `home_stats`
  caller inherits the risk and needs a non-scanning fallback (`count: 'estimated'`) or the same
  opt-out. Separately, `home_stats()` RETURNS jsonb (a single object, not a set), so it
  destructures as `(data as {total_servers?: number})?.total_servers`, never `data[0]`.
- 2026-07-25 (S27): `?page=` style params reaching a `.range()` need normalizing AND an upper
  clamp — `/servers?page=abc` previously produced `range(NaN, NaN)` and `?page=-5` a negative
  range. `MAX_OFFSET = 10_000` matches the cap S16 put on `/api/v1/servers`.
- 2026-07-25 (S27): TRAP — Next 16 forbids exporting both a `metadata` object and a
  `generateMetadata` function from one route segment, so adding per-page `robots` to a page with
  static metadata forces the conversion.
- 2026-07-25 (gates): **zsh's `PIPESTATUS` is 1-indexed**, so `${PIPESTATUS[0]}` after a piped
  gate command silently prints EMPTY — a gate exit code read that way is not evidence and a red
  gate can read as green. Use `${pipestatus[1]}`, or redirect to a file and read `$?`. Hit twice
  by qa-verifier this cycle.
- 2026-07-25 (gates): `npx next start -p <port>` + `curl 127.0.0.1` is a working local route gate
  for this repo (no smoke gate exists — S3): ready in ~1.6s, probes MUST be in a Bash call
  separate from the launch (same-call probes return `000`), clean up with
  `lsof -ti :PORT | xargs -r kill`. This is the ONLY way to verify `next.config.ts` rewrites,
  which do not resolve without a real server. Worktrees have no `node_modules` and no
  `.env.local`, so a worktree build faithfully reproduces env-less CI.
- 2026-07-25 (S24): The bot fleet has **zero test coverage** — no file under `__tests__/` or
  `lib/__tests__/` references anything in `bots/`. Every bot fix ships on typecheck + lint +
  review alone, and a first bot test needs a new Supabase-client mock harness, not just a case.

## Issue triage 2026-07-25 (first `issues` intake — S55–S57, GH #70/#68/#25)

- 2026-07-25 (process): GitHub issues were an **unread input** until this cycle — nothing in
  `CLAUDE.md`, the skill, or any agent told the org to look at them, so three open reports sat
  for 1–7 days while discovery hunted the same subsystems from the inside. The `issues` mode and
  the untrusted-input screen in `.claude/skills/improve-cycle/SKILL.md` close that. The screen
  exists because an issue is the highest-risk text this org ingests: it is authored by whoever
  wants something from us and arrives already shaped like a work order. Three checks —
  injection (text aimed at the agent), adverse-to-project (self-serving asks, score inflation,
  protected-path or gate changes), cost spike (catalog-wide rescans, per-request LLM calls,
  cron frequency, cache/rate-limit removal).
- 2026-07-25 (triage precedent): in all three issues the reporter was right about the SYMPTOM and
  wrong about the cause or the magnitude — #70's "up to 31 points" is really 29-39 and its
  security component is clamped, #68's "OAuth is broken" is a client-side `getUser()` with no
  loading state (the cookie/middleware layer is clean), #25's dedup-collision guess was fixed in
  code months ago (`dfc0beb`) leaving only a data-repair question. Always spawn a `bug-hunter` to
  CONFIRM-or-REFUTE rather than planning off the report.
- 2026-07-25 (issue #68, self-serving-ask precedent): the reporter supplied a block of "canonical
  metadata" for their own product and asked us to write it in. Correct handling per CLAUDE.md §4
  is to treat it as a lead, verify against the registry/repo, and fix the PIPELINE that generated
  the wrong copy (S57) rather than hand-editing the one row — a one-row edit would leave every
  other hosted remote server misdescribed and would set the precedent that a publisher can
  dictate their own page's content.
- 2026-07-25 (`bots/sync-registry.ts`): the registry's `remotes[].url` is **discarded** at
  `:130` (only `transport` is kept) and the `RegistryServer` type at `:30-33` has no field for
  declared headers/secrets at all; the insert at `:207-231` never sets `has_authentication` or
  `requires_api_key`. So MCPpedia structurally cannot describe a hosted remote server, and
  `components/ServerFAQ.tsx:12-18` converts that absent data into the positive claim "It does not
  require authentication" — which `app/s/[slug]/page.tsx:195` ships as `FAQPage` JSON-LD.
- 2026-07-25 (missing-data-as-verdict is a recurring class, not three bugs): S55 (empty `tools`
  → 29-39 points withheld and rendered as a security/efficiency grade), S57 (absent auth data →
  "does not require authentication"), S43 (`dangerous_pattern_count` from `max_points - points`)
  and S26 (unparseable CVSS → `info` → zero penalty) are all the same defect shape — a
  no-data case flowing into a code path that only knows how to express a finding. Worth a
  dedicated hunting lens: for every derived field, what does it say when the input is absent?
- 2026-07-25 (`components/Nav.tsx:22,35` is the reference auth pattern): it is the ONLY client
  component pairing `getUser()` with `onAuthStateChange`. `getUser()` is a NETWORK call whose
  errors return `user: null`, and it can additionally REJECT on a Web-Locks timeout
  (`NavigatorLockAcquireTimeoutError` is not an `AuthError`, so it is re-thrown) — every bare
  `supabase.auth.getUser().then(...)` in this repo is therefore both a false-signed-out site and
  an unhandled-rejection site. Six such sites remain outside S56's scope.
- 2026-07-25 (clean sub-audit): all 16 `.limit(` sites in `bots/` were checked for a paired
  `.order()`. Only `bots/extract-schemas.ts:165` lacks one (S55); `bots/freshness-probe.ts:25` is
  provably safe (`home_stats_cache` is structurally single-row). This closes the gap S47's
  `fetchAllRows`-scoped grep left open.
- 2026-07-25 (`bots/sync-registry.ts` — registry schema drift, S58): verified against the live
  `v0.1` endpoint the bot polls. Records are `{server, _meta}` where the server object declares
  `$schema: https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json` and has
  keys `[$schema, name, description, title, version, repository, packages, remotes]` — **there is
  no `id` field at all**. `packages[]` uses `registryType`/`identifier` (not `registry_name`/
  `name`), `remotes[]` uses `type`/`url`/`headers` (not a `transport` array), `version` is flat
  (not `version_detail.version`), and status/`isLatest` live under
  `_meta["io.modelcontextprotocol.registry/official"]`. Pagination is `metadata.nextCursor` with
  30 records/page. The bot's `RegistryServer` type (`:20-34`) matches NONE of this except
  `name`/`description`/`repository`. Capture a fixture from the live API before touching this
  file — the drift was invisible to typecheck, lint and tests because the response is parsed as
  `any` at `:64`.
- 2026-07-25 (why the drift was silent): registry sync fails OPEN in every direction — a missing
  field yields `undefined` → a NULL column, never an error. `registry_id` has been NULL for every
  row for long enough that `getExistingRegistryIds()` returns an empty set, which makes the
  already-synced fast path unreachable and hides the symptom. Lesson: for any bot parsing a
  third-party schema, "mapped 0 of N records to a package" is the signal that must turn a run
  red; row counts alone cannot distinguish drift from an empty upstream.

## Admin categorize & bulk `servers` writes (2026-08-01, S59)

- 2026-08-01 (S59): **`app/api/admin/categorize/route.ts` had NEVER done work in production.** `categories.eq.[]` is a malformed Postgres array literal (`servers.categories` is `text[]`, `20260402000000_initial_schema.sql:52`), so PostgREST errored, the swallowed error left `data` null, the walk broke, and `total === 0` rendered as "All servers already categorized". Anything reasoning about category coverage must treat this endpoint as never having run — `bots/extract-install-info.ts:152` is the only path that has actually written categories, and it is gated on `.not('github_url','is',null)`.
- 2026-08-01 (S59): **A fix that repairs a broken predicate ACTIVATES the loop below it.** Every defect inside this route's processing body was dead code until the predicate was corrected, so the one-line fix had to ship with a review of the body it woke up (an unbounded serial write loop with no `maxDuration`, and swallowed per-row write errors). Rule of thumb: a predicate-level fix is never a one-line change — scope the body it activates.
- 2026-08-01 (S59): **Every `servers` UPDATE pays a hidden audit-trigger cost.** `servers_audit` is a per-row AFTER trigger (`20260416010000_server_changes_audit.sql:96-99`) that `to_jsonb`s BOTH whole rows — including `description`, the `tools` jsonb and `fts` — and loops 23 audited fields (`:61-68`), inserting into `server_changes` per changed field. `categories` is in that list. Any row-count budget for a bulk `servers` writer that counts only round-trip latency is an underestimate.
- 2026-08-01 (S59): The empty-`text[]` predicate is `categories.eq.{}`, never `[]`. Note `install_configs.eq.{}` (`bots/extract-install-info.ts:150`) is correct for a DIFFERENT reason — `install_configs` is `jsonb default '{}'` (`20260402000000_initial_schema.sql:26`), not `text[]` — so it is NOT a type precedent for the array-literal question. `grep -rn 'eq\.\[\]' --include='*.ts'` now returns zero; any future hit is a regression.
- 2026-08-01 (S59): `.or()` in postgrest-js appends the filter string verbatim into a `URLSearchParams` (`node_modules/@supabase/postgrest-js/dist/index.cjs:2763-2766`). Braces are safe inside an `or` group because only `,` and `()` are delimiters — so `col.eq.{}` is valid, but `col.eq.{a,b}` needs the value quoted (the hazard documented at `bots/extract-install-info.ts:144-147`).
- 2026-08-01 (S59): **Bound a "process rows matching X, then make them not match X" endpoint by requesting `cap + 1` rows and testing `length > cap`**, not by an offset walk. The walk's later offsets shift as rows leave the result set mid-run, so it can skip rows, and "more remain" becomes an inference rather than a fact. Note `.range(a, b)` is INCLUSIVE of `b`, so `.range(0, N)` requests `N + 1`.
- 2026-08-01 (S59): `bots/lib/categorize.ts:325` never returns an empty array (`['other']` fallback) and costs **zero API calls** (pure keyword matching, no LLM). So any categorize walk converges and repeated operator clicks are safe and cheap.
- 2026-08-01 (S59): **An SSE client that treats stream-end as success cannot see a `maxDuration` kill.** `app/admin/page.tsx`'s reader loop broke on `done` and re-enabled the button, leaving `catResult` null and the progress bar frozen — server-side bounding alone does not fix this; the client must track whether a terminal (`done`/`error`) frame actually arrived. Applies to any future SSE route written this way.
- 2026-08-01 (S59): **`maxDuration` above the Vercel Hobby ceiling fails the VERCEL build, not the local one** — it would block all deploys off `main` (the S50 incident shape). It IS checkable locally without deploying: `.next/server/functions-config-manifest.json` carries the compiled per-route value. 60 is legal on every plan; grep that artifact rather than trusting the source export.

## Advisories & the OSV scan path (2026-08-01, S51)

- 2026-08-01 (S51): **`scan_status: 'failed'` does NOT imply an empty advisory array.** `anyFailed` ORs the npm and PyPI query statuses (`lib/scoring.ts:853`) while `collectAdvisories` processes whichever `osvResults` entry is non-null (`:315-316`), so a DUAL-PACKAGE server whose npm query succeeds and PyPI query fails returns `'failed'` WITH real advisories. Any "on failure there's nothing to write" shortcut is wrong for that shape.
- 2026-08-01 (S51): **The advisory upsert is a CLOSING operation, not only an appending one.** `collectAdvisories` sets `status: fixedEvent?.fixed ? 'fixed' : 'open'` (`lib/scoring.ts:309`) and the upsert uses `ignoreDuplicates:false` on `(server_id, cve_id)`, so an upsert can flip an existing `open` row to `fixed`. "Upsert-only is safe" is FALSE for this table — a `scanStatus === 'failed'` guard must sit above the upsert, not merely above the `.update()`.
- 2026-08-01 (S51): **`scan_status: 'pending'` is USER-reachable, not a bot-only state.** With both packages null `scanSecurity` issues zero OSV queries (`lib/scoring.ts:849-854`), and `app/s/[slug]/edit/page.tsx:157,264-272` lets a maintainer write `npm_package` straight from the browser under the blanket RLS policy. Treat `'pending'` as "no evidence", never as "cleared", on any user-triggered path. This is why `lib/advisories.ts` takes a required `closeOn` policy: routes pass `'success'`, only the unattended bot passes `'success-or-pending'`.
- 2026-08-01 (S51): **`/s/[slug]` renders open-CVE counts from the advisory ROWS, not from `servers.cve_count`** — `components/server/Hero.tsx:36` filters `status === 'open'` while `components/server/SecurityPanel.tsx:138` reads `server.cve_count`. A writer that updates one without the other makes a single page contradict itself. `home_stats.open_cves`, `/security`, the homepage feed and `daily_metrics.open_cves` all follow the rows.
- 2026-08-01 (S51): `security_advisories` carries **only a SELECT RLS policy** (`20260402010000_scores_security_registry.sql:58-61`) and has **no audit trigger** — every write is service-role-only and unattributed. `refresh-score` stamps `score_computed_at` (`route.ts:171`), removing the row from `bots/compute-scores.ts`'s stale filter for `SCORE_STALE_DAYS` = 7, so "the bot will fix it tomorrow" is false for anything that route touches.
- 2026-08-01 (S51): After this cycle there is exactly ONE advisory writer, `lib/advisories.ts`; every other `security_advisories` touch in `app/`/`bots/`/`lib/` is a read. The exception is `scripts/apply-classifications.ts:263` (hand-curation), whose curated `severity`/`status` are silently clobbered by the next scan's upsert — pre-existing, unfiled.

## Build & gate recipes (2026-08-01, S51)

- 2026-08-01 (S51): **`env -u VAR npm run build` does NOT suppress `.env.local` — it ENABLES it.** `@next/env` skips a dotenv key only when that key is already defined in the initial process env, so unsetting it hands control back to the dotenv file. Measured three ways: plain and `env -u` both yield the real 40-char Supabase URL; only empty-string assignment yields `''`. **The only correct env-less recipe is `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_URL= npm run build`.** Using the wrong one costs real Supabase egress against the 5 GB free-plan ceiling.
- 2026-08-01 (S51): **Cheap post-hoc proof a build was truly env-less:** `.next/prerender-manifest.json` must show 0 `/s/` and 0 `/compare/` routes while `/blog` (~62) and `/skills` (~91) still enumerate — those two are the only DB-derived param sets. Env-less totals this run: 259 static pages / 210 manifest routes in ~14s. (Supersedes the older "262 pages" figure.)
- 2026-08-01 (S51): `lib/advisories.ts` is runtime-dependency-free — its `./scoring` imports are `import type` only — so it can be loaded standalone via `node_modules/jiti` from a scratchpad `.cjs` with a fake recording client. The repo has no `tsx`/`ts-node`; `jiti`, `tsc` and `vitest` are the available loaders. This is how the `scanStatus`/`closeOn` policy matrix was verified empirically without adding a repo file.

## Registry sync & the MCP registry API (2026-08-01, S58)

- 2026-08-01 (S58): The official registry serves schema `2025-12-11` at
  `https://registry.modelcontextprotocol.io/v0.1/servers?version=latest`. The server object has
  **no `id`** — the only stable identity is the bare `name` (e.g. `ac.inference.sh/mcp`), which
  `servers.registry_id` now stores. `version` is flat (not `version_detail.version`);
  `remotes[].type` is a STRING (not `transport: string[]`); `packages[]` uses
  `registryType`/`identifier`; and `_meta["io.modelcontextprotocol.registry/official"]` carries
  `status` + `isLatest`. Measured over 180-240 live records: page size 30, status distribution
  `{active: 178, deprecated: 2}`, `isLatest === false` NEVER appears under `?version=latest`,
  transports skew http ~135 / stdio ~48 / sse ~4, and ~25% of records carry a mappable npm/pip
  package. A future run showing a non-empty `unmappedTransports` or any `not-latest` skip is
  genuine upstream drift.
- 2026-08-01 (S58): **The registry's stdio signal lives at `packages[].transport = {"type":"stdio"}`,
  not in `remotes[]`.** Missing this is why the old parser defaulted everything to `['stdio']`.
- 2026-08-01 (S58): Roughly **half of live registry records carry no `repository.url`** (3 of 6 in
  `lib/__tests__/fixtures/registry-servers.json`). Combined with `main`'s dead `registry_id` fast
  path, `main` inserts a duplicate row per repo-less entry per night up to `slug-4`. The repo-less
  case is the MAJORITY path in this bot, not an edge case.
- 2026-08-01 (S58): `bots/sync-registry.ts` is the **sole writer** of `servers.registry_id` and
  `registry_verified` in the whole repo — every other hit is a read (`lib/types.ts:79,81`,
  `components/server/Hero.tsx:175`, `components/server/ScorePanel.tsx:94`). Registry-identity
  reasoning only has to trace one file.
- 2026-08-01 (S58): The `is_archived` read filters in `bots/sync-registry.ts` are **asymmetric on
  purpose**: filter on the `registry_id` map read, NONE on the two `github_url` reads. Filtering
  both drops still-listed archived servers into the INSERT branch (the slug probe has no archived
  filter either) and resurrects them as `-2`/`-3`/`-4` night after night; filtering neither binds
  registry identities to invisible duplicate rows, because `bots/detect-duplicates.ts:255` archives
  by setting `is_archived` ALONE (the row keeps `github_url`/`registry_id`) and
  `lib/curated-merge.ts` `CURATED_FIELDS` does not carry `registry_id` to the keeper. Two S58
  review rounds each broke one half of this. `is_archived` has four independent writers:
  `detect-duplicates.ts:255`, `update-metadata.ts:122`, `check-broken-links.ts:88`,
  `app/api/admin/archive/route.ts:45` — and an archived row often has NO live twin.
- 2026-08-01 (S58): `servers.registry_id` has **no index and no unique constraint**
  (`supabase/migrations/20260402010000_scores_security_registry.sql:28`, plain nullable `text`), and
  `servers.github_url` has **no index of any kind** (the trigram indexes at
  `20260417210424_hot_query_indexes.sql:10-18` cover only `name`/`tagline`/`description`). So
  `.ilike('github_url','%…%')` is a full seq scan of ~63k rows per call, and "two live rows share
  one registry_id" is a silent self-perpetuating state rather than a caught error — `new Map(...)`
  resolves the collision by whichever UUID sorts last. See S61.

## Language & tooling traps (2026-08-01, S58)

- 2026-08-01 (S58): A `Record<string, X>` **object-literal** lookup keyed by untrusted input returns
  inherited members, and TypeScript types the result as `X`: `MAP['constructor']` is truthy and
  passes an `if (hit)` guard. Any string→enum map fed by third-party text needs `Object.hasOwn` or
  `Object.create(null)`. Found live in `deriveTransports` — a hostile `remotes[].type: "constructor"`
  wrote `{NULL}` into the `transport` text[].
- 2026-08-01 (S58): The prototype guard is only half the fix — the **fallback** is the other half.
  "No type string was read" and "nothing was declared" are different facts, and only the second
  justifies defaulting to `['stdio']`. Defaulting on the first fabricates a LOCAL server for a
  remote-only entry, worth +4 in BOTH scorers (`lib/scoring.ts:1104`,
  `20260402010000_scores_security_registry.sql:155`), invisible to a package-based drift guard.
- 2026-08-01 (S58): The Supabase JS client **resolves rather than throws** on a failed `.update()`,
  so a bot that does not destructure `error` reports optimistic counters as fact. `sync-registry`
  reported up to ~39k "updated" per night with no evidence any write landed. See S66.
- 2026-08-01 (S58): `npx tsx -e` cannot run top-level `await` (esbuild emits CJS and hard-errors),
  and a scratch `.ts` under the session scratchpad is outside the repo's `type: module` scope so it
  fails identically. Wrap probe scripts in `async function main(){...} main()`, or use `.mts`.
  Vitest 4 also swallows `console.log` by default — `--silent=false --reporter=verbose` to see it.
- 2026-08-01 (S58): Bot logic becomes testable by extracting the **decision** into `lib/`, not by
  restructuring the bot: every bot builds an admin client and calls `main()` at module scope, so it
  cannot be imported. `lib/registry-schema.ts` is the first testable seam in the bot fleet (which
  previously had zero coverage), following the `lib/curated-merge.ts` ← `bots/detect-duplicates.ts`
  precedent. `app/api/admin/bots/route.ts` references bots by string workflow name, never by import,
  so bot-adjacent `lib/` modules stay out of the `next build` surface — re-confirm per commit.

## Edits, auto-approve & the trust gate (2026-08-01, S48)

- The converged `edits` RLS set is exactly four policies and — unlike `profiles` (S23) or
  `search_servers` (S21) — carries **no permissive-OR hazard**: SELECT `using (true)`
  (`20260402000000_initial_schema.sql:316-317`), ONE INSERT pinning
  `auth.uid() = user_id AND status = 'pending'` (`20260610000000_security_hardening.sql:28-35`),
  ONE UPDATE for `editor|admin|maintainer` with `WITH CHECK … AND status IN ('approved','rejected')`
  (`20260417210403_tighten_admin_rls.sql:28-37`), and **no DELETE policy at all**. Both hardening
  re-`CREATE`s reused the exact prior policy name, so no weaker sibling survives.
- Corollary nobody had recorded: that UPDATE `WITH CHECK` makes writing `status = 'pending'`
  **impossible for every role**. Any "return this edit to the moderation queue" recovery path on
  a user-scoped client is dead code whatever its role gate — it must use the service role.
- **A trust count derived from a table the trusting route itself writes to is self-feeding unless
  it filters on WHO granted the approval.** `reviewed_by` is that discriminator here:
  `app/api/edit/route.ts` writes `null` on the auto path, `app/api/admin/approve-edit/route.ts:152`
  writes `user.id` on the moderator path. Without `.not('reviewed_by','is',null)` every
  auto-approved edit raises the very threshold that authorized it, so trust becomes irrevocable —
  a moderator cannot withdraw it, because abusive edits never queue.
- `/api/admin/verify` and `/api/admin/archive` write `status:'approved'` audit rows into `edits`
  credited to the **acting maintainer** (`verify/route.ts:52-62`, `archive/route.ts:60-70`). Any
  query reading "approved edits by user X" as "contributions X made that were reviewed"
  over-counts for anyone who has ever held `maintainer`/`admin` — including
  `sync_edits_approved` and the `20260725000000:232-240` backfill.
- An `edits` INSERT with `status='approved'` fires **two** triggers in one statement and awards
  **+6** karma, not +5: `trg_award_edit_events` emits `edit_proposed` (+1) *and* `edit_approved`
  (+5) on the INSERT arm (`20260421030000_karma.sql:121-129`), while `trg_sync_edits_approved`
  bumps `profiles.edits_approved` (`20260421000000_sync_profile_counters.sql:66-71`). A
  status→`pending` UPDATE reverses exactly −5/−1, so insert+revert nets the same +1 as an
  ordinary proposal. Both triggers are `SECURITY DEFINER` and key on `NEW.user_id`, never
  `auth.uid()` — which is the precondition that makes moving an `edits` write to the service
  role attribution-safe.
- The S23 stale `profiles` UPDATE policy **froze `role` and `created_at`** and leaked only the
  counter columns (`20260725000000:14-36`). So `profiles.role` was NOT forgeable under either
  RLS state — reasoning that lumps `role` in with `karma`/`edits_approved` as "S23-forgeable"
  is wrong.
- `edits` is **append-only** (eleven `from('edits')` sites across `app/`/`lib/`/`bots/`/`scripts/`,
  zero deletes) and unindexed on `user_id` (only `edits_server_idx`, `edits_status_idx` —
  `20260402000000_initial_schema.sql:131-132`), so any `.eq('user_id', …)` predicate on it is
  O(table) forever. Filed as S75. `edits.user_id` has **two** FKs — the second,
  `edits_user_id_profile_fkey → public.profiles` (`20260502120000:10-13`), exists solely so
  PostgREST can embed, which makes a `profiles → edits(count)` embedded count available for
  folding per-user aggregates into an existing round trip.
- `app/admin/page.tsx:155` is the *only* moderation-queue fetch and has **no status filter** —
  `select('*') … order(created_at desc).limit(50)` over all of `edits`. Any writer that adds
  non-`pending` rows silently shrinks the visible queue while the sidebar badge (`:206-212`, an
  exact count on `status='pending'`) stays right; the two disagreeing is the symptom. Filed as S73.
- `head: true` genuinely sends no body — supabase-js sets `method = 'HEAD'` and parses the count
  from the `content-range` response header, so a head-only count costs ~300-500 B of response
  headers and zero row egress. Conversely `count: 'planned'`/`'estimated'` on a column with no
  index and no per-value stats returns a **table-wide average**, which for a per-user gate would
  hand a brand-new user everyone else's average — an exactness requirement, not a preference.
## Caching, listings & the retry envelope (2026-08-01, S60)

- **`unstable_cache` caches DATA, not the rendered response, so it can never move `x-vercel-cache` off
  `MISS`.** A page that awaits `searchParams` is dynamic (`node_modules/next/dist/docs/01-app/
  03-api-reference/03-file-conventions/page.md:119`) and dynamic pages are served
  `private, no-cache, no-store, max-age=0, must-revalidate` (`.../02-guides/cdn-caching.md:24`).
  Internally `unstable-cache.js:135-141` handles `workUnitStore.type === 'request'` with a bare
  `break`, propagating no `revalidate` to the work store. The `/category` fix (PR #82, `6042fc1`)
  left `await searchParams` at `:153` BEFORE the cached call at `:174` and is still dynamic.
  Acceptance criteria phrased as "verify via `x-vercel-cache`" for this pattern are unmeetable by
  construction — the live wording in BACKLOG rows S35 and S60 is flagged for a human re-word.
- **The house cache pattern is a three-layer sandwich and the middle layer is the safety property:**
  `unstable_cache(args => withRetry(() => fetch(args)), ['key-vN'], {revalidate, tags})`, where
  `fetch` THROWS on any Supabase error and the caller degrades in a `try/catch`. `unstable_cache`
  only persists successful returns (`unstable-cache.js:206,214`), so a fetcher that returns `[]` on
  error pins the degraded empty page for the whole TTL. Converting a "set `loadFailed`, return
  empty" page to a cached one is therefore never just a wrap — **the error contract must invert
  first**. Documented at `lib/retry.ts:1-15`, `app/security/page.tsx:85-88`.
- **Normalizing the argument shape is necessary but NOT sufficient for cache safety.** The key is
  `cb.toString() + keyParts + JSON.stringify(args)` (`unstable-cache.js:55,81`), so a single
  free-text field left in the args object reopens unbounded, attacker-writable key minting on an
  unrate-limited page route. The second gate must be a **predicate at the call site** deciding
  whether the cache is entered at all — `isCacheableQuery` in `lib/servers-query.ts`, applied in
  `app/servers/page.tsx`. `/servers` and `/category` have NO rate limiting; `/api/search` limits the
  same `search_servers` RPC to 30/min/IP.
- **Cache-key normalization is only safe when it is result-preserving.** An out-of-allow-list FILTER
  value means "matches nothing", not "no filter" — `?status=zzz` becomes `.eq('health_status','zzz')`
  → zero rows, while `?status=` returns the whole catalog. Collapsing unknown filter values onto `''`
  would silently turn a typo into "show everything". Sort is different (unknown ≡ default) but must be
  **branch-aware**: `search_servers` has NO `commit` arm and every unrecognized `sort_by` falls
  through to the trailing `s.github_stars desc nulls last`
  (`20260719120000_search_servers_filters.sql:38-44`), so in the search branch `{commit, unknown} ≡
  'stars'` and `'' ≡ 'relevance'`, while the catalog branch's arms are a different set entirely.
- **`count: 'estimated'` is a planner estimate, not a row count.** A PostgREST-filtered query matching
  zero rows can still return a large `count`, which `/servers` and `/category` turn into a phantom
  header total plus a live pagination block above an empty list. "Zero rows ⇒ `totalCount === 0`" is
  wrong on both pages. Filed as S80.
- **`withDeadline` takes a `PromiseLike`, not a thunk** (`lib/retry.ts:28`), which is what makes
  `withDeadline(withRetry(fn, opts), ms, label)` the correct idiom rather than an accident — the retry
  promise is constructed eagerly and then raced, so the deadline bounds the ENTIRE retry loop. Bare
  `withRetry` defaults to 4 attempts + 1.75s of backoff and does not distinguish transient from
  permanent failures; against the 3s anon statement timeout that is a ~13.75s worst case AND a 4x
  retry storm into an already-failing database. Remaining bare sites filed as S78.
- **A sibling `loading.tsx` changes what a slow server fetch MEANS.** Next commits 200 + shell and
  streams, so an overrun is a permanently stuck skeleton, not a 504, and `app/error.tsx` can no longer
  fire — the in-page degraded panel only renders if the render COMPLETES. `app/servers/loading.tsx`
  exists, which is why the latency budget there is a correctness constraint, not a perf one.
- **Next hands `searchParams` a `string[]` for repeated query keys**, but the pages type it
  `Record<string, string | undefined>` — a runtime lie. An array reaching `.contains(col, [param])`
  becomes `cs.{a,b}` (an accidental AND-of-two-values); an array reaching a `text` RPC param errors
  outright. `lib/servers-query.ts`'s `first()` is the first fix of this class in the repo.
- **`.next/prerender-manifest.json` has TWO route maps** and the difference is exactly 7 here:
  `routes` = 210 concrete prerendered paths, `dynamicRoutes` = 7 ISR *templates* (`/best/[category]`,
  `/best-for/[usecase]`, `/blog/[slug]`, `/compare/[slugs]`, `/guides/[slug]`, `/s/[slug]`,
  `/skills/[slug]`). Templates are emitted for every ISR segment regardless of whether
  `generateStaticParams` returned anything, so `/s/[slug]` and `/compare/[slugs]` appear there even in
  a provably env-less build with zero concrete children. **The env-less proof must count `routes`
  only** — `routes + dynamicRoutes` reads as 217 and looks like 7 phantom DB-derived pages.
- `revalidateTag` is called **nowhere** in this repo — every `tags:` array on the four `unstable_cache`
  sites is decorative. The only invalidation is `revalidatePath` in `lib/revalidate.ts` and
  `app/api/revalidate/route.ts` (defaults `['/', '/security']`). Listings are time-based only.

## Homepage degrade incident + test harnesses (2026-08-01, S34/S37/S39/S43/S44 + hotfix #100)

- **A `liveDataOrNull` budget shorter than its fetcher's cold time is a PERMANENT degrade, not a slow
  first request.** `lib/degrade.ts` used to claim a late success still populates the cache so the next
  request serves the real page. That is a long-lived-Node property and is FALSE on Vercel serverless:
  the instance is frozen once the response returns, so the in-flight fetch never completes,
  `unstable_cache` never receives a successful return, and every request repeats the failure. This is
  why `/` stayed degraded on 2026-08-01 instead of healing after one request. Corrected in PR #100.
- **Measured homepage cold costs (2026-08-01, against prod).** `fetchHomeData` = 7 parallel round
  trips: `home_stats` 0.15s, mcppedia card 0.21s, topScored 0.17s, trending 0.21s — all cheap;
  `home_use_cases` **1.83s alone / 3.29s contended**, `home_category_counts` **1.39s / 3.29s
  contended** (aggregate RPCs over ~46k servers); `security_advisories` **1.81s** vs **0.41s** without
  `nullsFirst: false`. The two aggregates roughly DOUBLE when run concurrently with each other — so
  `Promise.all` does not make them free, and total cold cost is far above the max of the parts.
- **`security_advisories` has 27,405 rows, ZERO of them with a null `published_at`, and no index on
  `published_at`.** So `.order('published_at', {ascending:false, nullsFirst:false})` bought nothing at
  all while forcing a full sort — the S54 trap, at the exact call site S54 named as un-audited
  (`app/page.tsx`). Confirming "are there actually any nulls?" before assuming `nullsFirst: false` is
  load-bearing takes one head-count query and settled this in seconds.
- **The DB being healthy and a page being degraded are entirely compatible.** During the incident
  `/api/v1/servers` and `/api/search` returned real data in ~1s and `/servers`, `/security`,
  `/analytics` all rendered — only `/` was broken. Probe per-page and per-query before concluding
  "the database is down"; the degraded copy says "the database is not reachable" and that text is a
  guess by the component, not a diagnosis.
- **`registerTools` is a testable seam without exporting anything.** `lib/mcp/tools.ts`'s
  `registerTools(server)` touches its argument ONLY via `server.registerTool` (7 call sites;
  `lib/mcp/resources.ts` owns resources separately), and only `get_install_config`'s handler uses the
  `extra` second arg. So passing a fake `McpServer` that captures handlers reaches every real tool
  handler — the route into `lib/mcp/tools.ts`, which previously had zero direct coverage. Re-check the
  invariant before adding any non-`registerTool` call.
- **A route-level mock of a filtering RPC must model filter-then-limit ordering or it cannot detect the
  bug class at all.** `search_servers` applies `min_score_filter` in the WHERE clause
  (`20260719120000_search_servers_filters.sql:34`) and `limit page_size` afterwards (`:45-46`); a fake
  returning a constant array passes identically against pre- and post-fix code. Same shape applies to
  the still-untested `transport_filter`/`author_filter`.
- **Pinning a pure helper's return value is NOT coverage of its call site.** `lib/score-merge.ts` was
  fully unit-tested while `app/api/server/[slug]/refresh-score/route.ts:165` was free to ignore the
  helper's `score_total` and recompute a naive sum — the whole suite stayed green under that mutation.
  Route tests must assert the DERIVED fields in the write payload, not just the guarded spread.
- **Route response bodies were entirely unasserted before 2026-08-01** — `refresh-score-advisories`
  read only `res.status` across all six original cases. `await expect(res.json()).resolves
  .toMatchObject({...})` works against a real `NextResponse` under vitest with no extra harness.
- **Vitest 4.1.4 supports `--sequence.shuffle=true --sequence.seed=<n>`**, so order-independence of a
  suite with module-level mutable state is directly verifiable rather than assumed. Four seeds
  (1/42/1337/999) each produced a distinct ordering of `refresh-score-advisories.test.ts`, 8/8 green.
- **A mutation harness must assert its anchor matched exactly once before writing.** Two of thirteen
  mutations silently failed to anchor on an indentation mismatch; without a `count(old) == 1` assert
  that reads as "mutation survived — the fix is unpinned", i.e. a false FAIL.

## 2026-08-01 — S31 / S32 / M12 (test-residual closure)

- **The route-level Supabase write-test harness is now ONE shared module**, `__tests__/helpers/route-supabase-stub.ts` (closes M12). It is the union of the two former copies, with the behaviours they disagreed on behind DEFAULT-OFF flags: `trackClient` (tag every recorded call `authed`/`admin`) and `keyByWriteOp` (key resolves by write verb). Default-off matters — `refresh-score-advisories.test.ts:171` asserts `toContainEqual({table, op, args})`, which is deep equality, so merely ADDING a `client` key to every recorded call would break an assertion that reads as untouched. Vitest's default `include` (`**/*.{test,spec}.*`) does not collect the helper as an empty suite.
- **`keyByWriteOp` is needed ONLY when one builder sees a write verb before a `.single()`** — an `insert().select().single()` chain (`__tests__/edit-auto-approve.test.ts:57`). Reading and writing the same table in one request needs nothing, because `makeBuilder` is invoked per `from()` call and `writeOp` is builder-local.
- **Per-terminator miss defaults are load-bearing**: a resolve-key miss yields `data: null` under `.single()` and `data: []` under a plain `await`. Before this, every miss returned `[]` — which is TRUTHY, so `if (!row) return 404` was unreachable in any test built on the harness, and the next guard's status came back instead (409 at `app/api/admin/approve-edit/route.ts:53-59`, 403 at `:31`). An author would then "fix" the failing 404 assertion to match the stub artefact.
- **Harness state a suite mutates mid-test must be cleared in `reset()`.** `authUser.current` was not, and two suites null it for their 401 cases; the resulting order-dependence produces PASSING vacuous assertions (empty `calls` ⇒ `expect(...).toEqual([])` succeeds), which `--sequence.shuffle` only catches if the seed reorders within the file.
- **`bots/detect-duplicates.ts`'s keeper rule lives in SQL, not JS.** `keep = group[0]` is correct only because of `.order('data_quality', {ascending:false, nullsFirst:false}).order('id')` (`:144-149`), carried through by `Map` insertion order. `lib/duplicate-groups.ts` must NEVER sort — a sort there silently changes which row survives an irreversible archive. Third bot-logic extraction into `lib/` after `lib/curated-merge.ts` and `lib/registry-schema.ts`; `bots/**` still has zero direct test coverage, so this remains the only way to test bot decisions.
- **Distinguish a surviving mutant from an EQUIVALENT one before reporting a coverage gap.** `MONOREPO_URLS.map(normalizeGithubUrl)` is a present-day no-op — 0 of 9 literals differ under normalization — so removing it is unobservable by construction and no test can catch it. The guard against a FUTURE de-normalized entry is a direct `normalizeGithubUrl(x) === x` assertion over the literals, verified by mutating the list rather than the code.
- **`normalizeGithubUrl` strips `.git` BEFORE trailing slashes** (`lib/normalize.ts:1-9`), so `…/repo.git/` → `…/repo.git` while `…/repo.git` → `…/repo`. A test proving "a de-normalized monorepo url is still skipped" must NOT use `.git/` — it would fail against correct code and read as a bug. Filed as M15.
- **A concurrent agent writing the repo makes any gate result untrustworthy and looks exactly like a flaky test.** When a gate goes red once and will not reproduce, `stat` the mtimes of the files in the diff before blaming test order. Mutation work belongs in an isolated `git worktree` with `node_modules` symlinked — ~0 setup cost, reproduces the suite exactly. Filed as M16.
- Baselines re-measured: `main` = 20 files / 277 tests; this branch = 22 / 286. Env-less build fingerprint stable at 210 `routes` / 0 `/s/` / 0 `/compare/` / 62 `/blog` / 91 `/skills` (259 static pages) — `/blog` and `/skills` counts are INDEX-INCLUSIVE, so a `startsWith('/blog/')` count gives 61/90 and reads as a phantom regression.
## 2026-08-01 — S81 (homepage aggregate snapshot)

- **`REVOKE ALL ON FUNCTION … FROM PUBLIC` is a NO-OP for `anon`/`authenticated` on this Supabase
  project.** The bootstrap `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO
  anon, authenticated, service_role` issues DIRECT per-role grants at CREATE time; revoking the
  `PUBLIC` pseudo-role does not touch them. Every function written as
  `REVOKE … FROM PUBLIC; GRANT … TO service_role;` is therefore anon-callable over PostgREST —
  confirmed live on prod for `refresh_home_stats_cache` (`20260430160000:99`) and
  `cleanup_rate_limits` (`20260417210500:115`). The correct form names the roles:
  `REVOKE ALL ON FUNCTION f() FROM PUBLIC, anon, authenticated;`. Filed repo-wide as S84.
- **Default TABLE privileges are live too**, so "no GRANT written" never means "not reachable":
  `GET /rest/v1/rate_limits` returns `200 []` on a table with RLS on, zero policies and zero
  explicit grants (`20260417210500_rate_limits.sql:7-22`). RLS is the only thing actually holding.
- **Read-only privilege probes against prod PostgREST that write nothing:** use `GET` (not `POST`)
  on an RPC — it runs in a read-only transaction, so a VOLATILE function's privilege check is
  observable via `57014`/`25006` while any write it attempts is rejected. A nonexistent function
  returns `PGRST202` 404, which is what "unreachable" actually looks like.
- **`revalidatePath` DOES invalidate `unstable_cache` entries** created by that page —
  `node_modules/next/dist/server/web/spec-extension/unstable-cache.js:152,231` pass
  `softTags: implicitTags`. This corrects the natural reading of the earlier note that
  `revalidateTag` is called nowhere and every `tags:` array is decorative: the tag arrays are
  decorative, but the cache entries are NOT uninvalidatable — `lib/revalidate.ts`'s
  `revalidatePath('/')` reaches `home-page-data-vN`. Homepage aggregate staleness is therefore the
  snapshot cadence, not cadence + the 24h window.
- **A snapshot-backed RPC's failure mode is `{data: null, error: null}` — a SUCCESS, not an error.**
  A `LANGUAGE sql` reader of the form `SELECT data -> 'k' FROM cache WHERE id = true` returns SQL
  NULL for a missing row, a missing key, AND a scalar `data`. Every `?? {}` fallback downstream of
  one silently converts "never seeded" into "zero of everything", which renders as a grid of
  literal zeros — a visible falsehood strictly worse than omitting the section. `lib/home-tiles.ts`
  folds error ∨ null ∨ empty into one `isAbsent` guard for this reason.
- **`security_advisories` on prod (measured 2026-08-01): 27,405 rows total, 362 `status='open'`
  (1.3%), ZERO with NULL `published_at`.** `status` is an index predicate nowhere
  (`20260402010000:53-55` indexes only `server_id`, `cve_id`, `severity`), so adding a partial
  index on `status='open'` is what would first make the daily scan's `open → fixed` transitions
  HOT-blocking. A partial index was designed into S81 and then DROPPED on this measurement:
  `/security` already returns in 0.15s (ids) / 0.74s (full rows + embed) with no index at all, and
  the 0.74s is dominated by `select=*` plus the `servers` embed, which no `published_at` index
  touches.
- **Postgres `ORDER BY x DESC` defaults to NULLS FIRST and postgrest-js emits no NULLS clause when
  `nullsFirst` is omitted**, so the index serving `.order(col, {ascending: false})` is `(col DESC)`.
  Writing `(col DESC NULLS LAST)` produces an index neither `app/page.tsx` nor
  `app/security/page.tsx:108` can use — the inverse of the S54/S50 trap.
- **`SET LOCAL statement_timeout` only takes effect inside an explicit transaction block**, and this
  repo had ZERO prior `SET LOCAL` in any migration — there is no in-repo evidence that migration
  files are applied inside one. Applied via `psql -f` without `BEGIN` or via the dashboard SQL
  editor, Postgres emits `WARNING: SET LOCAL can only be used in transaction blocks` and discards
  it. `SET … ; RESET …` is correct under both apply methods.
- **`EXCEPTION WHEN OTHERS` around a migration's own seed removes the LAST verification of that
  SQL**, because nothing in the bar parses or executes `supabase/migrations/**` (M7) — a typo in the
  function body would commit green with an empty snapshot. Narrow such handlers to the one condition
  they are documented for (`WHEN query_canceled` for a 57014 timeout).
- **Non-`CONCURRENTLY` `CREATE INDEX` holds a SHARE lock until the transaction commits**, so an
  index statement placed BEFORE a long seed blocks writes to that table for the whole seed window.
  Order index creation after the seed.
- **A permanently-red scheduled bot masks genuine failures** — the repo's canonical statement is
  `bots/compute-scores.ts:369-377`, and it now governs three call sites. Because migrations do not
  auto-apply (M2), any new unattended bot step referencing a hand-applied migration's objects is red
  for a human-latency-long window: `freshness-probe` (`cron: '0 */6 * * *'`) would post 4 red runs a
  day and `alert-on-failure.yml` comments per failure. New bot steps of this shape need an explicit
  not-yet-applied tolerance (`PGRST202` for a missing function, `PGRST205`/`42P01` for a missing
  relation) that warns without failing.
- **SQL parse gate with no DB and no Docker** (see M14): `npm install --no-save
  pg-query-emscripten@5.1.0`; `const pg = await require('pg-query-emscripten').default()` — `.default`
  is an ASYNC module factory that must be called and awaited. `pg.parse()` treats `$$…$$` as an
  opaque literal, so bodies must be extracted and parsed individually; `parsePlpgsql` accepts only
  `BEGIN…END` bodies and rejects `LANGUAGE sql` ones, which go through `parse()`. Local `psql`,
  `postgres`, `pg_ctl` are all absent and Docker is not running on the dev machine, so
  `supabase db lint`/`db start`/`db push` are unavailable — any acceptance criterion phrased as "run
  the migration locally" is unmeetable here without starting Docker Desktop first.
- **Test baseline moved to 288 tests / 21 files (~1.5s)**, from the 221/16 recorded at S48. Env-less
  build baseline unchanged: 210 prerendered `routes` (0 `/s/`, 0 `/compare/`, 62 `/blog`, 91
  `/skills`).
## Homepage outage post-mortem (2026-08-01, PRs #100 + #102)

- **The user-visible copy lied about the cause.** `/` said "the database is not reachable" while the DB
  was healthy: `/api/v1/servers` and `/api/search` served real data in ~1s and `/servers`, `/security`,
  `/analytics` all rendered. `LiveDataUnavailable`'s text is a component's guess, not a diagnosis —
  probe per-page and per-query before believing it.
- **Actual cause: `home_use_cases()` and `home_category_counts()` return 500/`57014` on every call**
  (measured 10/10). They are anon-role aggregates over ~46k servers against a 3s statement timeout.
  Both were in `criticalErrors`, so `fetchHomeData` threw, `withRetry` retried 4x, and **no
  `liveDataOrNull` budget could ever rescue it.** Filed as S83.
- **They returned 200 in 1.83s/1.39s and 500 within the same hour.** A query measured comfortably
  under a timeout is not safe if it is on a growth curve — measure the trend, not the point.
- **The first hotfix (#100) treated a symptom.** Raising the budget 6s→9s was reasoned from a partial
  measurement (the RPCs happened to succeed when first probed) and shipped with a stated estimate of
  4-5s cold. Production proved it wrong: the page waited 9.2s and still degraded. **When a fix is
  reasoned from a measurement, re-measure after deploy — the deploy is the experiment.**
- **Demoting a query out of `criticalErrors` is NOT sufficient on its own.** Both consumers fell back
  to `?? {}`, so demotion alone would have rendered `0` across all 22 category tiles — and since
  `unstable_cache` caches successful returns, that falsehood would have been pinned for 24h, outliving
  the outage. A section fed by a fallible aggregate needs a THREE-way contract — failed / empty /
  populated — with failed rendering as *absent*, not as zero. Demotion and nullability are one change.
- **Deploy verification needs the deployment hash.** Polling right after a merge reads the PREVIOUS
  deployment: `dpl_*` in the HTML changed three times during this incident, and two of those were
  unrelated merges. Confirm the hash moved past the merge before concluding a fix failed.
- Recovery confirmed: homepage 3.7s cold, then **0.25-0.32s warm** with 18 server links.

## 2026-08-04 — S70 cycle (advisory reconciliation guarded on the score write)

- **`reconcileAdvisories` is the only CREATOR of `security_advisories` rows as well as the only
  closer** (`lib/advisories.ts`: insert, conflict-update that flips status in *both* directions, and
  the bulk close). So `if (updateError) skip reconcile` is not a free win — it trades a false-green
  ("No known CVEs" beside a non-zero `cve_count`) for a newly published CVE going unrecorded that
  night. The trade is deliberate and now written into the guard comment. An "upsert-only, never
  close" mode is NOT a safe alternative: the upsert writes `adv.status` and can itself close a row.
- **"The next run retries" is only half true.** A failed UPDATE leaves `score_computed_at` unstamped,
  so the row stays in the stale filter and at the head of the stalest-first walk. But postgrest-js
  RESOLVES with `{error}` rather than throwing, so a lost response AFTER a commit stamps
  `score_computed_at`, drops the row out of the stale set, and defers the skipped reconcile by up to
  `SCORE_STALE_DAYS` (7 days). Any "it self-heals tomorrow" claim about this bot needs that caveat.
- **`bots/compute-scores.ts` passes `closeOn: 'success-or-pending'` while both routes pass
  `'success'`** — under that policy `lib/advisories.ts`'s early return never fires for any status, so
  the bot ALSO closes every open row on a `'pending'` scan. The bot's trigger set is strictly wider
  than the routes'; reason about it separately.
- **`bot_runs.servers_updated` has no automated consumer** — only `app/api/admin/bots/route.ts` →
  `app/admin/page.tsx` render it. `alert-on-failure.yml` keys solely on workflow conclusion and the
  S19 freshness probe keys solely on cache `refreshed_at`. So ANY per-server failure counter in a bot
  is human-polled by construction: a run where every write fails is still green, exit 0. That is the
  open M10 policy question, not something a fix cycle should decide silently.
- **`bot_runs.summary` has no schema contract** (`jsonb default '{}'`, no CHECK, spread-merged, then
  rendered generically via `Object.entries`). Adding a summary key is always non-breaking; removing
  one silently drops a chip from the admin UI.
- **`bots/**` is outside the `next build` surface** — verified no non-comment import of
  `bots/compute-scores` exists under `app/`, `components/`, `lib/`, `proxy.ts`, `next.config.ts`. A
  bot-only diff is legitimately build-exempt under CLAUDE.md §2 and must not burn Supabase egress on
  a speculative prerender. The rest of the bar runs in well under 15s, so nothing else is skippable.
- **Cross-file line citations rot.** `bots/freshness-probe.ts:42` hard-codes a line RANGE inside
  `bots/compute-scores.ts`; it has now drifted twice (`369-377` → `410-417`). It is the only such
  citation in `bots/` — check it whenever `compute-scores.ts` changes above that point.
- Suite baseline re-measured: `main` = 297 tests / 23 files; the S70 branch = 298 / 23 (~2.0s).
  `npx tsc --noEmit` ≈ 2.2s. This figure moves most cycles — re-measure, never trust the record.
## 2026-08-04 — GitHub issues intake (#68, #91, #107, #108)

- **`servers.data_quality` has ZERO writers in the entire repo.** `compute_data_quality` /
  `compute_all_data_quality` (`supabase/migrations/20260403050000_data_quality.sql:19,78`) are called
  by no bot, route, script, workflow or trigger. So `bots/detect-duplicates.ts:144-149`'s
  `ORDER BY data_quality DESC, id ASC` keeper rule reduces to a RANDOM uuid tiebreak
  (`id uuid default gen_random_uuid()`). Any statement that "the keeper won its group on quality" —
  including the comment at `lib/curated-merge.ts:13` — is unfounded. Filed as S86.
- **`supabase/migrations/20260429105418_merge_thoughtspot_duplicate.sql:22-58` is the repo's
  reference implementation of a correct merge**: reparent → recount `review_count`/`review_avg`/
  `community_verification_count` → archive. `bots/detect-duplicates.ts` implements steps 1 and 3
  only. Diff the bot against this migration before touching the merge path.
- **Trust flags live on `servers` while their evidence lives in child tables, and the two merge by
  different mechanisms.** `publisher_claims` reparents; `publisher_verified`/`claimed_by`/`verified`
  do not (absent from `CURATED_FIELDS`). Once split, `app/api/admin/approve-claim/route.ts:53-55`
  (`409 'Claim already verified'`) makes the flag unrecoverable through the UI. Filed as S85.
- **`servers.transport` has exactly one scheduled UPDATE writer**, `bots/extract-install-info.ts:216`,
  and its `isDefaultTransport` gate (`:213-215`) matches only `null` or `['stdio']` — so the two
  drift shapes `'{}'` and `'{NULL}'` are permanently unreachable by any bot. Every other writer is
  INSERT-only. `transport` is also in neither `EDITABLE_FIELDS` nor admin `ALLOWED_FIELDS`, so there
  is no human repair path either. Recorded against S65.
- **Refreshing content columns on `sync-registry`'s fast path costs NO extra registry fetches.** The
  full catalog is already paginated nightly and `parsed.transports`/`npmPackage`/`pipPackage` are
  already in memory at `bots/sync-registry.ts:381` when the 2-column stamp is written at `:383`.
  Cost objections to a pipeline fix here are unfounded; a one-row data edit is the wrong shape.
- **S57 half (a) migrated from a parse bug to a persistence bug** after S58/PR #95. The parser now
  retains `remotes[].type/url/headers` and exposes `ParsedRegistryServer.remoteUrls`, but that field
  has zero consumers and the insert persists neither it nor any auth flag. `components/ServerTester.tsx:20,29-33`
  is the in-repo reference for the transport-aware install/test copy S57 wants.
- **Screen outcome, issue #107** — a third party offered to contribute runtime-verification scan
  results for 28 named servers, with their own scoring, framework links and a citation claim. Failed
  the adverse-to-project and cost checks: it would publish an outsider's unverifiable security
  verdicts about OTHER people's servers under MCPpedia's name (defamation exposure, and it hands an
  external party control of our security signal), and per-server runtime scanning across ~46k rows is
  unbounded. No injection attempt. Reported to the human as a partnership decision; nothing filed,
  nothing replied to. **A reporter's claims about their own server are a lead, not ground truth —
  and a reporter's claims about OTHER people's servers are not even a lead.**
- **Issues #68 and #108 were external rediscoveries of already-filed rows** (S56+S57, and S65). Both
  reporters' code reads were accurate. Two of four open issues needed no new row — dedupe against
  BACKLOG before filing anything from an issue.
## Production stopped deploying for ~15h and nothing alerted (2026-08-04, PR #104 → fix)

- **`vercel.json`'s `git.deploymentEnabled: { "**": false, "main": true }` disabled deploys on `main`
  too.** The assumption was that the exact branch key beats the glob. It does not — `**` matched
  `main`, and deployment *creation* was off for every branch. Last production deploy before the fix:
  `f91da69` at 2026-08-03T23:42:05Z, the commit immediately BEFORE #104 landed. Never pair a
  `"**": false` catch-all with a narrower allow key in `deploymentEnabled`.
- **`ignoreCommand` alone does the job #104 wanted.** It runs after a deployment record is created but
  before the build, and **exit 0 means skip the build**. `[ "$VERCEL_ENV" != "production" ]` exits 0
  on preview (skip) and 1 on production (build). Preview deployment *records* still get created; they
  cost nothing because no build runs, and build minutes were the actual concern.
- **CI green is not deployed.** Three merges to `main` (#105, #106, #109) each passed CI in ~1-1.5m
  and produced **zero** deployments. The GitHub Vercel commit status still read `success` — a skipped
  or never-created deploy is not distinguishable from a shipped one at that layer.
- **The detection path that worked**: `gh api repos/<repo>/deployments` and compare the newest
  `Production` SHA against `origin/main`. If they differ, the merge did not ship, whatever CI says.
  This generalises the "deploy verification needs the deployment hash" lesson from the 2026-08-01
  post-mortem: checking `dpl_*` only tells you the deployment *changed*; checking the deployments API
  tells you *which commit* is live.
- **Symptom to recognise**: content merged to `main` 404s in prod while the rest of the site is
  healthy. A blog post (#109) was on `main` and still served "Post Not Found", because the blog index
  and its `generateStaticParams` read `content/blog/` from the filesystem at build time — no build,
  no post, indefinitely.

## 2026-08-04 — Vercel deploys were double-locked; the second lock went unnoticed

`b218234` ("build only on main, skip preview deployments") added TWO independent kill switches to
`vercel.json`: the `git.deploymentEnabled { "**": false, "main": true }` block AND
`ignoreCommand: [ "$VERCEL_ENV" != "production" ]`. PR #111 removed only the first, so production
stayed dead and the symptom was unchanged — which read as "the fix didn't work".

- **Evidence that settles it:** the GitHub commit status for every commit from `b218234` onward reads
  `Vercel: success — "Canceled by Ignored Build Step"`. `f91da69`, the commit immediately BEFORE
  `b218234`, reads `"Deployment has completed"`. That one-line `description` field is the whole
  diagnosis; the `state` is `success` in both cases, so **a skipped build is indistinguishable from a
  successful one unless you read the description.** Never conclude "deployed" from a green Vercel
  check — read `.statuses[]|select(.context=="Vercel")|.description`.
- `ignoreCommand` semantics are inverted from intuition: **exit 0 SKIPS the build**, exit 1 proceeds.
  So any `[ "$X" != "expected" ]` form fails CLOSED — when `$X` is unset or unexpected it evaluates
  true, exits 0, and silently cancels. `VERCEL_ENV` is evidently not `"production"` during the ignore
  step on this project, so the production branch was cancelled by a rule written to protect previews.
- The replacement keys on `VERCEL_GIT_COMMIT_REF` and fails OPEN: it skips only when the ref is known
  AND is not `main`. An unset ref builds rather than cancels — for a production deploy path, an extra
  build is a cost, a silently skipped one is an outage.
- **A stale production deploy is invisible to every gate the org has.** CI was green on all five PRs
  merged that day; none of them reached users. The only detector was polling the live `dpl_*` hash.

## 2026-08-04 — `in-review` is the org's leakiest status, and prod finally became observable

Reconciliation cycle over all 14 rows marked `in-review` with ZERO open PRs. **All 14 PRs had
merged; not one was closed unmerged.** So `in-review` had become a write-only status: the ship step
(phase 7) sets it, and nothing ever clears it, because the merge happens outside the cycle that set
it. 8 rows were fully DONE on `main` and had been for days; 5 were blocked only on prod
observation; 1 (S2) was genuinely unmet and duplicated an existing open row (S7).

- **The recurring shape of a stuck row is "code shipped, one clause needs prod".** S8, S48, S59, S60
  and S81 all had verified `file:line` implementations and a single acceptance clause requiring a
  production read. Because deploys had been dead since `b218234`, none of those clauses were even
  *takeable* until PRs #111/#115 landed on 2026-08-04. Four of the five closed within an hour of
  deploys being restored, purely by measuring.
- **S60's acceptance criterion is unsatisfiable by any code change** and must be re-worded by the
  maintainer. It requires `x-vercel-cache: HIT` on `/servers`, but a page that awaits `searchParams`
  is dynamic — Vercel serves `no-store` regardless. Measured 2026-08-04: `/` itself returns
  `x-vercel-cache: MISS` with `cache-control: private, no-cache, no-store` on 5/5 requests despite
  its `unstable_cache` wrappers. **`unstable_cache` caches DATA, not the response.** Any future
  criterion phrased as a CDN-header assertion on a dynamic route is unmeetable by construction;
  phrase it as a latency or query-count delta instead.
- **Prod timings, 2026-08-04, `https://mcppedia.org/`** (first real-env measurement since deploys
  were restored): HTTP 200, TTFB 0.200–0.318s, total 0.315–0.359s over 5 consecutive requests, all
  `x-vercel-cache: MISS`. Both S83 sections render — `Browse by category` with 44 `cat-tile` links,
  and `Best for developers`. Compare the 2026-08-01 hotfix figures above (3.7s cold / 0.25–0.32s
  warm): same warm band, but with the two aggregate-backed sections restored rather than omitted.
  `home_stats` is live too — `/security` serves 36,614 servers and `Last scan: Aug 4, 2026,
  01:48 PM UTC`, versus the frozen 20,499 / July-5 scan that S8 was filed for.
- **`docs/org-memory/codebase.md:393-400` reads like prod verification and is not.** That section
  describes the `edits` RLS policy set from the MIGRATION FILES, and its title names S48, whose
  acceptance criterion explicitly wants a prod `pg_policies` check. Nothing in this repo has ever
  queried `pg_policies` against prod. When recording schema facts, say which source they came from:
  a migration file is a statement of intent, and M2 exists because intent and prod diverge here.
- **The only prod-applied-migration verification the org has ever performed** is S83's anon-key RPC
  probe. With #110 auto-applying migrations on merge to `main` and #111/#115 restoring deploys, that
  gap is now closable — but "the migration file merged" still does not mean "it is live" for
  anything merged before #110.

## 2026-08-04 — Four hardcoded `17,000+` counts in the SEO/metadata surface (filed as S90)

S28 audited `/badge` and `/about` for stale server counts and fixed both. It did NOT audit the
metadata surface, where the same number is hardcoded four more times and is 2.2x below the live
36,614 catalog: `lib/constants.ts:91` (`SITE_DESCRIPTION`, which fans out to `app/layout.tsx:22`,
`app/page.tsx:35,38,47`, `app/blog/feed.xml/route.ts:30`, and BOTH JSON-LD builders at
`lib/seo.tsx:32,42`), `app/opengraph-image.tsx:42,48`, `app/llms.txt/route.ts:7`, and
`app/llms-full.txt/route.ts:30`.

- **A single prod response contradicts itself by 2.15x**: `https://mcppedia.org/` serves
  `meta[name=description]` = "compare 17,000+ MCP servers" while the same HTML renders
  `stats.total_servers` = 36,614 from `home_stats`.
- **Constants are the blind spot no page-level audit finds.** S28's lens was "which pages compute a
  count badly"; a constant computes nothing, so it never appeared. When auditing a class of stale
  value, grep the literal across the repo, not just the routes that render it.
- `app/opengraph-image.tsx` is `runtime = 'edge'`, so it cannot cheaply reach the snapshot — a fix
  must say how it gets the number or drop the figure, not add a per-render query.

## 2026-08-04 — Adding a live count to `opengraph-image` silently makes it dynamic

PR #117 fixed the hardcoded `17,000+` counts (S90) by routing every surface through a new
`lib/live-counts.ts`. Correct fix, one unintended consequence: `app/opengraph-image.tsx` was a
build-time static asset, and adding `await getCatalogCounts()` at `:12` flipped it to fully dynamic.

- **The rule, from the Next docs in this repo** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md:91,93`):
  generated images are "statically optimized (generated at build time and cached) **unless they use
  Request-time APIs or uncached data**". An uncached fetch is uncached data. There is no warning and
  no build error — the route just stops being static.
- **Measured in prod 2026-08-04**: `/opengraph-image` returns `x-vercel-cache: MISS`, `age: 0`,
  `cache-control: public, max-age=0, must-revalidate` on 3/3 requests. This URL is the `og:image` of
  every page, so every crawler and every Slack/Discord/X/LinkedIn unfurl costs one `home_stats` RPC
  plus a satori PNG render on the edge. Filed as S91.
- **The general shape**: `lib/live-counts.ts` is now imported by 8 routes. Six of them export a
  `revalidate` (`/faq:17`, `/best:45`, `/llms.txt:4`, `/llms-full.txt:7`) or are page-cached; two do
  not. When a shared data helper lands, the caching question is per-CALL-SITE — the helper cannot
  answer it, and a route that had no data fetch before has no `revalidate` to inherit.
- **Corollary for reviews**: "does this add a per-request DB query?" cannot be answered by reading the
  diff of the helper. It requires checking each consumer's route segment config. S90's row carried an
  explicit "ZERO per-request DB queries" cost note and it still shipped this way.
- **Partial-sweep hazard**: the same file still renders a hardcoded `'548 CVEs'` at `:55`, in the same
  tile row whose two neighbours #117 made live. Prod that day: 364 open / 27,441 fixed CVEs — 548
  matches neither. Filed as S92. When replacing hardcoded stats, enumerate every literal in the file,
  not the ones the ticket named.

## 2026-08-05 — OG image caching: prerendering is NOT enough, and the header is load-bearing

Fixing S91 established the rule for every metadata image route in this repo. Two levers are
required and neither is sufficient alone.

- **`ImageResponse` hardcodes `public, max-age=0, must-revalidate` as its production default**
  (`node_modules/next/dist/server/og/image-response.js:39`), and `exportAppRoute` copies the
  handler's own response headers verbatim into `.meta` / `initialHeaders`
  (`node_modules/next/dist/export/routes/app-route.js:101-120`). **Proof that prerendering alone
  does nothing for the CDN**: `/apple-icon` in prod is a fully prerendered metadata route
  (`initialRevalidateSeconds: false`) and still returns `x-vercel-cache: PRERENDER, age: 0` on
  every single request. Prerendering removes the DB call and the satori render; **only an
  explicit `s-maxage` removes the origin touch.** Never treat the header as redundant with
  `revalidate` — that reasoning was proposed in this cycle and refuted by measurement.
- **`export const revalidate` is inert under `runtime = 'edge'`, silently**
  (`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md:186`). The
  only edge/segment-config conflict Next warns about at build time is `dynamic = 'force-static'`
  (`node_modules/next/dist/build/utils.js:664-666`), so an edge route carrying a `revalidate`
  passes typecheck, lint, test AND build while changing nothing.
- **The four pre-deploy discriminators** — the only local proof a caching change actually landed:
  (a) `.next/server/middleware-manifest.json` → `functions` no longer lists the route (edge
  routes appear there); (b) `.next/server/app/<route>.body` + `.meta` both exist (the prerendered
  route-handler signature); (c) the `.meta` records the exact `cache-control` prod will serve;
  (d) `.next/prerender-manifest.json` → `routes[...].initialRevalidateSeconds`. For a DYNAMIC
  route the test is the pair "absent from `dynamicRoutes` + present in
  `functions-config-manifest.json`" = bare lambda, not ISR.
- **Post-deploy check must use TWO requests.** Request 1 is expected to be `PRERENDER`/`MISS` —
  a deploy purges the CDN and each PoP misses once. Only request 2 proves `HIT`/`age > 0`. A
  single-request check reads as a false failure.
- **An OG image's `?<hash>` is a content hash of the SOURCE MODULE, not the rendered PNG**
  (`node_modules/next/dist/build/webpack/loaders/next-metadata-image-loader.js:59,63`). So a bad
  render lands at the identical URL third-party unfurlers already cached — no cache-busting
  signal, and `lib/revalidate.ts` only calls `revalidatePath` with the default `'page'` type,
  which does not emit this entry's tags. Recovery is a redeploy. **This is why the error contract
  matters more on an OG route than anywhere else.**
- **The error contract must invert before caching — second known shape.** The S60 rule was about
  `unstable_cache`; segment-level ISR on a metadata image route is the same mechanic (Next
  persists only SUCCESSFUL responses). `getCatalogCounts` swallows failures to `null`, so a
  failed read renders a successful 200 of fallback copy that ISR then pins. The fix is a `failed`
  flag plus a `throw` at the one call site that can afford it — **not** a throw inside the
  fetcher, which has 7 other callers that must keep degrading.
- **A `throw` in an ISR'd route is safe in the env-less CI build ONLY** because
  `getCatalogCounts`'s no-env short-circuit returns `failed: false` BEFORE issuing any RPC
  (the S29 ordering rule). Flipping that `false` to `true` would fail `npm run build` in CI.
  Verified empirically this cycle: BUILD_EXIT=0, 262/262 pages, route prerendered `○`.
- **`home_stats()` is a one-row snapshot read**, not an aggregate scan, since
  `supabase/migrations/20260430160000_home_stats_snapshot_cache.sql`. The "`home_stats` can hit
  57014 during `next build`" hazard applies to `refresh_home_stats_cache()`, not to readers —
  the `dynamic = 'force-dynamic'` comments at `app/page.tsx:28-32` and `app/security/page.tsx:10-13`
  are arguing from a stale premise. Seven build-time callers now exist without incident.

**Predicate-drift trap worth naming generally:** a shared fallback constant used as BOTH a value
and a branch sentinel. `formatExactCount(n, fallback)` falls back at `n <= 0` while its caller
guarded on `=== null`; they disagreed at exactly one input, and typecheck cannot see it because
both branches have the same type. Any `format*(x, fallback)` helper whose caller also picks a
label needs the caller's guard to match the helper's fallback rule exactly.

**Env-less builds give a free visual gate for OG routes**: `.next/server/app/opengraph-image.body`
is a readable PNG. The fallback copy renders offline with no server and no network, so the
absent-data path — normally the hardest to see — is the one that is trivially checkable.

## 2026-08-05 — Metadata image routes: ISR requires a module-own generateStaticParams (S93, cycle 2026-08-05-a)

S93 made `/s/[slug]/opengraph-image` (39k slugs, service-role query + satori render per request) and
`/blog/[slug]/opengraph-image` real ISR routes. The mechanism facts, all verified against the Next
source in this repo:

- **A `revalidate` export alone is INERT on a dynamic app route.** Next only marks a route SSG/ISR
  when the route module itself exports `generateStaticParams` — an empty `[]` return qualifies
  (truthy empty array → `prerenderedRoutes = []` → `isSSG`, `next/dist/build/static-paths/app.js:723-725`,
  `build/index.js:1350-1354`). A sibling `page.tsx`'s `generateStaticParams` NEVER applies to the
  image route (`build/segment-config/app/app-segments.js:93-121`). Edge runtime force-disables SSG
  entirely (`build/index.js:1333-1337`). `generateStaticParams(){ return [] }` is therefore
  load-bearing, not decorative: ISR template, zero build renders, on-demand children.
- **The metadata route loader re-exports every named export except `default`, `generateSitemaps`,
  `dynamicParams`** (`next-metadata-route-loader.js:40-45`) — so `revalidate`/`generateStaticParams`
  on an og-image file are first-class, an exported `dynamicParams` is silently dropped, and adding
  `generateImageMetadata` alongside a userland `generateStaticParams` is an export collision
  (`:174-189`). Build typegen never checks metadata route files (`next-types-plugin/index.js:312`
  matches only `(page|route).*`), so `tsc` validates none of this — only the build artifacts do.
- **`ImageResponse` hardcodes `cache-control: public, max-age=0, must-revalidate`, but
  `options.headers` is applied after and wins** (`next/dist/server/og/image-response.js:36-46`), and
  Next's revalidate-derived header applies only when the handler set none
  (`build/templates/app-route.js:316`). Every cacheable OG image must pass `Cache-Control` explicitly.
- **App-route ISR caches responses of ANY status** — the template stores `status: response.status`
  with no 200-check (`build/templates/app-route.js:236-249`); only thrown errors escape caching.
  Consequence pair: throw on transient DB error (never persist a degraded card), and any returned 404
  is pinned for the full window. Prod-verified the same day: soft-404 `/s/<nonexistent>` pages return
  200 WITH the `og:image` meta, so crawlers can mint 404 ISR entries for slugs that do not exist yet
  — which is why `revalidateServer` now purges `/s/{slug}/opengraph-image` too (`lib/revalidate.ts:12`).
- **Uncaught route-handler errors never reach the client in prod** — rethrown at
  `route-modules/app-route/module.js:481`, served as static `Internal Server Error` text/plain
  (`base-server.js:1848`); interpolated error text lands in logs only (still sanitize path params in
  messages — log-line forgery).
- **`servers` SELECT RLS is `using (true)` and has never been narrowed** — the sole SELECT policy in
  all migrations (`20260402000000_initial_schema.sql:298-299`), archived rows included, so
  service-role reads of `servers` confer zero extra data access.
- **Updated baselines**: env-less build now 322 static pages / ~14.7s static-gen (61 blog OG PNGs at
  ~160 ms satori render, ~5 MB output — supersedes the 259-page S51 figure); test suite 411 tests /
  31 files (supersedes 221/16 from S48). The build table prints the ISR template as
  `● /s/-/opengraph-image` — a literal `-` placeholder, NOT a concrete prerender; count
  `prerender-manifest.json` `.routes` only. `dynamicRoutes` entries carry `fallbackRevalidate`/
  `fallbackHeaders` only under PPR — in this repo they are null, so ISR proof for on-demand dynamic
  routes needs the two-request prod probe, not the manifest.
- `getAllBlogPosts()`/`getBlogPost()` are synchronous (`lib/blog.ts:32,59`). Watch item (below filing
  bar): a future generated blog post with an emoji in `title`/`hook` would make the env-less build
  fetch Google Fonts for the glyph (satori `loadDynamicAsset`) — a network blip becomes a failed
  deploy; the generate-blog bot should keep those two fields ASCII+em-dash.

## 2026-08-05 — S91/S92 confirmed in prod: the two-request check, and what the fix actually bought

Post-deploy verification of PR #124 (`f1ed6d2`), the first time this org has closed a caching row
on measured production evidence rather than build artifacts alone.

- **The two-request check works exactly as predicted.** `https://mcppedia.org/opengraph-image?f272bb6fe4169bc4`:
  request 1 → `x-vercel-cache: PRERENDER`, `age: 0`; request 2 → **`x-vercel-cache: HIT`**. Both carry
  `cache-control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400`. **A
  single-request check would have read as a failure** — a deploy purges the CDN and each PoP misses
  once. Any future acceptance criterion phrased as "returns `x-vercel-cache: HIT`" must specify two
  requests, or it will be reported red when it is green.
- **Read the Vercel status `description`, never the `state`.** The deploy for this merge reported
  `state: success` with `description: "Deployment has completed"`. A skipped build ALSO reports
  `state: success`, with `description: "Canceled by Ignored Build Step"` — the 2026-08-04 outage.
  The wait loop that gates a post-deploy check must poll the description.
- **The rendered PNG is the proof the throw did not fire.** The prod card shows `36,000+` /
  `Servers tracked` and `364` / `Open CVEs` — live figures, not the `Thousands` / `OSV.dev`
  fallback. That single observation confirms three things at once: the build-time `home_stats` read
  succeeded, the new `failed`-flag throw stayed unreached, and S92's tile is sourced from the
  snapshot. Downloading and viewing the OG PNG is a cheap, high-information prod check.
- **What the fix bought, measured**: from unbounded per-request (`MISS` 3/3, one `home_stats` RPC +
  one satori render per unfurl) to ~1 render/day globally plus a CDN-served `HIT`. Prod PNG is
  85,222 bytes — bandwidth is unchanged by this fix; only compute and DB moved. The
  `linear-gradient` background is the likely reason this card is ~1.8x the per-slug card's 47,946 B
  (PNG encodes gradients poorly); a flat background would plausibly cut it ~65%, on a payload every
  unfurl pays forever. Not filed — noting it here as a cheap win if anyone touches this file.
