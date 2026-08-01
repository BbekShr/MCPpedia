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
  /** Raw transport type strings we could not map — the transport-drift signal. */
  unmappedTransports: string[]
  remoteUrls: string[]
  hasMappedPackage: boolean
}

/**
 * `malformed` is never returned by `parseRegistryEntry` — it is the bucket the
 * bot's per-entry try/catch uses for a record that throws anyway, so one bad
 * record costs one record instead of the whole run.
 */
export type SkipReason = 'not-latest' | 'inactive-status' | 'no-name' | 'malformed'

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

/** The declared `packages`, or `[]` if upstream sent something that is not a list. */
function packageList(server: RegistryServer): RegistryPackage[] {
  return Array.isArray(server.packages)
    ? server.packages.filter((p): p is RegistryPackage => isRecord(p))
    : []
}

/** The declared `remotes`, or `[]` if upstream sent something that is not a list. */
function remoteList(server: RegistryServer): RegistryRemote[] {
  return Array.isArray(server.remotes)
    ? server.remotes.filter((r): r is RegistryRemote => isRecord(r))
    : []
}

/** Package identifier for a registry ecosystem, across both payload shapes. */
export function findPackageIdentifier(
  packages: RegistryServer['packages'],
  registry: string
): string | undefined {
  const list = Array.isArray(packages)
    ? packages.filter((p): p is RegistryPackage => isRecord(p))
    : []
  const hit = list.find(p => (p.registryType ?? p.registry_name) === registry)
  const id = hit?.identifier ?? hit?.name
  return typeof id === 'string' ? id : undefined
}

/** Stand-in reported for a declared remote that carries no readable `type`. */
export const MISSING_REMOTE_TYPE = '(remote-without-type)'

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
 * render or filter on. The dropped strings come back in `unmapped` so the bot
 * can report a rename instead of absorbing it.
 *
 * Two traps this walks around:
 *  - `stdio` is NOT a safe default *once a type has been declared*. Both scorers
 *    award +4 for `'stdio' = any(transport)` (`lib/scoring.ts:1104`,
 *    `supabase/migrations/20260402010000_scores_security_registry.sql:155`), so
 *    fabricating it for a remote-only server whose type upstream renamed would
 *    inflate compatibility scores catalog-wide and stay invisible to the
 *    `mappedPackages` drift guard. So the stdio fallback needs BOTH that no
 *    transport type string was read AND that no remotes were declared: the
 *    legacy package shape documented above (`registryType`/`identifier` with no
 *    `transport` sub-object, still live upstream) is the genuine local-server
 *    shape, while any remote-bearing record resolves to an empty array — which
 *    the column allows (`transport text[] default '{}'`) — plus an `unmapped`
 *    entry so the bot reports the rename. Gating on `packages.length === 0`
 *    instead made those two cases indistinguishable and silently dropped stdio
 *    from every legacy-shaped record; gating on the type string alone let a
 *    type-less remote through as a fabricated local server.
 *  - The lookup must be own-property only. `REMOTE_TYPE_MAP['constructor']`
 *    resolves up the prototype chain to a truthy function that the index
 *    signature types as `Transport`, and it serializes into the `text[]` column
 *    as `{NULL}` — the exact bug this module exists to fix.
 */
export function deriveTransports(
  server: RegistryServer
): { transports: Transport[]; unmapped: string[] } {
  const transports: Transport[] = []
  const unmapped: string[] = []
  let sawType = false

  const add = (raw: unknown) => {
    if (typeof raw !== 'string') return
    const key = raw.trim().toLowerCase()
    if (!key) return
    sawType = true
    if (Object.hasOwn(REMOTE_TYPE_MAP, key)) {
      const hit = REMOTE_TYPE_MAP[key]
      if (!transports.includes(hit)) transports.push(hit)
    } else if (!unmapped.includes(key)) {
      unmapped.push(key)
    }
  }

  for (const remote of remoteList(server)) add(remote.type)
  for (const pkg of packageList(server)) add(isRecord(pkg.transport) ? pkg.transport.type : undefined)

  if (!sawType) {
    // A record that declared REMOTES but no readable type on any of them is not
    // a local server — it is a remote whose `type` went missing, empty or
    // non-string upstream. `sawType` alone cannot tell that apart from the
    // legacy package shape, and defaulting to stdio here fabricates a local
    // server for a remote-only entry: the +4 compatibility point, and no
    // `unmapped` entry to ring the drift alarm. So remotes-without-a-type map
    // to nothing and report themselves; packages carry no such risk, since the
    // no-`transport` package shape IS the genuine stdio shape.
    if (remoteList(server).length > 0) {
      return { transports: [], unmapped: [...unmapped, MISSING_REMOTE_TYPE] }
    }
    return { transports: ['stdio'], unmapped }
  }
  return { transports, unmapped }
}

/** Statuses that positively mean "not in the catalog". Everything else is kept. */
const EXCLUDED_STATUSES = new Set(['deleted', 'deprecated', 'removed'])

/**
 * Whether an entry belongs in the catalog.
 *
 * This is a deny-list on purpose, and it has to actually be one. The first cut
 * of this function read `status !== 'active'`, which is an ALLOW-list wearing a
 * deny-list's comment: an upstream rename of `active` (or a capitalized
 * `Active`) would skip EVERY record, empty the fetch, and turn the nightly run
 * red until a human shipped code — the exact fail-shape S58 exists to fix. So
 * we skip only what we positively recognize as excluded; an unrecognized or
 * absent status always keeps the record.
 */
export function isIngestable(
  meta: RegistryOfficialMeta
): { ok: true } | { ok: false; reason: SkipReason } {
  if (meta.isLatest === false) return { ok: false, reason: 'not-latest' }
  const status = typeof meta.status === 'string' ? meta.status.trim().toLowerCase() : ''
  if (EXCLUDED_STATUSES.has(status)) return { ok: false, reason: 'inactive-status' }
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
  const { transports, unmapped } = deriveTransports(server)

  // `repository` and `description` are read through typeof guards for the same
  // reason the lists are read through Array.isArray: a `repository.url` of `123`
  // would throw inside normalizeGithubUrl's `.trim()`, and that throw escapes
  // into the bot's fetch catch, where it reads as a network outage.
  const repository = isRecord(server.repository) ? server.repository : undefined
  const repoUrl = typeof repository?.url === 'string' ? repository.url : undefined

  return {
    kind: 'ok',
    server: {
      registryId: name,
      name,
      description: typeof server.description === 'string' ? server.description : null,
      githubUrl: normalizeGithubUrl(repoUrl),
      version: typeof server.version === 'string' ? server.version : null,
      npmPackage,
      pipPackage,
      transports,
      unmappedTransports: unmapped,
      remoteUrls: remoteList(server)
        .map(r => r.url)
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
  // `||`, not `??`: an empty-string `nextCursor` must fall through to the legacy
  // top-level `cursor` field. `??` only falls through on null/undefined, which
  // truncated pagination at the first page that reported an empty cursor.
  const metaCursor = metadata?.nextCursor
  const cursor = typeof metaCursor === 'string' && metaCursor ? metaCursor : payload.cursor

  return { entries, nextCursor: typeof cursor === 'string' && cursor ? cursor : null }
}
