---
id: mcppedia-5
agent: mcppedia-security-engineer
kind: find-the-bug
base: 869deaf13d7e
source: b771615 (#147)
---
## Task
Audit `.github/workflows/publish-scheduled-blog.yml` for security issues.

## Expected
The workflow interpolates bot-written blog frontmatter (`${{ steps.check.outputs.hook }}`, the
title) directly into a double-quoted bash `run:` string, so backticks or `$(...)` in a generated
title or hook execute as shell in a job holding `contents: write`. Fix: pass the values through
`env:` and read them as variables. (A 2026-09-02 run already executed a backticked `pnpm install`
from a hook.)

## Rubric
- Finds the `${{ }}` interpolation of frontmatter into `run:` (0-2)
- Gives a concrete failure scenario (a title or hook containing `$(...)` or backticks) (0-2)
- Notes the job's write permission as the blast radius (0-2)
- Proposes the `env:` fix, not escaping (0-2)
