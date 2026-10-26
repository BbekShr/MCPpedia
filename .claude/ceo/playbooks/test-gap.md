# Test gap

## Method
1. **Test the invariant, not the current behaviour.** A test that mirrors whatever the code does
   today is not a guard. Write what *should* be true, from the docs, the contract, or the item.
2. **Prove each test has teeth**: break the code on purpose (in your worktree only), watch the test
   fail, then restore it. A test that can't fail is decoration.
3. **Behaviour over shape.** A test against a stub that doesn't execute the behaviour (ordering,
   filtering, auth, caching) proves a call was made, not that it's right. Prefer real fixtures.
4. **Fast and deterministic**: no network, no wall-clock sleeps, no order dependence.
5. Wire the new tests into the gate that CI runs, or they don't exist.

## In this project
- Vitest (`npm test` = `vitest run`, node environment, `@` alias to the repo root), run in CI by
  `.github/workflows/ci.yml` on every PR. A new file under `__tests__/` or `lib/__tests__/` is
  picked up automatically; no gate wiring needed.
- Both test directories are protected (`CLAUDE.md` §5): new test files are fine, but changing an
  existing assertion is a protected-path change the PR must name.
- Fixtures over mocks for ordering, filtering, pagination and caching; the route stub is fine for
  "did it check the error" assertions.
- Prove teeth in your worktree only: break the code, watch the test fail, restore. Never mutate
  a file another agent may be reading (M16).
