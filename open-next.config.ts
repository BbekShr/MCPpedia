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
  // Serve ISR hits from R2 before the Next server runs. Without this, Next
  // decides staleness from an in-memory, per-isolate map of route TTLs
  // (next/dist/server/lib/incremental-cache: SharedCacheControls) that only
  // knows build-time prerenders and paths this isolate itself wrote; any other
  // concrete path — most of /s/[slug], via dynamicParams — falls back to a 1s
  // TTL. So nearly every hit was STALE, queued a DO regeneration and wrote R2
  // again: ~1 PutObject per Worker request (issue #184). The interceptor reads
  // the `revalidate` stored in each R2 entry instead. Not compatible with PPR,
  // which this app does not use. Needs @opennextjs/cloudflare >= 1.20.2
  // (CVE-2026-100409, encoded-path middleware bypass).
  enableCacheInterception: true,
})
