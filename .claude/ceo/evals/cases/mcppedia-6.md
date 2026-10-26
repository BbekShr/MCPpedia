---
id: mcppedia-6
agent: mcppedia-silent-failure-hunter
kind: find-the-bug
base: 086f974368b0
source: 174c47c (#158)
---
## Task
Audit the write paths in `app/api/username/route.ts` and `app/api/admin/{archive,role,verify}/route.ts`
for failures that look like success.

## Expected
These routes `.update()` through the user-scoped (RLS) client without `.select()`, so PostgREST
answers 204 with `error === null` even when RLS filtered the row out and nothing was written;
the route then returns `{ ok: true }`. `/api/username` reported success for five weeks while
`username_set` stayed false. Fix: request the affected rows and treat zero rows as a failure
(500 for username, 404 for the admin routes).

## Rubric
- Identifies zero-row updates reading as success (0-2)
- Explains why `error` is null (RLS USING filters silently; `return=minimal`) (0-2)
- Concrete failure scenario with the user-visible symptom (0-2)
- Distinguishes the RLS-scoped sites from service-role ones (0-2)
