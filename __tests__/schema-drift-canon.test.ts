import { describe, it, expect } from 'vitest'
import { canon, cutAtUnmatchedParen, parseSql } from '@/scripts/check-schema-drift'

/**
 * Regression guard for the schema-drift canonicaliser (M19).
 *
 * On its first real run the checker reported a FALSE POSITIVE on the very
 * policy it exists to validate: `20260907120000_restore_profiles_self_update_policy.sql`
 * writes `role is not distinct from (select …)`, Postgres deparses that into
 * `pg_policies.with_check` as `NOT (role IS DISTINCT FROM ( SELECT …))`, and
 * the two spellings did not canonicalise to the same node — so all six frozen
 * columns were reported missing while every one of them was live. A checker
 * that cries wolf gets muted, so the fold is pinned here.
 *
 * No database: both sides are parsed from SQL text, which is exactly what the
 * checker does (it re-parses the live predicate through a `CREATE POLICY`
 * wrapper before comparing).
 */

/** Canonical form of a predicate, via the same wrapper the checker uses. */
async function canonPredicate(predicate: string): Promise<string> {
  const parsed = await parseSql(`CREATE POLICY p ON t FOR ALL USING (${predicate});`)
  expect(parsed.error ?? null).toBeNull()
  const stmt = (parsed.parse_tree?.stmts ?? [])[0]?.stmt as Record<string, unknown> | undefined
  const qual = (stmt?.CreatePolicyStmt as Record<string, unknown> | undefined)?.qual
  expect(qual).toBeDefined()
  return JSON.stringify(canon(qual))
}

describe('canon: IS DISTINCT FROM spellings', () => {
  it('folds `x IS NOT DISTINCT FROM y` onto `NOT (x IS DISTINCT FROM y)`', async () => {
    // The exact pair from the false positive: the migration's spelling on the
    // left, what pg_policies actually reports on the right.
    const written = await canonPredicate(
      'role is not distinct from (select p.role from public.profiles p where p.id = auth.uid())',
    )
    const deparsed = await canonPredicate(
      'NOT (role IS DISTINCT FROM ( SELECT p.role FROM profiles p WHERE (p.id = auth.uid())))',
    )
    expect(written).toBe(deparsed)
  })

  it('folds the mirror pair, `x IS DISTINCT FROM y` and `NOT (x IS NOT DISTINCT FROM y)`', async () => {
    expect(await canonPredicate('a is distinct from b')).toBe(
      await canonPredicate('NOT (a IS NOT DISTINCT FROM b)'),
    )
  })

  it('is symmetric in its operands, like `=`', async () => {
    expect(await canonPredicate('a is not distinct from b')).toBe(
      await canonPredicate('b is not distinct from a'),
    )
  })

  it('does NOT fold the two senses together — the negation still has to differ', async () => {
    expect(await canonPredicate('a is not distinct from b')).not.toBe(
      await canonPredicate('a is distinct from b'),
    )
  })

  it('still distinguishes a genuinely different operand', async () => {
    expect(await canonPredicate('role is not distinct from x')).not.toBe(
      await canonPredicate('bio is not distinct from x'),
    )
  })
})

describe('cutAtUnmatchedParen', () => {
  it('drops a trailing `--` comment instead of gluing it onto the condition', () => {
    const text = 'discussions_count is not distinct from (select 1)\n  -- Fail CLOSED, per (c).\n  -- not SQL\n'
    expect(cutAtUnmatchedParen(text).replace(/\s+/g, ' ').trim()).toBe(
      'discussions_count is not distinct from (select 1)',
    )
  })

  it('keeps a `--` that lives inside a string literal', () => {
    expect(cutAtUnmatchedParen("slug = 'a--b'").trim()).toBe("slug = 'a--b'")
  })

  it('drops a block comment', () => {
    expect(cutAtUnmatchedParen('a = 1 /* why */ and b = 2').replace(/\s+/g, ' ').trim()).toBe(
      'a = 1 and b = 2',
    )
  })

  it('still cuts at the paren that closes the USING( we never opened', () => {
    expect(cutAtUnmatchedParen('auth.uid() = id) with check (true)').trim()).toBe('auth.uid() = id')
  })
})
