# Perf

## Method
1. **Measure before touching anything.** A perf claim without a number is a guess. Use the
   inspection tools in `/mcppedia-verify`: a trace, a profile, timings over N runs (report the
   median and spread), bundle size, query count.
2. **Find the dominant cost** in the measurement. Fix that, not what looks slow in the code.
3. **One change at a time**, re-measuring after each.
4. **Prove it held:** same measurement, same conditions, before and after, in the report. A change
   that doesn't move the number gets reverted, however elegant it is.
5. **Guard it** where cheap: a budget, a query-count assertion, a size limit, so it can't regress
   silently.

## In this project
- Measure with `/mcppedia-verify`: response timings over N requests to the local server
  (`curl -w '%{time_total}'`), `npm run build` route sizes and the `.next/prerender-manifest.json`,
  and Supabase egress from the dashboard (the human's; ask). `scripts/check-cache-headers.sh` checks
  ISR headers.
- Budgets that exist: the Worker bundle size cap that forced Workers Paid (`docs/CLOUDFLARE.md`),
  the Supabase Free plan's 5 GB egress and 0.5 GB disk, R2 Class A writes driven by ISR churn
  (`d3761ce`, `d5d2c3e`).
- Hot paths: `/`, `/servers`, `/s/[slug]`, `/category/*`, `/security`, `/api/v1/servers`, the
  sitemaps. Every build prerenders ~1,000 server pages and reads the shared DB: don't measure by
  building repeatedly.
- Never measure against mcppedia.org.
