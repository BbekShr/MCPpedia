# Bug fix

## Method
1. **Reproduce first** on your branch's base with `/mcppedia-verify`. No repro, no fix: report
   CAN'T REPRODUCE with what you tried.
2. **Write the failing test** that captures the bug, and watch it fail for the reported reason.
3. **Find the root cause**, not the symptom: why was the wrong value possible at all? Check every
   caller of the function you're about to change.
4. **Smallest fix** that makes the test pass. No drive-by refactors.
5. **Look for siblings**: the same mistake elsewhere (grep the pattern). Fix them in scope, or list
   them as `FACT:` lines for new backlog items.
6. Re-run the repro: it must now behave correctly, with evidence.

## In this project
- Regression tests are Vitest: `__tests__/` for routes, pages and bots, `lib/__tests__/` for
  `lib/` units. Both are protected paths: a new test file is fine; editing an existing assertion
  needs the brief to say so.
- Route handlers are tested through `__tests__/helpers/route-supabase-stub.ts`. The stub doesn't
  execute ordering, filtering, pagination or RLS: a bug in one of those needs a test that runs the
  real logic (extract it into a pure `lib/` function and test that), or it's a shape pin.
- Reproduce data bugs read-only: the public page `/s/<slug>` shows what a listing really holds.
  Never "reproduce" by running a bot against production.
- Siblings: the same unchecked-write or swallowed-error pattern usually exists in neighbouring
  routes (`174c47c` fixed five at once). Grep for it.
