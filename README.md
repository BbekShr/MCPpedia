# MCPpedia

The encyclopedia for MCP servers. Browse, compare, and evaluate Model Context Protocol servers with transparent, automated scoring.

**Live at [mcppedia.org](https://mcppedia.org)**

## Features

- **Automated scoring** — every server scored 0-100 across security, maintenance, efficiency, documentation, and compatibility
- **Real CVE scanning** — queries [OSV.dev](https://osv.dev) for known vulnerabilities in npm and PyPI packages
- **Token efficiency measurement** — measures actual context window cost of each server's tool schemas
- **Registry sync** — pulls from the [official MCP Registry](https://registry.modelcontextprotocol.io) daily
- **One-click install configs** — copy-paste configs for Claude Desktop, Cursor, Claude Code, and Windsurf
- **Server comparison** — side-by-side comparison of any two servers
- **Community reviews and discussion** — user reviews with star ratings
- **Blog** — auto-generated and editorial articles about MCP servers and the ecosystem
- **Newsletter** — weekly digest of new and trending servers
- **Best-of lists** — curated lists of top servers by category and use case
- **Embeddable badges** — score badges you can add to your server's README
- **MCP server** — an MCP server for querying MCPpedia data programmatically (`mcppedia-server/`)

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Security data:** OSV.dev API
- **Server registry:** registry.modelcontextprotocol.io
- **AI:** Anthropic Claude (schema extraction, blog generation, description enrichment)
- **Hosting:** Vercel

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- GitHub personal access token (for bot metadata fetching)

### Setup

```bash
git clone https://github.com/BbekShr/MCPpedia.git
cd MCPpedia
npm install
cp .env.example .env.local
# Fill in your keys in .env.local
```

### Database

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/              Next.js pages and API routes
bots/             Automated data pipeline scripts (run via GitHub Actions)
components/       React components
lib/              Shared utilities, types, scoring engine
scripts/          One-off data scripts
supabase/         Database migrations
content/          Static content (blog posts, guides)
cli/              CLI tool for querying MCPpedia
mcppedia-server/  MCP server for querying MCPpedia data
```

## Bots

Automated bots run via GitHub Actions to keep data fresh:

| Bot | Schedule | What it does |
|-----|----------|-------------|
| `sync-registry` | Daily 1am UTC | Syncs servers from the official MCP Registry |
| `discover` | Daily 2am UTC | Discovers new MCP servers from GitHub and npm |
| `update-metadata` | Daily 3am UTC | Refreshes GitHub stars, commits, issues, npm downloads |
| `extract-install-info` | Daily 4am UTC | Extracts install configs and categories |
| `enrich-descriptions` | Daily 4:30am UTC | Enriches server descriptions using Claude |
| `compute-scores` | Daily 5am UTC | Computes all scores (security, efficiency, docs, etc.) |
| `extract-schemas` | Daily 5am UTC | Extracts tool schemas from server packages using Claude |
| `track-trending` | Daily 6:30am UTC | Tracks trending servers |
| `blog-security-alerts` | Daily 7am UTC | Generates blog posts for security alerts |
| `generate-blog` | Mon & Thu 10am UTC | Auto-generates blog articles |
| `publish-scheduled-blog` | Daily 12pm UTC | Publishes scheduled blog posts |
| `send-digest` | Friday 10am UTC | Sends the weekly newsletter digest |
| `check-broken-links` | Weekly (Sun 6am UTC) | Checks for broken links across the site |
| `detect-duplicates` | Weekly (Mon 6am UTC) | Detects duplicate server entries |

Run any bot locally:

```bash
npx tsx bots/compute-scores.ts
```

## Scoring

Each server is scored 0-100 across 5 categories:

| Category | Weight | Source |
|----------|--------|--------|
| Security | 30 | OSV.dev CVEs, license, authentication, archive status |
| Maintenance | 25 | Commit recency, stars, downloads, open issues |
| Efficiency | 20 | Token cost of tool schemas in context window |
| Documentation | 15 | README quality, tool docs, install configs, examples |
| Compatibility | 10 | Transport support (stdio/HTTP), tested clients |

See the full methodology at [mcppedia.org/methodology](https://mcppedia.org/methodology).

## Contributing

Contributions welcome! Some ways to help:

- **Improve server data** — edit pages on the site to fix descriptions, add install configs, or categorize servers
- **Report issues** — open a GitHub issue for bugs or feature requests
- **Add features** — check open issues for things to work on

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

This means you can freely use, modify, and distribute this code. If you run a modified version as a network service, you must make your source code available under the same license.
