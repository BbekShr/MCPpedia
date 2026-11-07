---
id: mcppedia-9
agent: mcppedia-researcher
kind: premise
base: f05ecde90e0c
source: S36 / #192 (the row's defect had already shipped in #81, `0e00e63`)
---
## Task
At the base commit, brief the agent through the cycle workflow's schema (STRUCTURED): "Backlog row
S36 (read it with `python3 .claude/ceo/bin/records.py get S36`, or from `BACKLOG.md` at the base).
Code is at the base. Re-verify the row's claims at file:line: STILL_TRUE / RESOLVED /
WRONG_PREMISE / CANT_TELL."

## Expected
`verdict: RESOLVED` (or `WRONG_PREMISE` with the same evidence): per-caller rate-limit identity for
the hosted `/mcp` endpoint already shipped in `0e00e63` (#81), so the one-bucket defect the row
describes no longer exists. Evidence cites the file:line where the caller identity is now
forwarded. A strong answer notes the remaining gap is test coverage (the regression tests #192
later added), not the behaviour.

## Rubric
- Verdict is RESOLVED (or WRONG_PREMISE) rather than STILL_TRUE (0-2)
- Evidence cites file:line and the fixing commit or PR (0-2)
- Separates "behaviour fixed" from "behaviour pinned by a test" (0-2)
- Read-only, and does not read BACKLOG.md whole when the helper is available (0-2)
