# Codebase facts (current, load-bearing only)
One dated bullet per fact with `file:line` + origin cycle/PR; delete when falsified, edit baselines in place. Budget ~120 lines (hard cap 130).
History: grep `codebase-archive.md` by file path or backlog ID (see Archive index), never read it whole.

## Gate baseline
- 2026-10-27 (S112), `improve/S112-submit-filter-sanitize` @ `e7465ab` (= main `62fc501` + diff): `tsc` 0 errors; lint 0 errors / 6 warnings; `npm test` **688 tests / 52 files**; env-less build green (463 static pages), zero warn/error lines. Bar = "no NEW warnings vs a measured baseline"; re-measure, the test count moves most cycles.
- The 6 warnings (identify by identity, not line): load-bearing unused `react-hooks/exhaustive-deps` directive in `app/admin/page.tsx` (S2/S7: deleting it surfaces 3 `set-state-in-effect` ERRORS; run eslint without it first); `bots/lib/blog-planning.ts:22:30`; 4x `@next/next/no-location-assign-relative-destination` in `components/{CategoryEditor,ClaimServer,CommunityVerify,FavoriteButton}.tsx`.
- CI (`.github/workflows/ci.yml:50-65`) builds with `npm run cf:build` (next build + OpenNext adapter); local `npm run build` never exercises the adapter. CI build is deliberately env-less (mock Supabase clients); `timeout-minutes: 15` guards the un-timed `next/font/google` fetch. No smoke gate (S3).
- False-red traps: stale `node_modules` reads like red `tsc` (10 errors in `open-next.config.ts`/`scripts/check-schema-drift.ts`; run `npm install` in a reused worktree first). Stray `.claude/worktrees/**` get picked up by tests (M6; `npx vitest list` reconciles counts). Concurrent agents writing the tree make a gate red once and unreproducible: `stat` mtimes before blaming flakiness.
- Env-less build recipe: `env -u VAR` does NOT suppress `.env.local` (it enables it); use empty-string env or rsync the tree without `.env*`. Proof it was env-less: `.next/prerender-manifest.json` has 0 `/s/` and 0 `/compare/` routes. Scratch worktree: `cp -cR node_modules` (Turbopack rejects a symlinked one; vitest/lint tolerate it). Measure baselines in a detached scratchpad worktree, never `git stash`/`git checkout` in a shared tree.
- macOS `sed -i` needs a suffix (use `perl -pi -e` for mutation checks); zsh `PIPESTATUS` is 1-indexed; `npx tsx -e` cannot top-level await; loaders available: `jiti`, `tsc`, `vitest` (no tsx/ts-node).

## Security & auth invariants
- 2026-07-16: rate limiter fails OPEN by design (`lib/rate-limit.ts:1-14`, atomic `check_rate_limit` RPC); `sanitizeSearchQuery` (`lib/validators.ts:6-8`) required before `.or()`/`.ilike`; admin routes gate on `profiles.role IN ('maintainer','admin')` (`app/api/admin/bots/route.ts:61-65`); `proxy.ts` gates on cookie presence, path-narrowing broke auth before.
- 2026-10-27 (S112): `sanitizeFilterValue` (`lib/validators.ts`) is for identifier-shaped VALUES in `.ilike`/`.or`; it REPLACES chars with `_` (never delete: `normalizeGithubUrl` keeps `%#?+`, deletion made resubmits miss their row and duplicate). Never use in column/operator position. `submitServerSchema.github_url` checks the RAW string (WHATWG `URL` drops tabs/newlines, turns `\` into `/`).
- postgrest-js `.eq()` is not an injection surface (`URLSearchParams.append`); `.or()` appends verbatim, only `,` and `()` delimit (`col.eq.{a,b}` needs quoting). Empty `text[]` predicate is `categories.eq.{}`, never `[]` (S59).
- 2026-10-26 (S36, PR #81): hosted `/mcp` forwards caller IP via `x-mcppedia-client-ip` + `x-mcppedia-internal-key` (`lib/mcp/api.ts:91-96`); `app/api/mcp/route.ts:127-151` trusts it only on constant-time `MCP_INTERNAL_KEY` match; unset key silently regresses to one shared bucket. `/mcp` has no outer limiter (unfiled).
- RLS: `servers`/`edits` SELECT is `using (true)` (`20260402000000_initial_schema.sql:298,316`), so archived rows are public. `edits` is append-only; a trust count derived from a table the route itself writes is self-feeding (S48). `REVOKE ... FROM PUBLIC` is a NO-OP for anon/authenticated here (default privileges grant per-role): name roles `FROM PUBLIC, anon, authenticated` (S81/S84).
- Auth trigger: a CHECK on any column `handle_new_user` writes is a SIGNUP OUTAGE (S102/S103). `profiles` self-update policy freezes 6 columns with `is not distinct from` (`20260907120000_...sql:164-169`); plain `=` NULL-locks users out. `SECURITY DEFINER` exemption comes from function OWNER.
- `createAdminClient` (`lib/supabase/admin.ts:15-25`) is UNTYPED and has no env fallback (build-time callers must self-guard); `lib/supabase/server.ts` mock (:33-67) lacks `maybeSingle/gt/in/ilike/...` so build-time callers using them TypeError env-less only.

## Structure & test harnesses
- ~30 API routes `app/api/**/route.ts`; bots in `bots/` (+`bots/lib/`), zero direct bot test coverage: extract the decision into `lib/` to test it (S58). `bots/**` is outside the `next build` surface. Two scoring implementations exist: `lib/scoring.ts` and the bot path. Sitemaps are code-generated routes.
- Cache pattern: three-layer `unstable_cache` sandwich; budgets `withDeadline(withRetry(fn,{retries:1}),BUDGET)` (`lib/retry.ts:28-55`): `/servers` 6000/stats 4000, `/` 8000 (outer `liveDataOrNull` 9000), `/security` 5000, category 6000. Keep >=1000ms between inner and outer (inner starts after cache lookup). `withDeadline` cancels nothing. `unstable_cache` never caches a rejection, but a caught error returning `null` IS cached.
- A `liveDataOrNull` budget shorter than the fetcher's cold time is a PERMANENT degrade (S34/#100,#102). `home_stats()` is a snapshot read; anon statement timeout is 3s (`20260430160000_home_stats_snapshot_cache.sql:1-2`), so 2s+ page latency is pre-outage. Snapshot RPC failure mode is `{data:null,error:null}`, a success.
- Pages awaiting `searchParams` are fully dynamic (`/servers`, `/category/[category]`; their `revalidate` is inert, S35). A page with no `revalidate` that queries Supabase prerenders once per deploy. `generateStaticParams` env guards key on the client the page uses (`app/s/[slug]/page.tsx:100` service key; `app/compare/[slugs]/page.tsx:41` anon key).
- OG/metadata images: `ImageResponse` hardcodes `max-age=0`; `revalidate` is inert under `runtime='edge'`; ISR needs a module-own `generateStaticParams` (S93); adding a live count silently makes the route dynamic (`lib/live-counts.ts` used by 8 routes); app-route ISR caches ANY status; verify post-deploy with two requests.
- `__tests__/helpers/route-supabase-stub.ts` (7+ consumers): resolve key `[client:]table:[writeOp|terminator]`; flags `trackClient`, `keyByWriteOp`, `keyByClient` (all default off). Miss resolves `data: null` under `.single()`, `data: []` under plain await (so any new `rows===0` guard reddens sibling suites); queued errors via `harness.queuedErrors[key]` (:94). Records only select/insert/update/upsert/eq/neq/in/not/or/order/limit (+maybeSingle); no range/ilike/gte/is; executes NO filtering/ordering, so query-semantics claims need an array-backed fake (`lib/__tests__/admin-edits.test.ts:50-68`).
- Harness blind spots: cannot tell `.update().eq()` from `.update().eq().select('id')` (assert the recorded `select` call; S104). `_record` does not clone args, so use `toBe` for identity pins. Bare no-op `vi.mock('@/lib/revalidate')` leaves purge paths unpinned (use `vi.hoisted`+`vi.fn()`, `approve-edit-bookkeeping.test.ts:31-43`). Clear mutated harness state in `reset()`; `--sequence.shuffle --sequence.seed=n` catches order-dependence. A queued key the fixed code no longer reads can make an assertion pass against the BUGGY code (S109).
- Mutation checks: assert the anchor matched exactly once; vitest stops at the first failing `expect`; separate surviving vs EQUIVALENT mutants. `normalizeGithubUrl` strips `.git` before trailing slashes (`lib/normalize.ts:1-9`, M15).
- `app/admin/page.tsx` (S73): new effects trip `react-hooks/set-state-in-effect`; declare `refreshPendingEdits` above `fetchNonServerData` (TDZ); post-`await` filter reads must come from `editFilterRef`; `fetchSeq` guards only the edits branch (S123, S124). `lib/types.ts:198` owns the `edits.status` union. `Promise.all` over Supabase builders never rejects (errors resolve in `.error`).

## Recurring defect classes
- Zero-row RLS writes read as success: a `USING` filter-out is 204/`error:null`/0 rows; only `WITH CHECK` raises 42501; `.update()` without `.select()` proves nothing (`app/api/username/route.ts:69-72`; S99/S104). `.select(cols)` after a write adds no round trip. Fetch/PostgREST failure resolves `{error}` rather than throwing (S58).
- Shape-pin tests that pass against stubs; "gates green" proves nothing about migrations (all gates are blind to `supabase/migrations/**`, S107); tautological `do $$ raise exception` blocks run once; pinning a pure helper is not coverage of its call site.
- Missing-data-as-verdict (S55-S57): empty/absent registry fields scored as findings; sync-registry fails OPEN in every direction (S58); `scan_status:'failed'` does not imply empty advisories; `pending` is user-reachable (S51).
- PostgREST 1000-row cap: `supabase/config.toml:18` `max_rows=1000` clamps any `.limit()`; use `>=` for saturation guards; `fetchAllRows` (`bots/lib/supabase.ts:23-68`) pages by offset; an `ORDER BY` above `LIMIT` on unindexed `servers` columns is a cost regression (no index on `github_url/npm_package/pip_package/is_archived`, S99).
- `servers.is_archived` is NULLABLE; NULL = live in JS but `.eq('is_archived',false)` drops it (S99/S52). Six writers, one can clear it. Archived rows still get scored and their advisories counted.
- Migrations: the ledger is NOT evidence of application (`20260610000000_security_hardening.sql` recorded, never applied, S97); a hardening migration assumes its predecessor landed; permissive policies OR together; `supabase db push` skips versions older than the latest ledger entry. Offline `pg_query` parse is a real gate for `.sql` (negative-control the grammar, S107/M19).
- Workers `fetch()` sends NO User-Agent: GitHub API 403s (README missing on every runtime slug); set `User-Agent` on every third-party fetch; Worker has no `GITHUB_TOKEN`; page README reads `raw.githubusercontent.com` first (`fetchPageReadme`, `lib/github.ts`, 2026-10-26).
- ISR/caching: `revalidatePath` commits regardless of response status and a 200 never proves the purge; a fetch inside a page caps its ISR window to the min revalidate (`components/ServerReadme.tsx`, check `curl -sI` `s-maxage`); hardcoded counts (`17,000+`) are blind spots of page audits (S90); fixing a broken predicate activates the dead loop below it (S59); a "retry next run" claim needs the failed write to leave `score_computed_at` unstamped (S70).
- Every `servers` UPDATE fires the heavy `servers_audit` trigger (`20260416010000_server_changes_audit.sql:96-99`); bulk-process endpoints should request `cap+1` rows, not offset-walk; `tools`/`count:'estimated'` are planner estimates, not counts.
- Cross-file line citations rot (`bots/freshness-probe.ts:42`); a permanently red scheduled bot masks real failures; the bot twin of a hardened query must be checked too.

## Operational
- Merging `main` deploys to Cloudflare Workers (`.github/workflows/deploy-cloudflare.yml`; Vercel is gone, `docs/CLOUDFLARE.md`). CI green is not deployed: verify the deployment, not the PR check.
- ISR cache is R2 `mcppedia-inc-cache` keyed by build ID: every deploy is a cold miss for every `unstable_cache`/ISR entry. Lifecycle rule `expire-stale-incremental-cache` (7d, prefix `incremental-cache/`) lives OUTSIDE the repo. D1 tag cache; `revalidateTag` is called nowhere.
- `withRegionalCache` removed 2026-10-12 (multiplied regenerations per colo); do not re-add without cache purge. `enableCacheInterception: true` in `open-next.config.ts` (#184) fixed the 1s ISR TTL; intercepted hits carry `x-opennext-cache`, not `x-nextjs-cache`. Nothing is edge-cached (no `cf-cache-status`).
- Cloudflare account `PASA LLC` is SHARED (5 Workers); MCPpedia ~96% of the bill; split costs via GraphQL by `scriptName`/`bucketName`. wrangler OAuth token expires hourly and a stale one returns `success:false` that renders as "0 objects": assert `success`.
- No wall-clock function limit; `maxDuration` is inert on Workers. Worker secrets: MCP_INTERNAL_KEY, REVALIDATE_SECRET, SUPABASE_SERVICE_ROLE_KEY only.
- Supabase Free plan has a 5 GB egress ceiling; blowing it looks like a dead DB and every build prerenders ~1,000 server pages, so multi-PR cycles burn egress. Env-less builds cost zero egress.
- There is NO API-level error reporting (Sentry deferred; `alert-on-failure.yml` covers scheduled bots only); every `console.error` in `app/api/**` is write-only, so "log and recover" is invisible.
- Local `main` drifts behind `origin/main`: diff/baseline against `origin/main` or `git show <sha>`.
- Agent sandbox may block prod DB access; prod-verification criteria (e.g. "prod `pg_policies` match") need a human running `npm run check:schema-drift`. `SUPABASE_DB_URL` is in the MAIN checkout's `.env.local`; copy it into a worktree to run the checker.
- `/org-eval` is required by `.claude/ceo/AUTONOMY.md` but has never run (M23).

## Prod schema state
- 2026-09-12: `npm run check:schema-drift` vs prod = DRIFT (0) CLEAN (59 files, 43 policies, 15 triggers); S101/S106/S107 closed; corrective migrations `20260907120000`, `20260908000000` applied. CLEAN means "nothing intended is missing": blind to extra OR arms, grantee roles, function bodies, column types/defaults, data.
- 2026-09-17 (S99): `servers` ~66,778 rows / 309 MB (migration-sourced); `security_advisories` 27,405 rows (2026-08-01, 362 open); `edits` 65 rows all approved (2026-09-07); 40 profiles at S97.
- `data_quality` has zero writers (#68); `registry_id` has no index/unique constraint; `bot_runs.summary` has no schema contract.

## Archive index (grep `codebase-archive.md` for the keywords)
- Gates & environment: S1/S2/S4 gates, eslint no-unused-vars, badge SVG, generateStaticParams guards, compare pairs
- Security & auth / Structure / Audit log: bootstrap rate-limit, sanitizeSearchQuery, proxy.ts, sitemaps
- Discovery 2026-07-24 (S23-S45, M3/M4): anon 3s timeout, permissive-policy OR, scoring twins, fetchAllRows, mcppedia-server
- Batch 1 fixes (S24, S25/S34, S27/S28, S29, PRs #72-#75): scan_status failed, env short-circuit, metadata export trap
- Issue triage 2026-07-25 (S55-S57, #70/#68/#25): registry remotes, missing-data-as-verdict, Nav.tsx auth pattern
- Admin categorize & bulk writes (S59): categories.eq.{}, servers_audit trigger, SSE maxDuration
- Advisories & OSV scan path (S51): lib/advisories.ts, collectAdvisories, cve_count, Hero.tsx
- Build & gate recipes (S51): env -u, prerender-manifest, jiti
- Registry sync & MCP registry API (S58): sync-registry, schema 2025-12-11, transport, repository.url
- Language & tooling traps (S58): Record prototype lookup, supabase resolves, tsx -e
- Edits, auto-approve & trust gate (S48): edits RLS, self-feeding trust count, verify/archive audit rows
- Caching, listings & retry envelope (S60): unstable_cache sandwich, count estimated, loading.tsx, searchParams
- Homepage degrade + test harnesses (S34/S37/S39/S43/S44, #100): liveDataOrNull, registerTools, mutation harness
- S31/S32/M12 test-residual closure: route-supabase-stub flags, detect-duplicates, normalizeGithubUrl, M15
- S81 homepage aggregate snapshot: REVOKE no-op, SET LOCAL timeout, NULLS FIRST, CREATE INDEX lock
- Homepage outage post-mortem (#100/#102): home_use_cases, home_category_counts, 57014
- S70 advisory reconciliation: reconcileAdvisories, closeOn, bot_runs.summary
- GitHub issues intake (#68, #91, #107, #108): data_quality, merge_thoughtspot_duplicate, transport writer
- Production stopped deploying ~15h (PR #104): vercel.json, deploymentEnabled, gh api deployments
- Vercel deploys double-locked: ignoreCommand, VERCEL_GIT_COMMIT_REF
- in-review status leak: S8/S48/S59/S60, S83 anon RPC check
- Hardcoded 17,000+ counts (S90): opengraph-image, live-counts
- opengraph-image goes dynamic: edge runtime, revalidate rule, 548 CVEs
- OG image caching (2026-08-05): ImageResponse cache-control, four discriminators, two-request check
- Metadata image routes ISR (S93): module-own generateStaticParams, blog OG, lib/blog.ts
- S91/S92 confirmed in prod: two-request check, 36,000+ card
- Prod schema drift (S97): 20260610000000_security_hardening, schema_migrations statements, onboarding cascade
- PostgREST RLS USING filter-out (S99): app/api/username/route.ts, 42501
- Parsing migrations (M19): pg-query-emscripten, DefElem, stmt_location, $$ bodies
- Constraints and auth trigger (S102/S103): handle_new_user, avatar_url, NOT VALID lock
- Cycle deep S52: is_archived six writers, refresh-score archive-forward, compute-scores
- Migrations: what a gate can tell (S107): is not distinct from, SECURITY DEFINER, pg_query
- S104 approve-edit bookkeeping: x-original-actor-id, edits triggers, revalidatePath
- Test harness route-supabase-stub: resolve key, keyByClient, vi.hoisted
- Operational: no error reporting, local main drift, S104 prod verification
- Prod schema state 2026-09-12: check-schema-drift, profiles NULL lockout, SUPABASE_DB_URL, S99 servers facts
- Cloudflare hosting cost (S116/S117/M22): R2 lifecycle, withRegionalCache, enableCacheInterception, shared account
- Request-path retry envelopes (S78): withDeadline budgets, unstable_cache rejection, maxDuration
- S73 admin moderation queue: edits no created_at index, fetchSeq, TDZ, route-supabase-stub recorded methods
- Workers fetch no User-Agent (2026-10-26, S36): GitHub 403, fetchPageReadme, MCP_INTERNAL_KEY
- /api/submit filter sanitization (S112): sanitizeFilterValue, github_url raw check, M23
