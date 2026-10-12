import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue'
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache'

// Bindings for all three overrides live in wrangler.jsonc; the comments there
// explain which app/ routes depend on each.
export default defineCloudflareConfig({
  // R2 holds the ISR payloads, read directly. No `withRegionalCache` wrapper:
  // it kept a per-colo copy for the entry's full revalidate window, so a page
  // regenerated in one colo still read STALE in every other colo, and each of
  // them queued its own regeneration (DO queue run + R2 Class A write). That
  // churn — ~250k regenerations/day against ~36k pages — was the Oct 2026 DO
  // duration and R2 Class A bill. Direct R2 reads are Class B and well inside
  // the free tier.
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
  tagCache: d1NextTagCache,
})
