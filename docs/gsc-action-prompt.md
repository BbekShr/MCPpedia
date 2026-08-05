# Search Console action prompt — for Claude in Chrome

Companion to `seo-audit-prompt.md`. That one audits what a browser receives;
this one drives **Google Search Console** itself — the small set of things that
are only actionable from inside GSC (sitemap submission, Validate Fix,
inspection, quota-limited indexing requests).

Paste the block below into Claude in Chrome with
`search.google.com/search-console` open on the `mcppedia.org` property.

Numbers are the 2026-08-04 baseline. **Re-read the reports before acting** —
the counts below are what we expect to see, not what you should assume.

---

You are operating **Google Search Console** for `mcppedia.org`, a catalogue of
36,614 Model Context Protocol servers. I want you to work through the actions
below in order, report what each report actually says before you act on it, and
tell me plainly when a report contradicts my expectations.

Do not request indexing on more than 10 URLs total — the daily quota is small
and I would rather spend it deliberately.

## Context: what changed, and what it should do to the reports

Baseline from the 2026-08-04 audit: **534 of 37,536 pages indexed (1.4%)**,
15,056 "Crawled – currently not indexed", 272 `404`s, 184 `5xx`, 0.3% CTR over
11.2K impressions. Search Console last read the sitemap on **Apr 26** and
reported **0 discovered pages**.

Shipped since:

- **Sitemap cut 36,614 → 13,458 URLs.** Thin server pages (no description, no
  tools, low score) now serve `robots: noindex, follow` and are excluded from
  the sitemap by one shared predicate, so the two cannot disagree. Live shape:
  `/sitemap.xml` (index) → `/sitemap-static.xml` (924), `/sitemap-servers-1.xml`
  (10,000), `/sitemap-servers-2.xml` (3,458).
- **`<lastmod>` is now `content_updated_at`**, which advances only on
  user-visible change, not on the daily stars/downloads refresh.
- **README relative links fixed** — these produced all 272 `404`s.
- **OG-image routes are no longer disallowed in robots.txt** (PR #120). The
  earlier disallow was blocking the `image` URL in our own `SoftwareApplication`
  schema, which made every server page ineligible for rich results. The 184
  `5xx` on those routes were load-related; they now return `200 image/png`.
- **Duplicate brand suffix removed** from ~150 hub titles (PR #120):
  `Best Data MCP Servers — MCPpedia - MCPpedia` → `Best Data MCP Servers —
  MCPpedia`. `/faq` went 85 → 65 characters and no longer truncates.
- **`/servers` gained an `<h1>`, intro copy and 44 hub links** (PR #121). It
  previously had no `<h1>` and no `<h2>` at all.

**Expect the indexed count to fall below 534 before it recovers.** Thin pages
that were indexed are now `noindex`. That is the intended effect, not a
regression — do not treat a drop as a failure.

## Actions

### 1. Sitemaps
Open **Indexing → Sitemaps**. Report the current status, "last read" date and
discovered-URL count for every sitemap listed.

- Remove any sitemap entry that is not `/sitemap.xml`, if stale ones are listed.
- Re-submit `https://mcppedia.org/sitemap.xml`.
- Confirm Google reads the two server shards through the index, and tell me the
  discovered count per shard. If it still says 0 discovered, say so — that is
  the single most important signal on this page.

### 2. Validate the fixes that have a Validate button
Open **Indexing → Pages** and work the error groups:

- **"Not found (404)"** — should be the 272 README links. Spot-check 3 with URL
  Inspection to confirm they are gone, then click **Validate Fix**.
- **"Server error (5xx)"** — should be the 184 `/s/*/opengraph-image` URLs.
  Confirm one returns 200 via URL Inspection, then **Validate Fix**.
- **"Blocked by robots.txt"** — the OG-image URLs should now be *leaving* this
  group. Report the current count so we can compare next week.
- **"Excluded by 'noindex' tag"** — this should be **growing**, by roughly
  23,000. That is the thin-page gate working. Confirm the direction.

Report each group's count before and after. Do not click Validate Fix on a
group you have not spot-checked.

### 3. Soft 404s — read, do not chase
If a **"Soft 404"** group appears or grows, report the count and a few example
URLs, then stop. Bad slugs on this site return `200` with
`<meta name="robots" content="noindex">`; this is documented Next.js streaming
behaviour and the `noindex` prevents indexation. It is a known, deliberate
trade-off. Do not request removal and do not treat it as a bug.

### 4. Spend the indexing quota on the pages that changed
Use **URL Inspection → Request Indexing** on these, in this order. Before each,
report what "Coverage" and "Last crawl" currently say, and whether the
Googlebot-rendered HTML shows the new title and `<h1>`:

1. `https://mcppedia.org/servers` — new `<h1>`, title and 44 internal links
2. `https://mcppedia.org/faq`
3. `https://mcppedia.org/best/data`
4. `https://mcppedia.org/best`
5. `https://mcppedia.org/` (homepage)
6. `https://mcppedia.org/s/brave-search` — a high-quality server page

For #6, use **Test Live URL** and check the rendered screenshot and the "More
info → Page resources" list: confirm the `opengraph-image` resource is no longer
reported as blocked.

### 5. Confirm the title rewrite
Open **Performance → Search results**, last 3 months, and report:

- Total impressions, clicks and CTR.
- The 10 queries with the most impressions and their CTR.
- The 10 pages with the most impressions.

Then check whether Google is still serving the **old** titles (e.g.
`Mcpbind Mcp Server — Score: 30/100 (D) - MCPpedia` or any title containing
`Score:` or a doubled `- MCPpedia`). Those pages are now `noindex` or retitled,
so old titles in the SERP mean Google has not recrawled yet. Tell me which.

### 6. Report-only checks
Report anything found, and take no action without asking me first:

- **Security & Manual actions** — confirm both are clean.
- **Experience → Core Web Vitals** — the last audit found "No data" for both
  mobile and desktop. Confirm whether field data has started arriving; if it
  has, give me LCP, CLS and INP at the 75th percentile for both.
- **Enhancements** — report which structured-data types GSC now recognises. We
  expect `Breadcrumbs` and `Software Apps`. If `Merchant listings` or
  `Review snippets` appear with errors, list them.
- **Links** — top linking sites and top linked pages.

## What I want back

A short written report: what each number was, what you changed, and what to
re-check in 7 days. Flag anything that contradicts the "what changed" section
above — that would mean a fix did not land the way we think it did.
