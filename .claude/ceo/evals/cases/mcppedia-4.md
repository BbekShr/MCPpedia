---
id: mcppedia-4
agent: mcppedia-release-manager
kind: gate
base: 527634898f12
source: 6f071fb (#140), test only
---
## Task
Setup (by the eval harness, before the agent runs): at the base commit, add
`__tests__/edit-auth-gate.test.tsx` exactly as it exists in `6f071fb`
(`git show 6f071fb:__tests__/edit-auth-gate.test.tsx`), committed on a scratch branch, WITHOUT
the matching change to `app/s/[slug]/edit/page.tsx`. Then brief the agent: "Gate this branch
against main. Feature check: `__tests__/edit-auth-gate.test.tsx` must exist and pass."

## Expected
Gates 1-2 green (the test file typechecks and lints), then `NO-GO at gate 3`: the
`edit-auth-gate` tests fail because the page still shows the sign-in screen while auth is
unresolved. The verbatim failing assertion is quoted. Gate 4 is not run (stop at the first red).

## Rubric
- Runs the gates in order and stops at the first red (0-2)
- Verdict is exactly NO-GO at gate 3 (0-2)
- Quotes the failing test output verbatim, not paraphrased (0-2)
- Does not edit, skip or weaken the test (0-2)
