/**
 * Parsing and mapping for the official MCP Registry payload.
 *
 * The registry serves schema `2025-12-11`. The parse this module replaces
 * matched none of it: it read `id`, `version_detail.version` and
 * `remotes[].transport[]`, none of which exist upstream. Nothing failed —
 * the response is `any` at the fetch boundary, so every missing field became
 * `undefined` and then a NULL column. That is why the drift survived
 * typecheck, lint and the test suite for months.
 *
 * Two rules follow from that history:
 *  1. Nothing here may assume a field exists. Every type in this file has only
 *     optional members; every read is defensive. This is untrusted third-party
 *     JSON, not our own schema.
 *  2. The fixture test (`lib/__tests__/registry-schema.test.ts`, fed by a
 *     committed capture of the live endpoint) is the drift alarm. When upstream
 *     renames a field again, that test — not production — is what notices.
 *
 * This module is deliberately side-effect free: no Supabase client, no env
 * access, no I/O. `bots/sync-registry.ts` cannot be imported by a test (it
 * builds an admin client and calls `main()` at module scope), so schema
 * knowledge has to live outside it to be testable at all.
 */

import { type Transport } from './constants'
import { normalizeGithubUrl, normalizePackageName } from './normalize'

/** Where the registry keeps publication status and latest-version flags. */
export const OFFICIAL_META_KEY = 'io.modelcontextprotocol.registry/official'

export type RegistryOfficialMeta = {
  status?: string
  statusChangedAt?: string
  publishedAt?: string
  updatedAt?: string
  isLatest?: boolean
}

export type RegistryPackage = {
  registryType?: string
  registryBaseUrl?: string
  identifier?: string
  version?: string
  runtimeHint?: string
  transport?: { type?: string }
  // The registry renamed both of these fields. Today's payload uses
  // `registryType` + `identifier`; older entries used `registry_name` + `name`.
  // Reading only the old pair silently imported every registry server with
  // npm_package/pip_package = null (see PR #93), so both shapes stay readable.
  registry_name?: string
  name?: string
}

export type RegistryRemote = {
  type?: string
  url?: string
  headers?: unknown
  variables?: unknown
}

export type RegistryServer = {
  $schema?: string
  name?: string
  title?: string
  description?: string
  version?: string
  websiteUrl?: string
  icons?: unknown
  repository?: { url?: string; source?: string }
  packages?: RegistryPackage[]
  remotes?: RegistryRemote[]
}

export type RegistryEntry = {
  server?: RegistryServer
  _meta?: Record<string, unknown>
}

export type ParsedRegistryServer = {
  registryId: string
  name: string
  description: string | null
  githubUrl: string | null
  version: string | null
  npmPackage: string | null
  pipPackage: string | null
  transports: Transport[]
  remoteUrls: string[]
  hasMappedPackage: boolean
}

export type SkipReason = 'not-latest' | 'inactive-status' | 'no-name'

export type ParseResult =
  | { kind: 'ok'; server: ParsedRegistryServer }
  | { kind: 'skipped'; reason: SkipReason }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Split an entry into its server object and its official metadata.
 *
 * Accepts both the wrapped `{ server, _meta }` form the API serves today and a
 * bare server object — older payloads used the latter and the previous bot
 * tolerated both, so unwrapping must not regress that.
 */
export function unwrapRegistryEntry(
  entry: unknown
): { server: RegistryServer; meta: RegistryOfficialMeta } {
  if (!isRecord(entry)) return { server: {}, meta: {} }

  const wrapped = isRecord(entry.server) ? (entry.server as RegistryServer) : null
  const server = wrapped ?? (entry as RegistryServer)

  const metaBag = isRecord(entry._meta) ? entry._meta : undefined
  const official = metaBag && isRecord(metaBag[OFFICIAL_META_KEY]) ? metaBag[OFFICIAL_META_KEY] : undefined

  return { server, meta: (official as RegistryOfficialMeta) ?? {} }
}

/** Package identifier for a registry ecosystem, across both payload shapes. */
export function findPackageIdentifier(
  packages: RegistryServer['packages'],
  registry: string
): string | undefined {
  const hit = packages?.find(p => (p.registryType ?? p.registry_name) === registry)
  return hit?.identifier ?? hit?.name
}

const REMOTE_TYPE_MAP: Record<string, Transport> = {
  'streamable-http': 'http',
  http: 'http',
  sse: 'sse',
  stdio: 'stdio',
}

/**
 * Transports a server supports, drawn from both `remotes[].type` (a string,
 * not an array) and `packages[].transport.type` (the real source of `stdio`).
 *
 * The return type is pinned to `Transport` on purpose. `TRANSPORTS`
 * (`lib/constants.ts:53`) feeds the zod enum at `lib/validators.ts:25`, two SQL
 * scorers, the search RPC and every filter UI — widening it is a five-surface
 * change, not a one-line one. So an unrecognized upstream transport is dropped
 * here rather than passed through to become a value nothing downstream can
 * render or filter on.
 *
 * The old code did `remotes.flatMap(r => r.transport)` against a field that no
 * longer exists, which wrote `[undefined]` and landed in Postgres as `{NULL}`.
 * Hence the empty-set fallback: every server gets at least one real transport.
 */
export function deriveTransports(server: RegistryServer): Transport[] {
  const out: Transport[] = []

  const add = (raw: unknown) => {
    if (typeof raw !== 'string') return
    const hit = REMOTE_TYPE_MAP[raw.trim().toLowerCase()]
    if (hit && !out.includes(hit)) out.push(hit)
  }

  for (const remote of server.remotes ?? []) add(remote?.type)
  for (const pkg of server.packages ?? []) add(pkg?.transport?.type)

  return out.length > 0 ? out : ['stdio']
}

/**
 * Whether an entry belongs in the catalog.
 *
 * This is a deny-list on purpose. An allow-list ("keep only status `active`")
 * would let a single new upstream status value silently skip the entire
 * catalog — which is the exact fail-shape S58 exists to fix. So we skip only
 * what we positively recognize as excluded, and an absent field always keeps
 * the record.
 */
export function isIngestable(
  meta: RegistryOfficialMeta
): { ok: true } | { ok: false; reason: SkipReason } {
  if (meta.isLatest === false) return { ok: false, reason: 'not-latest' }
  if (typeof meta.status === 'string' && meta.status !== 'active') {
    return { ok: false, reason: 'inactive-status' }
  }
  return { ok: true }
}

/** Map one registry entry to the fields MCPpedia stores, or say why it was skipped. */
export function parseRegistryEntry(entry: unknown): ParseResult {
  const { server, meta } = unwrapRegistryEntry(entry)

  const ingestable = isIngestable(meta)
  if (!ingestable.ok) return { kind: 'skipped', reason: ingestable.reason }

  const name = typeof server.name === 'string' ? server.name.trim() : ''
  if (!name) return { kind: 'skipped', reason: 'no-name' }

  const npmPackage = normalizePackageName(findPackageIdentifier(server.packages, 'npm'))
  const pipPackage = normalizePackageName(findPackageIdentifier(server.packages, 'pypi'))

  return {
    kind: 'ok',
    server: {
      registryId: name,
      name,
      description: server.description ?? null,
      githubUrl: normalizeGithubUrl(server.repository?.url),
      version: typeof server.version === 'string' ? server.version : null,
      npmPackage,
      pipPackage,
      transports: deriveTransports(server),
      remoteUrls: (server.remotes ?? [])
        .map(r => r?.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0),
      hasMappedPackage: npmPackage !== null || pipPackage !== null,
    },
  }
}

/** Read one page envelope: the entry list and the cursor for the next page. */
export function parseRegistryPage(
  payload: unknown
): { entries: unknown[]; nextCursor: string | null } {
  if (Array.isArray(payload)) return { entries: payload, nextCursor: null }
  if (!isRecord(payload)) return { entries: [], nextCursor: null }

  const list = payload.servers ?? payload.items
  const entries = Array.isArray(list) ? list : []

  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined
  const cursor = metadata?.nextCursor ?? payload.cursor

  return { entries, nextCursor: typeof cursor === 'string' && cursor ? cursor : null }
}
