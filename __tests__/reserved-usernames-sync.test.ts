import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The reserved-username list exists twice on purpose (S102).
 *
 * `lib/username.ts` holds it for the friendly, user-facing rejection in
 * `app/api/username/route.ts`. The trigger in the
 * `*_profiles_write_surface.sql` migration holds it again because
 * `anon`/`authenticated` carry full DML grants, so a signed-in user can
 * `PATCH /rest/v1/profiles` directly and never reach that route at all.
 *
 * Duplication like that rots silently: someone adds a route to the app, adds
 * `'foo'` to the TypeScript list, and the database keeps handing it out. This
 * suite is the thing that makes the duplication safe — it reads BOTH files from
 * disk and fails if the two sets differ in either direction.
 *
 * Source is scanned rather than imported because neither list is exported:
 * `RESERVED_USERNAMES` is module-private in `lib/username.ts` (only
 * `validateUsername` is public), and the SQL one only exists inside a plpgsql
 * function body.
 */

const ROOT = join(__dirname, '..')
const TS_PATH = join(ROOT, 'lib', 'username.ts')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const SQL_SUFFIX = '_profiles_write_surface.sql'

/**
 * Resolved by suffix, never by full filename. The migration's own merge-order
 * note tells a reviewer to renumber the file upward if a lower-versioned
 * sibling is still unmerged, and `supabase db push` makes that a real thing to
 * do. Pinning the version prefix would turn a legitimate rename into an ENOENT
 * at collection time — an error naming neither this invariant nor its cause.
 */
function resolveMigration(): string {
  const hit = readdirSync(MIGRATIONS_DIR).find(name => name.endsWith(SQL_SUFFIX))
  if (!hit) {
    throw new Error(
      `no migration ending in "${SQL_SUFFIX}" under supabase/migrations — ` +
        'it was renamed to something else or deleted. The reserved-username ' +
        'trigger is what this suite guards; rename it back to *' +
        SQL_SUFFIX +
        ' or update SQL_SUFFIX here.',
    )
  }
  return join(MIGRATIONS_DIR, hit)
}

const SQL_PATH = resolveMigration()

/** Every single-quoted token in a block, in source order (duplicates kept). */
function quotedTokens(block: string): string[] {
  return [...block.matchAll(/'([^']*)'/g)].map(m => m[1])
}

function extract(source: string, pattern: RegExp, what: string): string[] {
  const match = pattern.exec(source)
  // A failed match would silently compare two empty sets, so the anchor itself
  // is load-bearing: if either declaration is renamed or reformatted, this
  // throws at collection time instead of quietly stopping to check anything.
  if (!match) {
    throw new Error(`could not locate ${what} — has the declaration been renamed or reformatted?`)
  }
  return quotedTokens(match[1])
}

const tsList = extract(
  readFileSync(TS_PATH, 'utf8'),
  /const RESERVED_USERNAMES: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/,
  'RESERVED_USERNAMES in lib/username.ts',
)

const sqlList = extract(
  readFileSync(SQL_PATH, 'utf8'),
  /-- reserved-usernames-begin\n([\s\S]*?)-- reserved-usernames-end/,
  `the reserved-usernames array in ${SQL_PATH}`,
)

describe('reserved usernames: TypeScript and SQL lists stay in sync', () => {
  it('found a non-trivial list on both sides', () => {
    expect(tsList.length).toBeGreaterThan(50)
    expect(sqlList.length).toBe(tsList.length)
  })

  it('has no duplicate entries in either list', () => {
    // Set comparison below would hide a duplicate; catch it here instead.
    expect(sqlList.length).toBe(new Set(sqlList).size)
    expect(tsList.length).toBe(new Set(tsList).size)
  })

  it('blocks in SQL every name blocked in TypeScript', () => {
    const inSql = new Set(sqlList)
    const missing = tsList.filter(name => !inSql.has(name))
    expect(missing, 'reserved in lib/username.ts but claimable via a direct PATCH').toEqual([])
  })

  it('blocks in TypeScript every name blocked in SQL', () => {
    const inTs = new Set(tsList)
    const extra = sqlList.filter(name => !inTs.has(name))
    // The reverse direction matters too: a name the database rejects but the
    // route accepts fails at write time with a raw Postgres error instead of
    // the friendly "That username is reserved."
    expect(extra, 'rejected by the trigger but accepted by /api/username').toEqual([])
  })

  it('keeps the SQL list lowercase, as the trigger compares exactly', () => {
    // The format regex only admits lowercase, so an uppercase entry would be
    // dead weight that never matches anything.
    expect(sqlList.filter(name => name !== name.toLowerCase())).toEqual([])
  })
})
