# Feature

## Method
1. **Restate the acceptance criteria** from the item. Each one maps to a test or a verifiable
   check before you write code. A criterion you can't test goes back to the CEO.
2. **Find the existing pattern**: the closest existing feature is the template. Reuse its helpers,
   structure, and naming. New infrastructure needs a reason in the report.
3. **Smallest version that meets the criteria.** No speculative options, flags, or abstractions.
4. **Build and test together**, one criterion at a time.
5. **Verify it for real** with `/mcppedia-verify`: run the feature the way a user would, at
   every required viewport or environment. Attach the evidence.
6. Docs, if the feature is user-visible and the project documents features.

## In this project
- Features are by layer: the page in `app/<route>/`, components in `components/`, queries and
  domain logic in `lib/`, data from a bot in `bots/`. A feature crossing layers is one dispatch per
  editor, backend first.
- Reference features: `app/compare/[slugs]` (static params + env guard), `app/security`
  (`withDeadline` + `liveDataOrNull` on the request path), `app/api/v1/servers/route.ts` (public
  API with rate limit and capped offset).
- Done = works at desktop (1280) and mobile (375), server-rendered without JS where it can be, and
  doesn't add a request-path query without a deadline. New data on a page usually means a new
  column or bot: say so, and name the migration a human must apply.
- User-visible features are listed in `README.md`; update it when the list changes.
