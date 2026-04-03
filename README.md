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

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database:** Supabase (PostgreSQL)
- **Security data:** OSV.dev API
- **Server registry:** registry.modelcontextprotocol.io
- **AI:** Anthropic Claude (schema extraction)
- **Hosting:** Vercel

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- GitHub personal access token (for bot metadata fetching)

### Setup

```bash
git clone https://github.com/bibekshrestha/mcppedia.git
cd mcppedia
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
app/            Next.js pages and API routes
bots/           Automated data pipeline scripts (run via GitHub Actions)
components/     React components
lib/            Shared utilities, types, scoring engine
scripts/        One-off data scripts
supabase/       Database migrations
content/        Static content (guides, etc.)
```

## Bots

Automated bots run daily via GitHub Actions to keep data fresh:

| Bot | Schedule | What it does |
|-----|----------|-------------|
| `sync-registry` | 1am UTC | Syncs servers from the official MCP Registry |
| `update-metadata` | 3am UTC | Refreshes GitHub stars, commits, issues, npm downloads |
| `compute-scores` | 5am UTC | Computes all scores (security, efficiency, docs, etc.) |
| `extract-schemas` | 6am UTC | Extracts tool schemas from server packages using Claude |
| `detect-changelogs` | 7am UTC | Detects version changes from GitHub releases |
| `extract-install-info` | 8am UTC | Extracts install configs and categories |
| `discover` | Weekly | Discovers new MCP servers from GitHub and npm |

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
