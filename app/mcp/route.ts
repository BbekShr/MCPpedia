import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { registerTools } from '@/lib/mcp/tools'
import { registerResources } from '@/lib/mcp/resources'
import { registerPrompts } from '@/lib/mcp/prompts'

// Hosted MCPpedia MCP endpoint — Streamable HTTP, stateless mode so it works
// on Vercel's serverless model (no per-request session affinity needed).
//
// Clients connect with e.g.:
//   {
//     "mcpServers": {
//       "mcppedia": { "url": "https://mcppedia.org/mcp" }
//     }
//   }

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'mcppedia', version: '0.2.0' },
    {
      capabilities: {
        tools: {},
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
      },
      instructions:
        'Catalog of 17K+ MCP servers with security, maintenance, efficiency, documentation, and compatibility scores. ' +
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
  const transport = new WebStandardStreamableHTTPServerTransport()
  const server = buildServer()
  await server.connect(transport)
  const response = await transport.handleRequest(request)

  // Append CORS headers — MCPpedia allows any origin for this public endpoint.
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Expose-Headers', 'mcp-session-id')
  return response
}

export async function POST(request: Request) {
  return handle(request)
}

export async function GET(request: Request) {
  // If a browser hits /mcp directly, show a friendly landing page instead of
  // the JSON-RPC 406 error. Real MCP clients send text/event-stream and fall
  // through to the transport.
  const accept = request.headers.get('accept') || ''
  if (accept.includes('text/html') && !accept.includes('text/event-stream')) {
    return new Response(LANDING_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  return handle(request)
}

const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MCPpedia MCP endpoint</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font: 15px/1.55 -apple-system, system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; color: #111; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  pre { background: #f4f4f5; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
  a { color: #c2410c; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .muted { color: #666; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 32px 0; }
</style>
</head>
<body>
<h1>MCPpedia MCP endpoint</h1>
<p class="muted">You're looking at <code>/mcp</code>. This is a Model Context Protocol JSON-RPC endpoint — it's meant for AI clients, not browsers. That's why a direct visit shows <em>Not Acceptable</em>.</p>

<h3>Connect an MCP client</h3>
<p>Add MCPpedia as a remote MCP server:</p>
<pre>{
  "mcpServers": {
    "mcppedia": { "url": "https://mcppedia.org/mcp" }
  }
}</pre>

<h3>Or install locally</h3>
<pre>npx -y mcp-server-mcppedia</pre>

<h3>Other options</h3>
<ul>
  <li><a href="https://smithery.ai/servers/bbeksh/mcppedia">Smithery listing</a></li>
  <li><a href="https://github.com/BbekShr/mcp-server-mcppedia/releases/latest">.mcpb bundle (Claude Desktop)</a></li>
  <li><a href="https://www.npmjs.com/package/mcp-server-mcppedia">npm package</a></li>
</ul>

<hr>
<p class="muted">Browse the catalog at <a href="https://mcppedia.org">mcppedia.org</a>.</p>
</body>
</html>`

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
