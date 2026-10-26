# Shared lessons (every agent)

## Active
- Resolve every `.claude/...` path against the repo root in your brief, never against your home directory.
- Never `git stash`, `checkout`, `switch`, `reset` or `rebase`: other agents share this tree, and the stash stack is shared across every worktree (M16).
- Every finding needs a failure scenario (input/state → wrong outcome) with file:line.
- A missing or stale `node_modules` reads exactly like a red `tsc`: run `npm ci` before concluding `main` is broken (S73, `5c6e29a`).
- Next.js 16 is a breaking-changes version: read `node_modules/next/dist/docs/` before Next-specific code (AGENTS.md).
- PostgREST silently truncates an unpaginated read at 1000 rows; a truncated read is not "no rows" (S9).
- A Supabase write that matched zero rows is a failure, not a success: check `error` AND the row count (`174c47c`).
- Migrations don't auto-apply on deploy: a merged migration is not a live one until a human runs it (S21, S98).

## Archive
