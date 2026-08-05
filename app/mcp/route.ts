import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { getClientIp } from '@/lib/rate-limit'
import { runWithCallerIp } from '@/lib/mcp/api'
import { registerTools } from '@/lib/mcp/tools'
import { registerResources } from '@/lib/mcp/resources'
import { registerPrompts } from '@/lib/mcp/prompts'
import { SITE_NAME, SITE_URL } from '@/lib/constants'
import { getCatalogCounts, formatApproxTotal } from '@/lib/live-counts'

// Hosted MCPpedia MCP endpoint — Streamable HTTP, stateless mode so it works
// on Vercel's serverless model (no per-request session affinity needed).
//
// Clients connect with e.g.:
//   {
//     "mcpServers": {
//       "mcppedia": { "url": "https://mcppedia.org/mcp" }
//     }
//   }

// Version of the published MCP server package, reported over the protocol and
// in the landing page's SoftwareApplication schema so the two cannot drift.
const MCP_SERVER_VERSION = '0.2.0'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'mcppedia', version: MCP_SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
      },
      instructions:
        // Deliberately no server count: this string is baked into the bundle,
        // so any number in it goes stale the day the catalog grows. Surfaces
        // that can read the live snapshot use lib/live-counts.ts instead.
        'The full MCPpedia catalog of MCP servers, each scored on security, maintenance, efficiency, documentation, and compatibility. ' +
        'Use `search_servers` or `get_trending` to discover, `get_server_details` (security=true) to evaluate, ' +
        '`compare_servers` to pick between candidates, `get_install_config` to hand off setup.',
    }
  )
  registerTools(server)
  registerResources(server)
  registerPrompts(server)
  return server
}

async function handle(request: Request): Promise<Response> {
  // Tool handlers reach /api/mcp over a public round trip, which rate-limits by
  // client IP — from here that would be the lambda's egress IP, one shared
  // bucket for every user. Carry the real caller's IP so the limiter can see
  // who it is actually limiting.
  const response = await runWithCallerIp(getClientIp(request), async () => {
    const transport = new WebStandardStreamableHTTPServerTransport()
    const server = buildServer()
    await server.connect(transport)
    return transport.handleRequest(request)
  })

  // Append CORS headers — MCPpedia allows any origin for this public endpoint.
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Expose-Headers', 'mcp-session-id')
  return response
}

export async function POST(request: Request) {
  return handle(request)
}

export async function GET(request: Request) {
  // The MCP Streamable HTTP spec reserves GET for the SSE stream, and a client
  // opening it MUST send `Accept: text/event-stream`. Anything else on GET is a
  // browser or a crawler, so it gets the landing page.
  //
  // The condition used to require `text/html` in Accept, which meant a crawler
  // sending `*/*` fell through to the transport and got a bare 406 — on a page
  // linked from the sitewide footer. Keying on the protocol's own header
  // instead is both stricter for real clients and correct for everyone else.
  const accept = request.headers.get('accept') || ''
  if (!accept.includes('text/event-stream')) {
    return new Response(await renderLanding(), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  }
  return handle(request)
}

// A real landing page, not an error placeholder. /mcp is linked from the
// sitewide footer and is the highest-intent page on the site — someone reading
// it is one copy-paste from installing MCPpedia into their agent — so it
// carries a title, description, canonical, OG tags and SoftwareApplication
// schema like any other indexable page.
async function renderLanding(): Promise<string> {
  const { totalServers } = await getCatalogCounts()
  const catalogSize = formatApproxTotal(totalServers)
  const title = `MCPpedia MCP Server — Search ${catalogSize} MCP Servers From Your Agent | MCPpedia`
  const description =
    `Connect MCPpedia's own MCP server to Claude, Cursor or Claude Code and search, compare and ` +
    `install from ${catalogSize} scored MCP servers without leaving your agent. Free, no auth.`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MCPpedia MCP Server',
    description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Cross-platform',
    url: `${SITE_URL}/mcp`,
    installUrl: 'https://www.npmjs.com/package/mcp-server-mcppedia',
    downloadUrl: 'https://www.npmjs.com/package/mcp-server-mcppedia',
    softwareVersion: MCP_SERVER_VERSION,
    softwareRequirements: 'An MCP-compatible client (Claude Desktop, Claude Code, Cursor, Windsurf)',
    codeRepository: 'https://github.com/BbekShr/mcp-server-mcppedia',
    sameAs: [
      'https://github.com/BbekShr/mcp-server-mcppedia',
      'https://www.npmjs.com/package/mcp-server-mcppedia',
      'https://smithery.ai/servers/bbeksh/mcppedia',
    ],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE_URL}/mcp">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}/mcp">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003C')}</script>
<style>
  body { font: 15px/1.55 -apple-system, system-ui, sans-serif; max-width: 680px; margin: 60px auto; padding: 0 20px; color: #111; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  pre { background: #f4f4f5; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
  a { color: #c2410c; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  h2 { font-size: 17px; margin-top: 32px; }
  .lede { font-size: 16px; }
  .muted { color: #666; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 32px 0; }
  ul { padding-left: 20px; }
  li { margin: 4px 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b0b0c; color: #e8e8ea; }
    pre { background: #17171a; }
    a { color: #fb923c; }
    hr { border-top-color: #2a2a2e; }
    .muted { color: #9a9aa2; }
  }
</style>
</head>
<body>
<h1>MCPpedia MCP Server</h1>
<p class="lede">MCPpedia runs its own MCP server. Connect it to Claude Desktop, Claude Code, Cursor or
Windsurf and you can search, compare and install from ${escapeHtml(catalogSize)} scored MCP servers
without leaving your agent. It is free, needs no API key, and no account.</p>

<h2>Connect it as a remote server</h2>
<p>Add this to your client's MCP config — the same JSON works in every client, only the file path differs:</p>
<pre>{
  "mcpServers": {
    "mcppedia": { "url": "${SITE_URL}/mcp" }
  }
}</pre>

<h2>Or run it locally</h2>
<pre>npx -y mcp-server-mcppedia</pre>

<h2>What it can do</h2>
<ul>
  <li><code>search_servers</code> — search the catalog by keyword, category, transport or score</li>
  <li><code>get_trending</code> — what is gaining stars and downloads this week</li>
  <li><code>get_server_details</code> — full record for one server, including its security findings</li>
  <li><code>compare_servers</code> — put two or more candidates side by side</li>
  <li><code>get_install_config</code> — the exact config block to paste into a client</li>
</ul>
<p class="muted">Every server is scored 0-100 across security (CVE scanning, tool poisoning, auth),
maintenance, documentation, compatibility and token efficiency. See the
<a href="${SITE_URL}/methodology">scoring methodology</a>.</p>

<h2>Other ways to install</h2>
<ul>
  <li><a href="https://smithery.ai/servers/bbeksh/mcppedia">Smithery listing</a></li>
  <li><a href="https://github.com/BbekShr/mcp-server-mcppedia/releases/latest">.mcpb bundle (Claude Desktop)</a></li>
  <li><a href="https://www.npmjs.com/package/mcp-server-mcppedia">npm package</a></li>
</ul>

<hr>
<p class="muted">This URL is also the live JSON-RPC endpoint: an MCP client requesting
<code>text/event-stream</code> gets the protocol, everyone else gets this page.
Browse the catalog at <a href="${SITE_URL}/">mcppedia.org</a>, or read the
<a href="${SITE_URL}/get-started">getting started guide</a>.</p>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function DELETE(request: Request) {
  return handle(request)
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id, mcp-protocol-version',
      'Access-Control-Expose-Headers': 'mcp-session-id',
    },
  })
}
