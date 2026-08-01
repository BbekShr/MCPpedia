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
