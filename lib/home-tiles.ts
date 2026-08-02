import { CATEGORIES, CATEGORY_LABELS } from '@/lib/constants'
import type { Category } from '@/lib/constants'
import { HOMEPAGE_USECASES, type UseCaseTileData } from '@/components/home/UseCases'
import type { HomeCategory } from '@/components/home/CategoriesGrid'

/**
 * Shaping of the two homepage aggregate RPCs into tiles.
 *
 * Extracted from app/page.tsx so the null/empty rule below is unit-testable —
 * it is the whole point of S81 and is easy to regress back into `?? {}`.
 *
 * Both RPCs are now backed by the `home_aggregates_cache` snapshot
 * (supabase/migrations/20260801120000_home_aggregates_snapshot_cache.sql). An
 * unseeded snapshot is a SUCCESSFUL response carrying `data: null`, and a
 * snapshot missing the key is the same. Neither is an error, so the guard has to
 * cover all three of error / null / empty-object — otherwise a missing snapshot
 * renders as a grid of literal zeros ("0 servers" on every tile), which is a
 * visible falsehood that unstable_cache then pins for 24h. Returning null makes
 * the page OMIT the section instead.
 */

/** A supabase-js single-RPC result, narrowed to what the mapping needs. */
export type RpcResult = { data: unknown; error: unknown }

type UseCaseRpcEntry = {
  count: number
  top: { slug: string; name: string; homepage_url: string | null; author_github: string | null }[]
}

/** True when the result carries no usable aggregate — see the module doc. */
function isAbsent(result: RpcResult): boolean {
  return (
    result.error != null ||
    result.data == null ||
    Object.keys(result.data as Record<string, unknown>).length === 0
  )
}

/** Homepage "Browse by use case" tiles, or null to omit the section. */
export function buildUseCaseTiles(result: RpcResult): UseCaseTileData[] | null {
  if (isAbsent(result)) return null
  const useCaseData = result.data as Record<string, UseCaseRpcEntry>

  return HOMEPAGE_USECASES.map(uc => ({
    id: uc.id,
    title: uc.title,
    subtitle: uc.subtitle,
    accent: uc.accent,
    count: useCaseData[uc.id]?.count ?? 0,
    top: useCaseData[uc.id]?.top ?? [],
  }))
}

/**
 * Homepage "Browse by category" tiles, or null to omit the grid.
 *
 * The RPC returns `{ [slug]: count }` for every category with >=1 non-archived
 * server; projecting onto the canonical CATEGORIES list keeps all 22 tiles
 * rendered, so a genuinely empty category still shows a 0 tile. That is
 * unrelated to the absent-snapshot case above, which drops the grid entirely.
 */
export function buildCategoryTiles(result: RpcResult): HomeCategory[] | null {
  if (isAbsent(result)) return null
  const countsBySlug = result.data as Record<string, number>

  const categoryCounts = CATEGORIES.map(slug => ({
    slug,
    label: CATEGORY_LABELS[slug as Category],
    count: countsBySlug[slug] ?? 0,
  }))

  // Mark the top 3 non-empty categories as "Hot" — gentle visual cue without
  // requiring time-series data.
  const hotSet = new Set(
    [...categoryCounts]
      .filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(c => c.slug),
  )

  return categoryCounts.map(c => ({ ...c, hot: hotSet.has(c.slug) }))
}
