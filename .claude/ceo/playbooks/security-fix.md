# Security fix

## Method
1. **Write the exploit as a test first**: the failing input (injection string, cross-user id,
   hostile file) that demonstrates the hole. It must fail before the fix.
2. **Fix at the boundary**, using the project's canonical helper (validator, sanitizer, auth
   check). Never invent a new one, and never fix only the one call site you were shown: grep for
   every path that reaches the same sink.
3. **Fail closed** unless `CLAUDE.md`/`RULES.md` documents a deliberate fail-open.
4. **No secrets in the test, the commit, or the report.** Use obvious fakes.
5. The security engineer re-reviews the diff before it ships, whatever the gates say.

## In this project
- Canonical helpers: `sanitizeSearchQuery` and the zod schemas in `lib/validators.ts`; the admin
  role check pattern in `app/api/admin/bots/route.ts`; `rehype-sanitize` via
  `lib/readme-pipeline.ts` and `components/InlineMarkdown.tsx`; the service-role client only from
  `lib/supabase/admin.ts`.
- Sinks to grep: `.or(`, `.ilike(`, `.textSearch(`, `dangerouslySetInnerHTML`, `fetch(` with a
  URL from data, `${{ ` interpolation in `.github/workflows/*.yml`.
- Documented fail-open: `lib/rate-limit.ts` allows the request when its RPC fails. Don't change
  that without a human decision (`CLAUDE.md` §4).
- RLS lives in `supabase/migrations/**`; a policy fix is a migration a human must apply.
