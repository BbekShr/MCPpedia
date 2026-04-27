# MCPpedia Classifier Rules (subagent reference)

You are classifying MCP server entries for the public MCPpedia directory. You will receive an assigned batch number and must process EVERY entry in that batch.

## Inputs / Outputs

- Read: `data/dumps/servers/batch-NNNN.json` (or `data/dumps/advisories/batch-NNNN.json` for advisories)
- Write: `data/classifications/servers/batch-NNNN.json` (or `…/advisories/…`)
- Both paths are relative to `/Users/bibekshrestha/mcppedia/`. Use absolute paths when calling Read/Write.
- Every entry in the input MUST appear in the output. No skipping.
- Output must be valid JSON. No trailing commas. No comments in the file.

## Server output shape

Keyed by `slug`:

```json
{
  "<slug>": {
    "categories": ["<from CATEGORIES enum>"],
    "transport": ["<from TRANSPORTS enum>"],
    "compatible_clients": ["<from COMPATIBLE_CLIENTS enum>"],
    "author_type": "<official|community|unknown>",
    "api_pricing": "<free|freemium|paid|unknown>",
    "tags": ["lowercase", "keywords"],
    "_notes": "optional one-liner; omit if not needed"
  }
}
```

## Advisory output shape

Keyed by advisory `id` (from the dump):

```json
{
  "<advisory-id>": {
    "severity": "<critical|high|medium|low|info>",
    "status": "<open|fixed|wont_fix|disputed>",
    "_notes": "optional"
  }
}
```

## Enums (canonical, no other values)

- categories (max 2): productivity, developer-tools, data, finance, ai-ml, communication, cloud, security, analytics, design, devops, education, entertainment, health, marketing, search, writing, maps, ecommerce, legal, browser, other
- transport (1-3): stdio, sse, http
- compatible_clients (1-5, never empty): claude-desktop, cursor, claude-code, windsurf, other
- author_type (1): official, community, unknown
- api_pricing (1): free, freemium, paid, unknown
- advisory severity (1): critical, high, medium, low, info
- advisory status (1): open, fixed, wont_fix, disputed

## Decision rules — servers

**categories** — pick the dominant domain from name+tagline+description+tools. Default to one; add a second only if clearly cross-domain. NEVER use 'other' if any specific category fits. Heuristics:
- Filesystem/git/code/IDE/build → developer-tools (devops for CI/CD/k8s/terraform/docker/ansible)
- DBs, ETL, warehouses, sheets, csv, parquet → data
- LLMs, agent frameworks, embeddings, vector DBs, RAG → ai-ml
- Stripe, accounting, banking, crypto, trading → finance
- Slack, Discord, email, SMS, Teams → communication
- AWS, GCP, Azure, S3, R2 → cloud
- Vuln scanners, secrets, auth, CVE, SAST → security
- Charts, BI, dashboards, metrics → analytics
- Figma, Canva, image editors, color → design
- Maps, geocoding, places, weather → maps
- Shopify, products, orders, cart → ecommerce
- Notes, todos, calendars, projects, kanban → productivity
- Search engines, retrieval, web search → search
- Browser automation, web scraping, puppeteer/playwright → browser
- Music, video, games, streaming → entertainment
- Doc generation, blog, summarization, translation → writing
- Health/fitness/medical → health
- Tutorials, courses, flashcards, study → education
- Marketing/SEO/email-campaigns → marketing
- Legal docs, contracts, compliance → legal

**transport** — start from the current `transport` array (already populated by a bot). Trust it. Add `http`/`sse` only if tagline/description explicitly mentions a hosted endpoint/URL. If currently empty, default to `["stdio"]`.

**compatible_clients** — almost all stdio MCP servers run in claude-desktop, cursor, claude-code. So:
- transport includes 'stdio' → emit `["claude-desktop", "cursor", "claude-code"]`
- Add `"windsurf"` if name/description/tags mention windsurf
- HTTP-only with no stdio → still emit `["claude-desktop", "cursor", "claude-code"]` (all support remote MCP)
- NEVER emit empty array. NEVER emit just `["other"]` unless clearly non-Claude-ecosystem.

**author_type** — `official` ONLY when ALL hold:
1. `author_github` matches a known company/vendor org for the product (anthropic, modelcontextprotocol, github, supabase, cloudflare, stripe, google, googleapis, microsoft, openai, sentry, getsentry, vercel, posthog, linear, notion, slack, slackapi, discord, hashicorp, mongodb, redis, redislabs, elastic, elasticsearch, atlassian, gitlab, docker, kubernetes-sigs, datadoghq, snowflakedb, databricks, prisma, planetscale, neondatabase, pinecone-io, brave, browserbase, cohere, mistralai, replicate, anthropics, etc.)
2. AND `github_url` is hosted under that same org
3. AND it's the company's own integration (not a third-party wrapper)

Else `community` if any author info exists. Only `unknown` when both `author_name` and `author_github` are null/empty.

**api_pricing** — be aggressive about classifying; the goal is to wipe out 99.9% unknown rate.
- `free` if `requires_api_key=false` AND no external paid API mentioned (most filesystem/git/local-tool servers fall here)
- `freemium` if connects to a service with a known free tier: GitHub, GitLab, Bitbucket, Slack, Notion, Linear, Discord, OpenAI, Anthropic, Brave Search, Google APIs, Microsoft Graph, Spotify, Reddit, YouTube, Sentry, PostHog, Cloudflare, Vercel, Netlify, Supabase, Firebase, MongoDB Atlas, Stripe (test mode), Twilio (trial), Resend, SendGrid, Mailgun, Algolia, Elastic Cloud, Pinecone, Weaviate, Qdrant, Hugging Face, Replicate, Cohere, Mistral, Groq, Together AI, Perplexity (limited), Tavily (limited), Exa (limited)
- `paid` if it strictly requires a paid subscription/credits with no free tier: Bloomberg, DataForSEO, Bright Data, Kagi, Apollo.io, ZoomInfo, paid premium APIs, IDA Pro extensions, etc.
- `unknown` ONLY if you genuinely can't tell after checking name+description+api_name

**tags** — 2-6 lowercase keywords from name+description not already in `categories`. Examples: "postgres", "github", "kubernetes", "stripe", "openai", "scraping". Skip generic words ("mcp", "server", "tool"). Optional but encouraged.

## Decision rules — advisories

**severity** — start from CVSS:
- ≥9.0 → critical
- ≥7.0 → high
- ≥4.0 → medium
- >0   → low
- 0/null with no real impact → info

Override on description if CVSS is missing or wildly off-scale. RCE, command injection, arbitrary file read/write, credential theft → high or critical regardless of CVSS. Local-only DoS or info disclosure → medium or low.

**status** — start from current value. Override based on description:
- `fixed` if a `fixed_version` is present AND description confirms a release patched it
- `wont_fix` if description says upstream marked won't fix / archived / abandoned
- `disputed` if description explicitly says disputed/contested/false-positive
- Else `open`

## Verification before exiting

1. `jq 'length' <output-file>` matches the dump entry count.
2. Confirm zero `'unknown'` for `api_pricing` and `author_type` unless truly unavoidable, and report the unknown count if any remain.
3. Report distribution of primary categories and pricing.
4. Report any standout judgement calls (≤3 lines).

Return under 150 words. The orchestrator only needs the counts and any anomalies.
