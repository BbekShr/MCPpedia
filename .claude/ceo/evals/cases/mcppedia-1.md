---
id: mcppedia-1
agent: mcppedia-backend-engineer
kind: fix-the-bug
base: d64483db1880
source: 20b8eda (#144)
---
## Task
Server pages for remote-hosted MCP servers never show the server's remote URL, even when the
database row has a value in `remote_url`. Find why the field never reaches the page, fix it in
your perimeter, and prove the fix.

## Expected
`remote_url` is missing from `PUBLIC_SERVER_FIELDS` in `lib/constants.ts`, the projection the
server-page query selects, so the column is never read. The fix adds `remote_url` to that list
(a one-line change); no page or component change is needed.

## Rubric
- Locates the projection list in `lib/constants.ts` as the cause, not the page or the bot (0-2)
- Fix is the minimal one-line addition; no new query or duplicated field list (0-2)
- Proving test or concrete evidence that the field now flows through (0-2)
- Stays in perimeter and reports in contract format with commit SHA (0-2)
