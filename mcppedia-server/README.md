# MCPpedia MCP Server

[![MCPpedia Score](https://mcppedia.org/api/badge/mcp-server-mcppedia)](https://mcppedia.org/s/mcp-server-mcppedia) [![npm](https://img.shields.io/npm/v/mcp-server-mcppedia)](https://www.npmjs.com/package/mcp-server-mcppedia) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Search, evaluate, and compare 17,000+ MCP servers from the [MCPpedia](https://mcppedia.org) catalog. Every server is scored on security, maintenance, efficiency, documentation, and compatibility — with real CVE scanning and tool poisoning detection.

## Tools

| Tool | Description |
|------|-------------|
| `search_servers` | Search by keyword, category, or minimum score |
| `get_server_details` | Full details: scoring breakdown, tools list, install configs. Pass `security: true` for a deep security report with CVE/poisoning/injection evidence |
| `compare_servers` | Side-by-side comparison across all 5 scoring dimensions |
| `get_install_config` | Ready-to-use config for Claude Desktop, Cursor, Claude Code, Windsurf |
| `get_trending` | Top-rated, most starred, or newest servers by category |

## Install

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "MCPpedia": {
      "command": "npx",
      "args": ["-y", "mcp-server-mcppedia"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add MCPpedia -- npx -y mcp-server-mcppedia
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "MCPpedia": {
      "command": "npx",
      "args": ["-y", "mcp-server-mcppedia"]
    }
  }
}
```

### Windsurf

Add to your MCP config:

```json
{
  "mcpServers": {
    "MCPpedia": {
      "command": "npx",
      "args": ["-y", "mcp-server-mcppedia"]
    }
  }
}
```

### Remote (HTTP/SSE)

Run the server with `--http` to expose it as an HTTP endpoint:

```bash
npx mcp-server-mcppedia --http
# Listening on port 8080
```

Set a custom port with `PORT=3001 npx mcp-server-mcppedia --http`.

## How It Works

```
Your AI Agent  →  MCPpedia MCP Server  →  mcppedia.org/api/mcp  →  Database
   (local)            (local)              (rate-limited, cached)
```

The MCP server calls the MCPpedia public API — no API keys needed. Your credentials stay safe on the server side.

### Transports

| Transport | Use case | Command |
|-----------|----------|---------|
| **stdio** (default) | Local clients: Claude Desktop, Cursor, Claude Code | `npx mcp-server-mcppedia` |
| **HTTP/SSE** | Remote deployment, shared servers, web clients | `npx mcp-server-mcppedia --http` |

### Rate Limits

- 60 requests/minute per IP (no sign-up needed)

## Examples

### Find the best server for a task

> "Find me a good MCP server for working with databases"

The AI calls `search_servers` with query "database", gets back scored results.

### Check if a server is safe

> "Is the filesystem MCP server safe to use?"

The AI calls `get_server_details` with `slug: "filesystem", security: true`, gets back a full security report with CVE count, tool poisoning detection, injection risk analysis, and evidence.

### Compare alternatives

> "Compare the Puppeteer and Playwright MCP servers"

The AI calls `compare_servers` with both slugs, gets a markdown table comparing all 5 scoring dimensions.

### Get install instructions

> "How do I install the GitHub MCP server in Cursor?"

The AI calls `get_install_config` with `slug: "github", client: "cursor"`, gets back a ready-to-paste JSON config.

### Discover what's trending

> "What are the most popular AI/ML MCP servers?"

The AI calls `get_trending` with `category: "ai-ml", sort: "stars"`.

### Security audit workflow

> "Audit all my MCP servers for security issues"

The AI calls `get_server_details` with `security: true` for each server, compiling a risk report.

## Configuration

| Environment Variable | Description |
|---------------------|-------------|
| `MCPPEDIA_API_URL` | Optional. Override API base URL (for self-hosting) |
| `PORT` | Optional. HTTP server port (default: 8080, only used with `--http`) |

## Compatible Clients

- Claude Desktop
- Claude Code
- Cursor
- Windsurf
- Any MCP-compatible client via stdio or HTTP/SSE

## Development

```bash
npm install
npm run build         # compile TypeScript
npm run dev           # run with tsx (hot reload)
npm start             # run compiled (stdio)
npm start -- --http   # run compiled (HTTP on port 8080)
```

## License

MIT

## Links

- [MCPpedia](https://mcppedia.org) — Browse the full catalog
- [GitHub](https://github.com/BbekShr/mcp-server-mcppedia) — Source code
- [npm](https://www.npmjs.com/package/mcp-server-mcppedia) — Package
