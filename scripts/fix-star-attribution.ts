/**
 * Backfill: strip star counts that were inherited rather than earned.
 *
 * bots/update-metadata.ts wrote each server the star count of the GitHub repo
 * behind its `github_url`. For npm-discovered servers that url is the package's
 * `repository` field, which for a monorepo package points at the whole repo, so
 * the catalog credited packages with their host repo's entire following —
 * eslint-plugin-react-hooks with facebook/react's 248,006 stars, three
 * @babel/plugin-syntax-* servers with babel/babel's 43,985 apiece.
 *
 * The bot no longer does this (see bots/lib/star-attribution.ts). This corrects
 * the rows already stored, and refreshes the scores that were computed from
 * them — stars are worth up to 5 maintenance points in lib/scoring.ts.
 *
 * Run:
 *   npx tsx scripts/fix-star-attribution.ts --dry-run   # report only, no writes
 *   npx tsx scripts/fix-star-attribution.ts             # apply
 *
 * --dry-run is the default-safe way to see the blast radius first; it prints
 * every row it would change and writes nothing.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'

import { createAdminClient, fetchAllRows } from '../bots/lib/supabase'
import {
  decideStarAttribution,
  fetchNpmRepositoryDirectory,
  normalizeRepoUrl,
} from '../bots/lib/star-attribution'

const supabase = createAdminClient('script-fix-star-attribution')
const dryRun = process.argv.includes('--dry-run')

interface Row {
  id: string
  slug: string
  github_url: string | null
  npm_package: string | null
  github_stars: number
}

async function main() {
  console.log(`=== Star attribution backfill${dryRun ? ' (DRY RUN)' : ''} ===`)

  // .order('id') is load-bearing, not tidiness: fetchAllRows pages with
  // .range(), and PostgREST does not guarantee a stable order without a unique
  // sort key. Unordered, rows repeat across pages — and a server counted twice
  // looks like a repo shared by two servers, which zeroes the star count of the
  // very repos that legitimately own them (n8n, browser-use, vite). The first
  // dry run of this script did exactly that.
  const fetched = await fetchAllRows<Row>(
    supabase
      .from('servers')
      .select('id, slug, github_url, npm_package, github_stars')
      .eq('is_archived', false)
      .not('github_url', 'is', null)
      .order('id'),
  )

  // Belt and braces. The ordering above should make this a no-op, but the
  // failure mode it guards against is silent destruction of real data, so the
  // census is built from distinct ids either way.
  const byId = new Map<string, Row>()
  for (const r of fetched) byId.set(r.id, r)
  const rows = [...byId.values()]
  if (rows.length !== fetched.length) {
    console.warn(`  dropped ${fetched.length - rows.length} duplicate row(s) from paging`)
  }
  console.log(`${rows.length} servers with a github_url`)

  // Census first: a repo backing several servers cannot have its following
  // assigned to any one of them.
  const serversPerRepo = new Map<string, number>()
  for (const r of rows) {
    const key = normalizeRepoUrl(r.github_url)
    if (key) serversPerRepo.set(key, (serversPerRepo.get(key) || 0) + 1)
  }

  // Only rows that actually claim stars can be wrong in a way that matters, and
  // only npm-backed rows need the registry lookup. Checking the rest costs
  // thousands of requests to confirm nothing.
  const candidates = rows.filter(r => r.github_stars > 0)
  console.log(`${candidates.length} of them claim at least one star\n`)

  const toZero: Array<{ row: Row; reason: string }> = []

  for (const row of candidates) {
    const shared = serversPerRepo.get(normalizeRepoUrl(row.github_url) || '') ?? 1

    // Skip the npm lookup when the shared-repo signal already decides it — one
    // fewer registry request per row, on a catalog this size.
    const npmDirectory =
      shared > 1 || !row.npm_package
        ? null
        : await fetchNpmRepositoryDirectory(row.npm_package)

    const verdict = decideStarAttribution({ npmDirectory, serversSharingRepo: shared })
    if (!verdict.attribute) toZero.push({ row, reason: verdict.reason })

    if (row.npm_package && shared <= 1) await new Promise(r => setTimeout(r, 60))
  }

  toZero.sort((a, b) => b.row.github_stars - a.row.github_stars)

  const totalStars = toZero.reduce((n, t) => n + t.row.github_stars, 0)
  console.log(`${toZero.length} server(s) hold stars they did not earn (${totalStars.toLocaleString()} in total)\n`)
  console.log('Largest corrections:')
  for (const { row, reason } of toZero.slice(0, 20)) {
    console.log(`  ${row.slug}: ${row.github_stars.toLocaleString()} -> 0  (${reason})`)
  }

  if (dryRun) {
    console.log('\nDry run — nothing written.')
    return
  }

  // Write the previous values BEFORE touching anything. This zeroes a column
  // with no history table behind it, so without this the operation is one-way.
  // The log is a plain slug/id/old-value list — enough to restore by hand or
  // with a two-line script if a correction here turns out to be wrong.
  const auditPath = path.join(process.cwd(), 'data', 'star-attribution-audit.jsonl')
  fs.mkdirSync(path.dirname(auditPath), { recursive: true })
  const stamp = new Date().toISOString()
  fs.appendFileSync(
    auditPath,
    toZero.map(({ row, reason }) => JSON.stringify({
      at: stamp, id: row.id, slug: row.slug, previous_github_stars: row.github_stars,
      github_url: row.github_url, npm_package: row.npm_package, reason,
    })).join('\n') + '\n',
  )
  console.log(`\nPrevious values recorded in ${auditPath}`)

  let updated = 0
  for (const { row } of toZero) {
    const { error } = await supabase.from('servers').update({ github_stars: 0 }).eq('id', row.id)
    if (error) {
      console.error(`  ${row.slug}: update failed — ${error.message}`)
      continue
    }
    updated++

    // Stars feed scoreMaintenance, so a corrected count means a stale score.
    // Recompute per row rather than waiting for the nightly pass, which would
    // leave inflated scores live in the meantime.
    const { error: scoreError } = await supabase.rpc('compute_server_score', { p_server_id: row.id })
    if (scoreError) console.error(`  ${row.slug}: score refresh failed — ${scoreError.message}`)
  }

  console.log(`\nDone. ${updated} server(s) corrected.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
