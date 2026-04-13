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
  return handle(request)
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
