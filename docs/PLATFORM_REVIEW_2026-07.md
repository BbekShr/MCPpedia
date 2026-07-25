# MCPpedia — End-to-End Platform Review & Forward Plan

**Date:** 2026-07-19 · **Method:** five parallel deep-review passes (architecture/code quality, security & data integrity, user/admin workflows, infrastructure & cost, product strategy) over the live codebase, plus competitive research (Smithery, Glama, PulseMCP, Docker MCP Catalog, official registry).

**Constraints this plan respects:** Vercel Pro $20/mo (single member), Supabase project **shared** with one other project (shared pool, disk, egress), GitHub Actions free-tier bot fleet.

> **⚡ Execution status (2026-07-19): Phase 0 complete — 8 open PRs (#57–#64), nothing merged.**
> See §6 Phase 0 for the per-item breakdown. Two things need a human decision before merge:
> 1. **PR #61** removes `tools`/`resources`/`prompts` from the public **v1 list** endpoint (outward-facing API change).
> 2. **PR #63 (ops) omits Sentry** — needs a Sentry project + DSN secret to wire up.
>
> 5 of the PRs touch protected paths (migrations/tests/workflows) and need the `human-approved` label for CI `guard` to pass.
>
> ⚠️ **Correction (2026-07-19, post-incident):** an earlier version of this doc said "migrations apply on deploy." **That is false and it caused a production incident.** There is **no** deploy-time migration step — CI only *guards* the `supabase/migrations/` path, the build is a plain `next build`, and nothing runs `supabase db push`. Merging a PR does **not** apply its migration; a human must apply it manually (Supabase CLI or SQL editor). A migration file being merged to `main` therefore does **not** mean it is live. See §6 and the servers-listing timeout incident.

---

## 0. Executive summary — the drastic version

MCPpedia is a technically ambitious auto-scraped directory with a genuinely rare asset — **catalog-wide security scanning** (tool-poisoning, injection-vector, rug-pull detection, real CVSS math across ~32k active servers) — that it then hides inside a single 0–30 sub-score nobody sees. Meanwhile:

- The **community layer is theater.** Flags go into a black hole (no admin queue exists). Karma grants zero privileges. Notifications fire for exactly one event type. There is no user dashboard, no settings page (the onboarding *promises* one), and no reason for a logged-in user to ever return.
- The **trust pipeline is unmoderated at the front door.** Submissions auto-publish instantly into the public catalog and SEO pages — 5/hour per account, no pending queue — while moderation tooling can only archive after the fact, one click at a time.
- The **headline Security score rests on untested math.** The hand-rolled CVSS 3 calculator has zero direct tests; a single wrong constant silently mis-grades every server with a CVE.
- **Every deploy is a gamble.** Build-time full-table scans against a shared database have blocked deploys repeatedly (S8, S12); CI runs env-less so it structurally *cannot* catch this class of failure; and nothing alerts anyone when a deploy or bot fails.
- The **admin audit trail has been silently broken since 2026-06-10** — an RLS policy rejects every archive/verify audit insert and the error is swallowed (confirmed, see §2.1).
- The site says "19,000+ servers" while the DB holds ~46k rows (~32k active), the homepage stats froze for two weeks without anyone noticing, and the repo root carries ~50 stray screenshot PNGs and tracked `.DS_Store` files.

The one-sentence verdict: **strong scraper, unique scanner, no community, no ops, invisible differentiator.** The plan below fixes the bleeding first, then converts the scanner into the product.

---

## 1. Confirmed bugs (fix first, roughly in this order)

| # | Bug | Evidence | Severity |
|---|-----|----------|----------|
| 1 | **Admin audit-trail loss.** `archive` and `verify` routes insert an `edits` audit row with `status:'approved'` via the *user-scoped* client; the only INSERT policy on `edits` requires `status='pending'`, so RLS rejects every insert and the unchecked error is swallowed. No admin archive/verify has been audited since the 2026-06-10 hardening migration. | `app/api/admin/archive/route.ts:55-65`, `app/api/admin/verify/route.ts:47-57`, `supabase/migrations/20260610000000_security_hardening.sql:28-33` | Critical |
| 2 | **Broken filtered pagination on `/servers`.** `min_score`/`transport`/`author` filters run in JS *after* DB pagination — under-filled pages, wrong `hasNextPage`, rows silently vanish between pages. | `app/servers/page.tsx:61-70` | Critical (core browse UX) |
| 3 | **Untested CVSS engine behind the Security score.** `computeCVSS3BaseScore`/`parseCVSSScore` are unexported and untested; every scoring test passes `null` packages so the CVE-penalty path is never exercised. | `lib/scoring.ts:69-113`, `__tests__/scoring.test.ts` | Critical (product credibility) |
| 4 | **Health status manipulable by one user.** `health_checks` rows carry no `user_id`; last-5 majority decides `last_health_check_status`, so 5 `fail` reports from one account flips a healthy server to `fail`. | `app/api/health-report/route.ts:37-83` | High |
| 5 | **Public API v1 is a free firehose.** Unauthenticated, un-rate-limited, CORS `*`, returns full `tools`/`resources`/`prompts` JSONB with uncapped `offset` — scrape-the-catalog-for-free plus deep-offset scan cost on the shared DB. | `app/api/v1/servers/route.ts:49,85,103` | High |
| 6 | **13 of 28 API routes have no rate limit**, including state-changing `discuss`, `favorites`, and the expensive `refresh-score` (triggers OSV/deps.dev scans). | grep across `app/api/**` | High |
| 7 | **Mutating admin GET.** `/api/admin/categorize` writes on GET — CSRF-exposed under `SameSite=Lax` top-level navigation. | `app/api/admin/categorize/route.ts:8` | Medium |
| 8 | **Favorites route leaks raw DB errors** and skips UUID validation. | `app/api/favorites/route.ts:36,61` | Low |

**Fix status (2026-07-19):** #1 ✅ PR #57 · #2 ✅ PR #58 · #3 ✅ PR #60 · #4 ✅ PR #62 ·
#5 ✅ PR #61 · #6 ✅ PR #61 (the abusable subset — badge/widget/webhook/etc. intentionally
skipped, see PR) · #8 ✅ PR #61. **Still open: #7** (mutating admin GET on
`/api/admin/categorize` — CSRF) — Medium, not part of Phase 0; file as its own row.

What audited **clean** (credit where due): PostgREST filter injection (`sanitizeSearchQuery` applied everywhere it matters), all admin-route role checks, RLS privilege-escalation surface, service-role key confinement, markdown/SVG XSS (rehype-sanitize + `escapeXml`), SSRF on github-metadata, atomic vote/verify RPCs, disabled-until-signed webhook.

---

## 2. Infrastructure & cost — surviving on $20 + a shared database

### 2.1 The deploy-fragility loop (P0)
Build-time prerender runs live queries against the shared DB (`app/analytics/page.tsx:482-537` walks all ~32k rows; `lib/sitemap-shared.ts` too). CI builds **env-less** with mock clients, so the exact production failure mode — slow shared DB → statement timeout → build throws → **deploy blocked** — is invisible until Vercel. This has already happened three times (commits 8916bc6, 7c8bd1a, 7963b80; backlog S8, S12).

**Fixes:**
1. Add `tool_count` (and similar denormalized aggregates) so no page ever needs the `tools` JSONB at build or list time.
2. Make build-time fetchers **degrade, not throw**: on timeout, serve last-known-good (cached JSON snapshot committed by a bot) instead of failing the whole deploy.
3. Post-deploy smoke check (backlog S3): curl `/`, one server page, `/analytics`, one API route; alert on failure.

### 2.2 Vercel invocation burn (P0)
`app/page.tsx:35` is `force-dynamic` — the highest-traffic page pays a serverless invocation per visit to dodge a DB timeout that should be fixed at the data layer (S8). Move homepage back to ISR with `revalidate` once `home_stats` refresh is reliable.

### 2.3 Egress (P1) — directly hits the *shared* Supabase quota
- `PUBLIC_CARD_FIELDS` (`lib/constants.ts:99-110`) ships full `tools` JSONB on **every listing card** just to render a count.
- `app/s/[slug]/page.tsx:61-64` fetches `tools` **twice** per detail render (metadata + body).
- Fix: `tool_count` column, backfill, drop `tools` from card fields and `generateMetadata`. This kills the recurring build-timeout class *and* the largest egress line in one change.

### 2.4 Bot fleet vs. the shared pool (P1)
- `compute-scores` does ~32k row-by-row UPDATEs plus a nested per-advisory upsert loop (`bots/compute-scores.ts:160-227`) — with the 300ms sleep, it can't finish in 6h and bails at a 5h deadline, leaving partial writes with no per-server transaction.
- Five other bots share the same one-UPDATE-per-row pattern; `fetchAllRows` still uses OFFSET pagination (the anti-pattern already excised from `/analytics`).
- Cron collisions: 08:00 UTC runs `compute-scores` + `extract-schemas` simultaneously; 09:30 runs two more; no cross-workflow concurrency guard, so `snapshot-metrics` (08:30) can record mid-recompute numbers.
- Fix: batch upserts, keyset reads, stagger crons, add workflow `concurrency` groups.

### 2.5 Observability: none (P1)
No Sentry, no uptime monitor, no alerting. Bot failures = a red Actions run emailing whoever committed last. `home_stats` froze for two weeks silently. Deploy failures have no alert path.
**Minimum viable ops (near-zero cost):** Sentry free tier (or Vercel log drains) for API 500s; a GitHub Action that posts to email/Slack/Discord on any workflow failure; a scheduled freshness probe asserting `home_stats.updated_at < 48h` and last successful `compute-scores` run < 48h.

### 2.6 Shared-tenant blast radius & DR (P2)
The other project can exhaust the pool (kills SSR + bots), fill the disk (Postgres read-only → all writes fail), or burn egress. There is no backup/restore runbook anywhere, and migrations are "effectively irreversible."
**Fix:** one-page DR runbook; confirm PITR/backup settings; document the "other project ate the pool" playbook. Longer-term: budget permitting, a dedicated Supabase project is the single best infra upgrade available (~$25/mo).

### 2.7 Misc
- Realtime websocket opened per `/s/[slug]` view (`components/DiscussionSection.tsx:51-53`) — a shared-quota connection per visitor for a feature most viewers never use. Lazy-connect on interaction.
- SPOFs with no circuit breaker: MCP registry API, GitHub API (incl. hotlinked avatars), npm registry, Anthropic API, OSV, Resend.
- Repo hygiene: ~50 screenshot PNGs (up to 3.9MB) at root, tracked `.DS_Store` in five directories, committed data blobs. Gitignore and purge.

---

## 3. Workflow review — the user's actual journeys

### 3.1 New visitor (anonymous) — grade: B−
Generous read access (browse, search, compare, configs, reviews) and a rich detail page. But:
- **No fuzzy search.** `plainto_tsquery('english', …)` means "supabse" returns nothing on a 32k-item directory. Add `pg_trgm` similarity fallback + prefix matching. This is the single biggest discovery failure.
- Broken filtered pagination (§1.2).
- No facet counts on filters (blind pills), minimal empty states, no "did you mean".

### 3.2 Sign-up & onboarding — grade: C
GitHub + Google OAuth only (defensible for the audience). But onboarding is a username picker plus a static karma explainer; nothing captures interest, seeds favorites, or personalizes anything. The welcome copy promises "change it later in settings" — **no settings page exists.** Google-only users hit a dead branch at GitHub-proof claims.

### 3.3 Existing user — grade: D. There is no retention loop.
- **No dashboard.** No view of your submissions, pending edits, claims, reviews, or flags — once submitted, in-app invisible.
- **Notifications fire for one event** (edit approved/rejected). No reply, claim-outcome, security-advisory-on-favorite, or new-in-category notifications.
- **Karma is motivational theater**: grants zero privileges (auto-approval keys off `edits_approved` count, not karma), has no leaderboard, is invisible outside your own noindex profile, and its "Maintainer" tier misleadingly collides with the real `role` column. Reviews and favorites — the two easiest actions — earn nothing.

### 3.4 Server submission & contribution — grade: C−
Excellent duplicate detection and instant scoring at submit. But:
- **Auto-publish with no moderation queue** — spam/typosquats go live and into SEO instantly; admin can only archive reactively.
- **Submitters can't manage their own listings** — same stranger-grade edit-proposal flow, no "my submissions" list.
- **Owner claims are fully manual** (maintainer eyeballs a pasted proof; `dns_txt`/`github_org` proofs collected but never verified programmatically — backlog S6) and **claiming grants nothing** beyond a badge: a verified publisher still can't edit their own server. The claim funnel dead-ends.

### 3.5 Discussions & reviews — grade: D+
2-level threading with no reply-to-reply; no user edit or delete (posts are permanent); no reply notifications; flagged comments have no resolution path (§3.6); the empty-state suggestion chips are fake buttons; and reviews are a parallel un-flaggable, karma-dead comment system.

### 3.6 Admin & moderation — grade: D (except bots tab: B+)
- **The flags queue does not exist.** `flags` is write-only — no tab, no route, no UI. Every user report ever filed is unread.
- No bulk actions (spam waves cleared one click at a time), no ban/suspend/user-moderation lever, history capped at 100 client-filtered rows, role escalation via a bare `<select>` with no confirmation.
- The bots tab is the most polished admin surface — the org has prioritized automation over community stewardship, and it shows everywhere above.

---

## 4. Code quality & testing

- `lib/scoring.ts` is a 1080-line god file mixing pure scoring math with live `fetch` calls (OSV, deps.dev) — which is *why* the CVE path is untested. Split fetchers from math; inject results; test against official CVSS 3.1 reference vectors.
- **Zero tests for all 28 API routes and all 14 bots.** The 97 tests cover scoring happy-paths, validators, rate-limit, widget escaping, and trivial home components. The data pipeline that writes all production content is entirely unverified.
- Token-efficiency scoring is `length/3.5` marketed as "actual token measurement", with grade cliffs at 500/1500/4000/8000 — a ±14% tokenizer error flips letter grades. Use a real tokenizer in the bot or soften the claim.
- Filter/sort logic copy-pasted across three surfaces (`app/servers/page.tsx`, `app/api/v1/servers/route.ts`, the search RPC) and already diverging. Extract one query builder.
- Two independent retry implementations (`lib/retry.ts`, `bots/lib/supabase.ts`); the bot writes that most need retries use neither.
- Six `eslint-disable react-hooks/*` suppressions in client components hiding real React 19 effect/purity violations; 47 `"use client"` components including 500-line read-mostly score panels that should be RSC islands.
- CSP allows `script-src 'unsafe-inline'` (`next.config.ts:45`), neutering XSS defense-in-depth. Move to nonces.
- Done well (leave alone): `proxy.ts` cookie-gating and its rationale; `unoptimized` avatar images (zero image-optimization spend); badge/widget CDN cache headers; ISR strategy for the long tail; bot secret-stripping and fail-loud-on-zero-updates semantics; OSV-failure guard protecting good CVE data.

---

## 5. Strategy — what makes this platform actually useful

### 5.1 Honest positioning
Breadth is a commodity: everyone (Smithery, Glama, PulseMCP, mcp.so, official registry) has 20k+ listings from the same corpus. Smithery owns hosting/runtime, Glama owns live inspection, PulseMCP owns standards credibility (steering-committee authors, conforming registry API), Docker owns supply-chain attestation.

**MCPpedia's real, verified differentiator: it is the only directory running tool-poisoning / injection-vector / rug-pull / CVSS analysis across the entire catalog** (`lib/scoring.ts:370, :527, :478, :69`) — the exact thing the ecosystem is most afraid of (Invariant's mcp-scan was acquired by Snyk for the per-user version of this). Nobody publishes it catalog-wide. Today an honest answer to "why MCPpedia?" is *"you'd use it if you knew the scan existed."*

**Thesis: stop competing on breadth. Become the trust & evidence layer of the MCP ecosystem — human-readable and machine-consumable.**

Verified white space nobody serves: catalog-scale published security evidence · public tool-definition change feeds (rug-pull early warning) · remote-server liveness monitoring · spec-version compatibility tracking (acutely timely: the 2026-07-28 MCP spec RC removes the initialize handshake/sessions and deprecates Roots/Sampling/Logging with 12-month windows — a migration wave no directory tracks).

### 5.2 Ranked bets

| # | Bet | Why | Effort | Protected paths |
|---|-----|-----|--------|-----------------|
| 1 | **Implement the official Sub-Registry OpenAPI spec** (`GET /v0.1/servers` + versions), with MCPpedia scores + security summary in namespaced `_meta` | The standard interface MCP clients/gateways/mirrors consume; PulseMCP ships one but *cannot* carry this security payload. Highest-leverage path to "the data source others build on." | M | no |
| 2 | **Security Evidence pages + JSON feed** — per-server per-check evidence (the offending tool-description string, pass/fail flags), `GET /api/v1/servers/{slug}/security`, site-wide flagged feed | The data is already computed and invisible. Presentation + one route. Turns the differentiator into the product. | S–M | maybe (persist per-check evidence) |
| 3 | **Tool-definition change feed ("rug-pull monitor")** — hash + diff tool schemas per extraction; `/changes` page + RSS/JSON; suspicious diffs feed security-alert blog | Genuinely novel public early-warning system; extract-schemas already re-extracts daily and stability comparison exists. | M | yes (migration) |
| 4 | **Open dataset + embeddings drop** — monthly servers/scores/tool-schemas dump to Hugging Face/GitHub, open license | Cheapest goodwill/backlink/citation engine; MCP-security researchers have no catalog-scale dataset. | S | no |
| 5 | **Spec-version compatibility tracking + 2026-07-28 migration guide** — detected SDK/spec version per server, deprecated-primitive flags, filter + guide content | Timely (12-month deprecation clocks ticking), large SEO surface, extractable from manifests bots already fetch. | M | no |
| 6 | **Remote-server liveness probing** — weekly Actions bot attempts `tools/list` against remote-transport servers; liveness badge + last-seen-alive | Remote servers are the growth segment; no directory reports whether endpoints actually respond. Actions minutes, not Vercel compute. | M | yes (workflow + migration) |
| 7 | **API v1 completeness** — per-server detail + tools endpoints (list-only today), with rate limits & sane payloads (fixes §1.5 en route) | Table stakes for API-first users; Glama has them. | S | no |
| 8 | **"State of MCP Security" annual report** from scan data | The press/backlink flagship; pairs with #4. | M | no |
| 9 | **Scoring engine as a standalone npm package** + versioned methodology page | Turns the scanner from site feature into ecosystem infrastructure ("score my server pre-publish" in CI). | M | no |
| 10 | **Client compatibility matrix** — pivot works-for-me verification into works-with-which-client (Claude Code / Cursor / Cline / Windsurf) | Nobody has a server-by-client matrix; crowdsource loop already half-exists. | M | no |

### 5.3 Explicitly do NOT build
Hosting/runtime/OAuth gateway (Smithery's moat, real infra spend) · in-browser live inspector (Glama's moat, a security liability to run cheap) · SBOM/signing pipeline (Docker's structural advantage — link their attestations instead) · AI-chat/semantic-search as headline (commodity + inference cost) · the volume race ("most servers!") · enterprise private sub-registries (sales-led, wrong shape) · newsletter expansion (PulseMCP's steering-committee newsletter is unbeatable positioning).

---

## 6. Phased plan

### Phase 0 — Stop the bleeding (1–2 weeks of cycles)

**Status: all 8 items executed 2026-07-19 → 8 open PRs, nothing merged.** Each PR
carries verification evidence; the 5 touching protected paths need a human to add
the `human-approved` label before their CI `guard` job goes green.

1. ✅ **DONE — PR #57 (S13).** Fix admin audit-trail RLS bug (§1.1). Shipped via
   service-role admin-client insert (no migration needed), so **guard is green**.
2. ✅ **DONE — PR #58 (S14).** Fix `/servers` filtered pagination (§1.2) — pushed
   `min_score`/`transport`/`author` into the `search_servers` RPC. *(protected: migration)*
3. ✅ **DONE — PR #59 (S15).** `tool_count` STORED generated column + dropped `tools`
   from card fields, `generateMetadata`, OG image, and similar-servers (§2.3).
   *(protected: migration — one-time table rewrite on deploy)*
4. ✅ **DONE — PR #61 (S16).** Rate-limited favorites/github-metadata/server[slug]/
   refresh-score/v1; v1 offset capped at 10k + heavy JSONB trimmed (§1.5–1.6); favorites
   UUID-validated + stopped leaking raw DB errors (§1.8). **Guard green.**
   ⚠️ **NEEDS ATTENTION:** dropping `tools`/`resources`/`prompts` from the v1 **list**
   response is an outward-facing API change — human call before merge.
5. ✅ **DONE — PR #60 (S17).** Exported `computeCVSS3BaseScore` + pinned the engine to
   official CVSS 3.1 reference vectors, 97→120 tests (§1.3). *(protected: tests)*
6. ⚠️ **PARTIAL — PR #63 (S19).** Shipped the freshness probe (every 6h, alerts when
   `home_stats_cache` >48h stale) + fleet-wide `alert-on-failure` workflow (§2.5).
   *(protected: workflows)* **NEEDS ATTENTION: Sentry NOT included** — requires a human
   to create the Sentry project and add the DSN secret; left as a follow-up.
7. ✅ **DONE — PR #62 (S18).** Health-report per-user dedup (§1.4) — added `user_id`,
   recompute status/uptime from one vote per distinct user. *(protected: migration)*
8. ✅ **DONE — no PR needed.** Repo hygiene (§2.7) was **already satisfied**: `.gitignore`
   already covers `.DS_Store`, root `/*.png`, and playwright artifacts; nothing stray is
   tracked (only `public/logo.png`). The 62 root PNGs are untracked local files.

Backlog rows S13–S19 filed in PR #64. **Migrations (PRs #58/#59/#62 and the later
#65-adjacent ones) do NOT auto-apply — there is no deploy-time migration step.** A human
must run each one manually (Supabase CLI / SQL editor) *after* merge; until then the
schema change is not live even though the file is on `main`. #59's generated column
rewrites the `servers` table once when it is applied.

### Phase 1 — Make the community layer real (2–4 weeks)
1. **Admin flags queue** (the black hole) + bulk actions + ban/suspend lever.
2. **Moderation gate on submissions** — `pending` status for new community submissions (or trust-gated instant publish for proven accounts), queue in admin.
3. **User dashboard** — my submissions / edits / claims / reviews + settings page (fulfill the onboarding promise).
4. **Notifications that matter** — replies, claim outcomes, security advisories on favorites. *(migration for new types — already scoped in backlog S6)*
5. **Close the claim loop** — automated GitHub-proof verification (S6) *and* give verified publishers real edit rights over their own listing.
6. **Make karma mean something** — feed it into edit auto-approval trust, add a leaderboard, grant points for reviews; rename the "Maintainer" tier.
7. **Fuzzy search** — `pg_trgm` fallback + prefix matching in the search RPC. *(protected: migrations)*
8. Discussions: reply-to-reply, user edit/delete, reply notifications.

### Phase 2 — Ship the trust layer (1–2 months)
Bets #1, #2, #7 (sub-registry API + security evidence + API completeness) — these three together are the repositioning. Then #3 (change feed) and #4 (open dataset).

### Phase 3 — Compound (quarter+)
Bets #5, #6, #8, #9, #10. The annual security report (#8) is the flagship moment — schedule it, work back from it.

### Standing infra track (parallel, low intensity)
Batch bot writes + keyset `fetchAllRows` + cron staggering (§2.4) · homepage off `force-dynamic` once S8 lands (§2.2) · build-time degrade-don't-throw + smoke check (§2.1, backlog S3) · DR runbook (§2.6) · nonce-based CSP · API-route and bot test coverage, one surface per cycle.

---

## 7. Success criteria (how we'll know it worked)

- **Ops:** zero silent failures — every bot/deploy failure alerts within minutes; homepage stats never stale >48h; no deploy blocked by a build-time DB timeout for a full quarter.
- **Trust product:** MCPpedia's `/v0.1/servers` endpoint validated against the official OpenAPI spec; at least one external tool consuming it; security-evidence pages indexed and linked from at least one third-party writeup.
- **Community:** flag-to-resolution median < 72h; >20% of new submissions from accounts that return within 30 days; claim approval automated for GitHub proofs.
- **Data quality:** zero spam servers surviving >24h in the public catalog; stated catalog count matches the DB.

---

*Full per-finding evidence (file:line for every claim) lives in the five review reports this document synthesizes; each Phase 0/1 item is scoped to become a BACKLOG.md row via the normal cycle process. Nothing here edits protected paths without the human-approved label.*
