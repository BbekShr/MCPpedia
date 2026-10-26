---
id: mcppedia-2
agent: mcppedia-frontend-engineer
kind: fix-the-bug
base: 527634898f12
source: 6f071fb (#140)
---
## Task
Signed-in users sometimes see "Sign in to edit this page" on `/s/<slug>/edit`, and it persists
even after signing in again and reloading. Fix it in your perimeter and prove the fix.

## Expected
`app/s/[slug]/edit/page.tsx` initialises `user` to null with no loading state, so "auth not
resolved yet" is indistinguishable from "signed out", and its effect calls
`supabase.auth.getUser()` with the error discarded and no `.catch()`, so a transient failure or
rejection leaves `user` null forever. Fix: an `authLoading` state, `onAuthStateChange` as the
source of truth (the pattern `components/Nav.tsx` already uses), the `getUser()` error logged
and rejection caught, and rendering gated on `authLoading` before the sign-in check. A test
shows the sign-in screen does not render while auth is unresolved or after a rejected `getUser()`.

## Rubric
- Identifies the conflation of "unresolved" and "signed out" (0-2)
- Identifies the discarded error / missing catch on `getUser()` (0-2)
- Reuses the existing `components/Nav.tsx` auth pattern rather than inventing one (0-2)
- Proving test fails before and passes after (0-2)
- Smallest change; no unrelated refactor of the edit page (0-2)
