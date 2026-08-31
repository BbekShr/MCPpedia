import type { Server } from './types'

// `servers.transport` only ever stores the mapped values from `TRANSPORTS`
// (lib/constants.ts) — 'stdio' | 'sse' | 'http'. Upstream registry strings like
// 'streamable-http' are already collapsed to 'http' before they reach this
// column (lib/registry-schema.ts's `deriveTransports`), so there is no third
// remote spelling to check here.
const REMOTE_TRANSPORTS = ['http', 'sse']

/**
 * Whether a server is a hosted remote service with no local, runnable
 * distribution — i.e. there is nothing to clone-and-run, only an endpoint to
 * point a client at.
 *
 * A server with an npm/pip package is never remote-only even if it also
 * exposes a remote endpoint (issue #68 was specifically about a server with
 * NEITHER): the FAQ/install UI should keep describing the thing a user can
 * actually run.
 */
export function isRemoteOnly(
  server: Pick<Server, 'npm_package' | 'pip_package' | 'remote_url' | 'transport'>
): boolean {
  if (server.npm_package || server.pip_package) return false
  return Boolean(server.remote_url) || (server.transport ?? []).some(t => REMOTE_TRANSPORTS.includes(t))
}
