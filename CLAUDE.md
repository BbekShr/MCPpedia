@AGENTS.md

# MCPpedia — Constitution

## 1. What this is

MCPpedia (mcppedia.org) is an encyclopedia of 19,000+ MCP servers: Next.js 16 (App Router) +
React 19 + TypeScript + Tailwind 4 on Vercel, with Supabase (Postgres + auth) as the database,
Vitest for tests, and a fleet of 14 scheduled GitHub Actions bots (`bots/`) that sync the MCP
registry, compute 0–100 scores, generate blog posts, and send digests. **Merging `main` deploys
to production** — every PR is a prod change.

## 2. Run & verify

| Action | Command |
|---|---|
| Install | `npm ci` (CI) / `npm install` (local) |
| Dev server | `npm run dev` |
| Typecheck | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Test | `npm test` (vitest run) |
| Build | `npm run build` |

**Verification bar for ANY change:** `npx tsc --noEmit` ∧ `npm run lint` ∧ `npm test` all green.
For changes touching routing, pages, config, or anything Next-specific, also `npm run build`.
There is currently no smoke/e2e gate (filed as S3 in BACKLOG.md). **Never weaken a gate to
pass** — no skipped tests, no loosened assertions, no eslint-disable to silence a finding.

## 3. Architecture

- `app/` — Next.js App Router: all pages plus ~28 API routes (`app/api/**/route.ts`): public
  API v1, vote/flag/submit/search/discuss, admin endpoints, SVG badge widgets, webhooks.
- `lib/` — domain logic: `scoring.ts` (the 0–100 server scoring engine, ~1,080 lines),
  `validators.ts` (zod schemas + `sanitizeSearchQuery`), `rate-limit.ts` (Supabase RPC-backed),
  `supabase/` (admin/server/client/middleware/public clients), `mcp/` (MCP tools/resources for
  the site's own MCP endpoint), `blog.ts`, `karma.ts`.
- `bots/` — 14 scheduled bots run by `.github/workflows/*.yml` (sync-registry, compute-scores,
  generate-blog, enrich-descriptions, …) sharing helpers in `bots/lib/`.
- `components/` — React components (client + server).
- `proxy.ts` — Supabase session-refresh middleware, cookie-presence gated for Vercel cost;
  its long comment explains why — read it before touching.
- `mcppedia-server/` — standalone MCP server for querying MCPpedia programmatically.
- `scripts/` — one-off maintenance scripts. `supabase/migrations/` — database schema.
- `__tests__/` + `lib/__tests__/` — Vitest suites (97 tests).

## 4. Critical rules

- **This is a breaking-changes version of Next.js** — read the relevant guide in
  `node_modules/next/dist/docs/` before writing any Next-specific code (see AGENTS.md).
- **The rate limiter fails OPEN by design** (`lib/rate-limit.ts` header comment): on infra
  failure it allows the request. Do not "fix" this to fail-closed without a human decision.
- **All raw user input that reaches a PostgREST `.or()`/`.ilike` filter must pass
  `sanitizeSearchQuery`** (`lib/validators.ts`) — it strips filter-syntax injection.
- **Admin API routes must verify `profiles.role IN ('maintainer','admin')`** via an authed
  server client before acting (pattern in `app/api/admin/bots/route.ts`).
- **`SUPABASE_SERVICE_ROLE_KEY` is server-only** — used in `lib/supabase/admin.ts` and bots.
  Never import the admin client into client components; never prefix secrets `NEXT_PUBLIC_`.
- **Untrusted markdown/HTML renders through `rehype-sanitize`** — never
  `dangerouslySetInnerHTML` with user- or bot-generated content.
- **`proxy.ts` matcher logic is both auth-critical and cost-critical** — path-narrowing broke
  auth before; changes here need the human-approved label anyway (protected path).
- Blog/bot claims must be fact-checked against the real codebase and Supabase — never borrow
  claims from prior posts as ground truth.

## 5. Protected paths

Changes to these paths are labeled `human-approved` by the agent and merged without review
(see §6 for the merge rule this depends on). The list is retained so the label still marks
which PRs touched sensitive surface, and applying it is an explicit act: the agent states in
the PR body WHICH protected path was touched and why, so the label is never silent:


- `CLAUDE.md` and `AGENTS.md` (the rules must not self-amend)
- `.github/workflows/**` (CI and all bot schedules)
- `.env*` (secrets)
- `proxy.ts` and `lib/supabase/**` (auth/session layer)
- `lib/validators.ts` and `lib/rate-limit.ts` (security layer)
- `supabase/migrations/**` (prod schema — effectively irreversible)
- `__tests__/**` and `lib/__tests__/**` (test assertions are the verification bar)

## 6. How the org works

- Three standing goals, in precedence order: (1) improve the app — stability, features,
  refactors; (2) keep it current — track upstream/dependency drift (Next.js 16, React 19,
  Supabase SDKs, the MCP registry API); (3) improve the org itself — sharpen the
  agents/skills/gates; file a process item whenever a cycle exposes a gate that missed
  something or an ambiguous rule.
- The CEO is the orchestrating session ONLY; it dispatches departments and does not do
  department work itself. Independent agents run in PARALLEL (one message, multiple spawns);
  dependent stages (research → design → build) stay sequential.
- Departments = the named agents in `.claude/agents/`. Every change is a branch + PR with a
  verification-evidence section. Nothing merges on a red gate, and nothing merges without
  that evidence section — but a PR whose gates are green, whose review board found no
  CONFIRMED correctness bug, and whose guard is green MAY be merged by the agent, including
  after self-applying `human-approved` per §5. Decided 2026-08-04 by the maintainer; this
  replaces the previous "NOTHING auto-merges" rule, which contradicted §5.
- Three memory stores (see `docs/org-memory/README.md`): `CLAUDE.md` = Rules (human-approved
  PRs only), `BACKLOG.md` = Tasks (cycles change Status/notes/append rows ONLY), and
  `docs/org-memory/` = Facts (written at the Records step, read before every task).



- A PR is ready to merge only when required checks are green ∧ review found no CONFIRMED
  correctness bug ∧ guard is green. These three conditions are the gate; they are not
  waivable by the agent, and `gh pr merge --admin` (which bypasses them) stays forbidden.
- Two things remain the maintainer's alone, regardless of the above: **changes to
  `CLAUDE.md`/`AGENTS.md` themselves** (the rules must not self-amend — an agent may open
  a PR proposing a rules change but never merges it), and **outward-facing acts** —
  posting or replying on a GitHub issue, closing an issue, labeling someone else's PR, or
  anything that speaks to a third party in the maintainer's name.
