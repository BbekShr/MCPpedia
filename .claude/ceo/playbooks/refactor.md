# Refactor

## Method
1. **No behaviour change, provably.** Before touching code, make sure tests pin the current
   behaviour of everything you'll move. If they don't, write those tests first, as their own
   commit.
2. **Small, mechanical steps**, each one green. Rename, move, extract, inline. Never rewrite.
3. **No new features, no bug fixes** in the same diff. Found a bug? Write it down as a `FACT:`
   line and leave it.
4. **The diff should shrink or hold steady.** A refactor that adds net lines needs a reason.
5. Gates green after every step, and the same public behaviour (outputs, API, UI) at the end.

## In this project
- Target structure: shared queries and field lists live in `lib/` (`lib/servers-query.ts`,
  `lib/constants.ts` `PUBLIC_*_FIELDS`); pages compose them. Don't duplicate a select list.
- Duplicated contracts that must change together: the two Supabase mock clients in
  `lib/supabase/server.ts` and `lib/supabase/public.ts` (R1), and `lib/mcp/*` with the separate
  `mcppedia-server` repo (BACKLOG M3: a fix here does not reach it).
- `lib/supabase/**`, `proxy.ts` and `lib/validators.ts` are protected: a refactor there needs the
  `human-approved` label and a named reason.
