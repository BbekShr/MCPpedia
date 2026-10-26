---
name: mcppedia-verify
description: How to run, drive, and inspect MCPpedia for real, so agents verify their own changes and reproduce bugs instead of guessing from the code. Covers setup in a worktree, starting the Next dev server on a pinned port, driving pages and API routes (browser pane, Playwright MCP, curl), runtime inspection (server logs, console, network, cache headers, the prerender manifest, the local Worker preview), and teardown. Load before any verification, reproduction, perf claim, or UI check.
---

<!-- Adopted by agent-org /org-init adopt on 2026-10-25, seeded from .claude/commands/qa.md.
     This is the org's "control" skill: the eyes and hands agents use on the running app. The
     CEO maintains it: every time an agent flails at running or driving the app, the fix lands
     here as a concrete step. -->

# Verify MCPpedia for real

"The code looks right" is not verification. Run it, drive it, look at what it actually does,
and attach the evidence.

**There is no staging database.** `.env.local` points the local app at the production Supabase
project, which is on the Free plan (5 GB egress). Local runs are read-only: browse and call GET
routes, never sign in as an admin, approve, vote, submit, claim or edit, and keep page loads to
what the check needs. Never run a bot (`bots/*.ts`) with these env vars: bots are proven on
fixtures in tests. Never point anything at mcppedia.org.

## Setup (in the worktree you were given; never the main tree if another agent is working there)

1. Dependencies: `npm ci` if `node_modules` is missing or older than `package-lock.json`. For
   tests and lint in a scratch worktree, symlinking `node_modules` from the active worktree is
   fine; for `npm run build` or `next dev`, copy it with `cp -cR` instead (Turbopack rejects a
   symlinked `node_modules`).
2. Env: worktrees don't carry the gitignored `.env.local`. Copy it from the main checkout (the
   first entry of `git worktree list`):
   `cp "$(git worktree list | head -1 | awk '{print $1}')/.env.local" .env.local`.
   Never print it, commit it, or paste its values into a report. Without it, pages render against
   the mock Supabase client (empty data), which proves rendering but not data.

## Start it

`npx next dev -p 3100` in the background (3100, not 3000, so a human's own dev server on 3000 is
never mistaken for yours). Wait for the "Ready" line in its output.

Before trusting any result, confirm the process you're talking to is THIS checkout (an old
server on the same port from another worktree is the classic false result):
`lsof -a -p "$(lsof -nP -tiTCP:3100 -sTCP:LISTEN)" -d cwd -Fn` must print this worktree's path.

For Worker-specific behaviour (ISR store, caching headers, bindings), build and run the local
Worker instead: `npm run cf:preview` (see `docs/CLOUDFLARE.md`). It builds the whole app, so use
it only when the question is about the Worker.

## Drive it

Pages, with the browser pane (`anthropic-skills:built-in-browser`) or the Playwright MCP tools, at
desktop (1280) and mobile (375):

| Journey | Route | Check |
|---|---|---|
| Home | `/` | hero stats render, search bar, server cards, no error UI |
| Search | `/servers?q=supabase` | results appear, the count is not "0 servers matching", filter pills render |
| Filtered search | `/servers?q=supabase&min_score=80` | results all meet the filter; pagination totals agree |
| Server page | `/s/<slug>` (take one from the search results) | score breakdown, install config, tools list, advisories |
| Category | `/category/developer-tools` | listing renders, pagination works |
| Security | `/security` | totals and last-scan date render |
| Compare | `/compare/<a>-vs-<b>` (a pair from `data/comparison-pairs.json`) | both columns render |
| Blog | `/blog`, `/blog/feed.xml` | index renders; feed is valid XML |
| SEO | `/robots.txt`, `/sitemap.xml` | served, well-formed |

API routes, with curl: `curl -s 'http://localhost:3100/api/v1/servers?limit=5' | head -c 600`,
`curl -s 'http://localhost:3100/api/search?q=github' | head -c 600`, and the site's MCP endpoint
under `/api/mcp`. Check status codes with `-o /dev/null -w '%{http_code}\n'`.

Signed-in and admin flows can't be driven safely here (they write to production). Prove them with
route tests in `__tests__/` and say in your report that the live check was not done.

## Inspect it (runtime eyes)

- **Server logs:** the `next dev` output you started (errors, `console.error` from routes, Supabase
  errors, slow-query warnings).
- **Browser:** console messages and network requests from the browser pane or Playwright (failed
  fetches, hydration errors, 4xx/5xx).
- **Caching:** `curl -sI <url>` for `cache-control`/`x-nextjs-cache`; `scripts/check-cache-headers.sh`.
- **Build output:** `npm run build` route table and `.next/prerender-manifest.json` (which routes
  prerender, and how many).
- **Timings:** `curl -o /dev/null -s -w '%{time_total}\n'` over N runs; report the median and
  spread. A perf claim needs these numbers, not a code read.
- **Not available from an agent session:** production logs, Cloudflare analytics, and the
  MCPpedia Supabase dashboard. (The Supabase MCP tool in these sessions is connected to a
  different project, not MCPpedia's.) Say so instead of guessing; name what the human should check.

A performance claim needs a measurement. A visual claim needs a screenshot at every required
viewport.

## Evidence to attach

- Bug or fix: the route, the exact request, the response status and the relevant body excerpt or
  a screenshot, before and after.
- Visual change: screenshots at 1280 and 375, light and dark.
- Perf: the command, N, median and spread, before and after, same conditions.
- Gates: the command and the verbatim tail of its output.

## Teardown

Stop the dev server (`kill <pid>`, then confirm `lsof -nP -iTCP:3100 -sTCP:LISTEN` prints
nothing), delete the copied `.env.local` from scratch worktrees, and remove scratch worktrees with
`git worktree remove <path>`.
