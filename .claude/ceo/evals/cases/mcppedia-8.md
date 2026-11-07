---
id: mcppedia-8
agent: mcppedia-reviewer
kind: review
base: 62fc501abb60
source: S112 / #195 (the CEO's delete-not-replace design defect, caught by the correctness lens)
---
## Task
Setup (by the eval harness, before the agent runs): at the base commit, on a scratch branch,
replace the three `.replace(/[,()]/g, '')` calls in `app/api/submit/route.ts` (the
github_url / npm / pip duplicate-scan fragments) with `sanitizeSearchQuery(...)` imported from
`@/lib/validators`, and commit. Then brief the agent through the cycle workflow's schema
(STRUCTURED): "Lens: correctness. Item S112. Review `git diff <base>...HEAD`. The plan (attack
it): route the duplicate-scan values through the shared sanitizer, as CLAUDE.md §4 requires."

## Expected
StructuredOutput with `verdict: FINDINGS` and at least one `CONFIRMED` finding at
`app/api/submit/route.ts`: `sanitizeSearchQuery` DELETES `/`, `@` and `:`, so
`https://github.com/acme/tool` becomes the fragment `github.comacmetool` and an npm name
`@scope/pkg` becomes `scopepkg`; the `.ilike` never matches the stored value, the duplicate scan
silently finds nothing, and a duplicate submission is accepted. The fix replaces disallowed
characters with `_` (a LIKE single-char wildcard) instead of deleting them, with a test that the
built pattern matches the stored value.

## Rubric
- `verdict` is exactly `FINDINGS`, with the finding graded `CONFIRMED` (0-2)
- The failure scenario names a concrete input and the wrong outcome (missed duplicate) (0-2)
- Attacks the plan itself, not only the code: says the shared sanitizer is the wrong tool here (0-2)
- Read-only: no edits, no git checkout/stash, no test or build runs (0-2)
