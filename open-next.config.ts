import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache'
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue'
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache'

// Bindings for all three overrides live in wrangler.jsonc; the comments there
// explain which app/ routes depend on each.
export default defineCloudflareConfig({
  // R2 holds the ISR payloads. The regional wrapper puts a colo-local copy in
  // front of it so a popular /s/[slug] does not pay a cross-region R2 read on
  // every hit. "long-lived" suits this catalog: entries revalidate on a 1–7 day
  // cadence, not per-request.
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: 'long-lived' }),
  queue: doQueue,
  tagCache: d1NextTagCache,
})
