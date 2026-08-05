# Live SEO audit prompt — for Claude in Chrome

Paste the block below into Claude in Chrome with mcppedia.org open. It audits
what is actually served to a browser, which is the half that cannot be checked
from the repo: rendered DOM, Core Web Vitals, layout shift, real SERP titles.

Regenerate the numbers before reusing it — they are the 2026-08-05 baseline,
taken right after the fixes in PR #117/#118 shipped.

---

You are auditing **mcppedia.org**, a catalogue of 36,614 Model Context Protocol
servers (Next.js 16 App Router, React 19, Supabase, Vercel). I want findings I
can act on, ordered by expected traffic impact, not a checklist.

## What was just fixed — do not re-report these

A Search Console audit on 2026-08-04 found 534 of 37,536 pages indexed (1.4%),
15,056 "Crawled – currently not indexed", 272 404s, 184 5xx, and 0.3% CTR over
11.2K impressions. These shipped on 2026-08-05:

- **Sitemap cut 36,614 → 13,458 URLs.** Thin server pages (no description, no
  tools, low score) now return `robots: noindex, follow` and are excluded from
  the sitemap by one shared predicate, so the two cannot disagree.
- **`<lastmod>` is now `content_updated_at`**, which only advances on
  user-visible change — not on the daily stars/downloads refresh that used to
  make every URL look modified every day.
- **`<changefreq>` and `<priority>` removed**; homepage `<loc>` gained its
  trailing slash to match its canonical.
- **README relative links fixed.** They resolved against mcppedia.org and
  produced all 272 404s; now rewritten to GitHub via a rehype plugin, with
  `rel="nofollow ugc noopener"` on every outbound README link.
- **OG-image routes disallowed in robots.txt** (all 184 5xx errors), plus
  `rel="nofollow"` on links to robots-disallowed paths (1,251 wasted
  discoveries).
- **Titles rebuilt**: `{Name} — {Category} MCP Server for Claude & Cursor |
  MCPpedia`, with acronyms fixed ("Mcp Hn" → "MCP HN") and the volatile score
  removed from the title.
- **Hub pages** (`/best`, `/best-for`, `/category`, `/compare`, `/skills`) gained
  150–300 words of data-derived intro copy, ItemList + BreadcrumbList JSON-LD,
  visible "Last updated", and cross-links.
- **`/faq` created**, `/mcp` now returns a real HTML page instead of a 406.

## What I need from you

Work through these in order. For each finding give: the URL, what you observed,
why it costs traffic, and the specific change to make.

### 1. Rendered output vs. source
Open a server page (`/s/brave-search`), a hub (`/best/data`), `/faq` and `/mcp`.
For each, compare the **rendered DOM** against view-source. Is the primary
content server-rendered, or does it only appear after hydration? Anything that
needs JavaScript to exist is at risk of never being indexed. Name specific
elements.

### 2. Core Web Vitals, measured
Run Lighthouse or PageSpeed Insights on `/`, `/s/brave-search`, `/best/data` and
`/servers`. Report actual LCP, CLS and INP numbers per URL — not a score out of
100. Identify the LCP element on each and what delays it. Flag any layout shift
and what causes it. Mobile first; that's where the crawl budget goes.

### 3. Do the new titles survive the SERP?
Google search `site:mcppedia.org`, plus `mcp server for postgres`,
`best mcp servers`, `claude desktop mcp setup`. Are our titles shown as written,
or is Google rewriting them? A rewritten title means it judged ours unhelpful —
tell me which ones and what the pattern is. Note where truncation lands.

### 4. Competitors
Look at the top 3 results for `best mcp servers`, `mcp server directory` and
`mcp servers for claude`. What do the pages that outrank us have that we don't —
structurally, not cosmetically? Content depth, schema types, internal linking,
freshness signals, page structure. Be concrete and name the sites.

### 5. Structured data, validated
Run Google's Rich Results Test on `/s/brave-search`, `/faq`, `/best/data` and a
`/compare/*` page. Report errors and warnings verbatim. Which types are eligible
for rich results and which are being ignored? We emit SoftwareApplication,
FAQPage, ItemList, BreadcrumbList, Article and Dataset.

### 6. Answer engines
Ask ChatGPT, Perplexity and Google's AI Overview: "what is the best MCP server
for postgres", "how do I install an MCP server in Claude Desktop", "how many MCP
servers are there". Do they cite mcppedia.org? If not, who do they cite and what
does that source do differently? If they quote a server count, is it our current
one (36,614) or a stale number?

### 7. Mobile and interaction
On a mobile viewport, check tap-target sizes, horizontal overflow, and whether
the install-config code blocks are readable and copyable. Check the sticky
sub-nav on a server page doesn't obscure content when jumping to an anchor.

## Output format

A ranked table: **finding | URL | evidence | expected impact | fix**. Highest
expected impact first. Then a short list of anything that looks wrong but that
you could not confirm, marked as such.

Two things I do not want: generic SEO advice that isn't grounded in something
you observed on the site, and re-reporting anything in the "just fixed" list
above without new evidence that it is still broken.
