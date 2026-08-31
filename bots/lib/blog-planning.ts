/**
 * Blog planning constants shared by bots/generate-blog.ts, pulled out here so
 * they're importable (and testable) without triggering that file's
 * module-scope main() call.
 */

export type ArticleType =
  | 'weekly-roundup'
  | 'server-spotlight'
  | 'security-alert'
  | 'trending'
  | 'category-deep-dive'
  | 'seo-guide'

// The scheduled run produces at most one article per week (Tuesday) — see
// generate-blog.yml. This is the single place that cap lives; planArticles
// and runPrepare both reference it.
export const MAX_JOBS = 1

export const DEFAULT_MODEL = 'claude-sonnet-5'

export function modelForType(_type: ArticleType): string {
  return DEFAULT_MODEL
}
