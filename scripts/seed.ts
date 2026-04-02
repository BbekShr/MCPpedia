/**
 * Seed script — populates the database with well-known MCP servers for development.
 * Run: npx tsx scripts/seed.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const servers = [
  {
    slug: 'filesystem',
    name: 'Filesystem MCP Server',
    tagline: 'Read, write, and manage files on the local filesystem',
    github_url: 'https://github.com/modelcontextprotocol/servers',
    npm_package: '@modelcontextprotocol/server-filesystem',
    author_name: 'Anthropic',
    author_github: 'modelcontextprotocol',
    author_type: 'official',
    transport: ['stdio'],
    categories: ['developer-tools'],
    tools: [
      { name: 'read_file', description: 'Read the contents of a file' },
      { name: 'write_file', description: 'Write content to a file' },
      { name: 'list_directory', description: 'List directory contents' },
      { name: 'create_directory', description: 'Create a new directory' },
      { name: 'move_file', description: 'Move or rename a file' },
      { name: 'search_files', description: 'Search for files by pattern' },
      { name: 'get_file_info', description: 'Get metadata about a file' },
    ],
    api_pricing: 'free',
    github_stars: 15000,
    health_status: 'active',
    install_configs: {
      'claude-desktop': {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/username/Desktop'],
          },
        },
      },
    },
  },
  {
    slug: 'github',
    name: 'GitHub MCP Server',
    tagline: 'Interact with GitHub repositories, issues, pull requests, and more',
    github_url: 'https://github.com/modelcontextprotocol/servers',
    npm_package: '@modelcontextprotocol/server-github',
    author_name: 'Anthropic',
    author_github: 'modelcontextprotocol',
    author_type: 'official',
    transport: ['stdio'],
    categories: ['developer-tools'],
    tools: [
      { name: 'create_or_update_file', description: 'Create or update a file in a repository' },
      { name: 'search_repositories', description: 'Search for GitHub repositories' },
      { name: 'create_issue', description: 'Create a new issue' },
      { name: 'create_pull_request', description: 'Create a pull request' },
      { name: 'list_commits', description: 'List commits on a branch' },
      { name: 'get_file_contents', description: 'Get contents of a file' },
    ],
    api_pricing: 'free',
    requires_api_key: true,
    github_stars: 15000,
    health_status: 'active',
    install_configs: {
      'claude-desktop': {
        mcpServers: {
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: '<your-token>' },
          },
        },
      },
    },
  },
  {
    slug: 'slack',
    name: 'Slack MCP Server',
    tagline: 'Access Slack workspace data — search messages, post to channels, manage workflows',
    github_url: 'https://github.com/modelcontextprotocol/servers',
    npm_package: '@modelcontextprotocol/server-slack',
    author_name: 'Anthropic',
    author_github: 'modelcontextprotocol',
    author_type: 'official',
    transport: ['stdio'],
    categories: ['productivity', 'communication'],
    tools: [
      { name: 'search_messages', description: 'Search for messages in Slack channels' },
      { name: 'post_message', description: 'Send a message to a Slack channel' },
      { name: 'list_channels', description: 'List all channels in workspace' },
      { name: 'get_channel_history', description: 'Get recent messages from a channel' },
      { name: 'add_reaction', description: 'Add a reaction to a message' },
    ],
    api_pricing: 'free',
    requires_api_key: true,
    github_stars: 15000,
    health_status: 'active',
  },
  {
    slug: 'brave-search',
    name: 'Brave Search MCP Server',
    tagline: 'Web and local search using Brave Search API',
    github_url: 'https://github.com/modelcontextprotocol/servers',
    npm_package: '@modelcontextprotocol/server-brave-search',
    author_name: 'Anthropic',
    author_github: 'modelcontextprotocol',
    author_type: 'official',
    transport: ['stdio'],
    categories: ['data', 'ai-ml'],
    tools: [
      { name: 'brave_web_search', description: 'Search the web using Brave Search' },
      { name: 'brave_local_search', description: 'Search for local businesses and places' },
    ],
    api_pricing: 'freemium',
    requires_api_key: true,
    github_stars: 15000,
    health_status: 'active',
  },
  {
    slug: 'postgres',
    name: 'PostgreSQL MCP Server',
    tagline: 'Query and manage PostgreSQL databases directly from AI assistants',
    github_url: 'https://github.com/modelcontextprotocol/servers',
    npm_package: '@modelcontextprotocol/server-postgres',
    author_name: 'Anthropic',
    author_github: 'modelcontextprotocol',
    author_type: 'official',
    transport: ['stdio'],
    categories: ['data', 'developer-tools'],
    tools: [
      { name: 'query', description: 'Execute a SQL query on the connected database' },
    ],
    api_pricing: 'free',
    requires_api_key: false,
    github_stars: 15000,
    health_status: 'active',
  },
  {
    slug: 'puppeteer',
    name: 'Puppeteer MCP Server',
    tagline: 'Browser automation with Puppeteer for web scraping and testing',
    github_url: 'https://github.com/modelcontextprotocol/servers',
    npm_package: '@modelcontextprotocol/server-puppeteer',
    author_name: 'Anthropic',
    author_github: 'modelcontextprotocol',
    author_type: 'official',
    transport: ['stdio'],
    categories: ['developer-tools', 'data'],
    tools: [
      { name: 'puppeteer_navigate', description: 'Navigate to a URL' },
      { name: 'puppeteer_screenshot', description: 'Take a screenshot' },
      { name: 'puppeteer_click', description: 'Click an element' },
      { name: 'puppeteer_fill', description: 'Fill out an input field' },
      { name: 'puppeteer_evaluate', description: 'Execute JavaScript in the browser' },
    ],
    api_pricing: 'free',
    github_stars: 15000,
    health_status: 'active',
  },
  {
    slug: 'fetch',
    name: 'Fetch MCP Server',
    tagline: 'Make HTTP requests and fetch web content',
    github_url: 'https://github.com/modelcontextprotocol/servers',
    npm_package: '@modelcontextprotocol/server-fetch',
    author_name: 'Anthropic',
    author_github: 'modelcontextprotocol',
    author_type: 'official',
    transport: ['stdio'],
    categories: ['developer-tools'],
    tools: [
      { name: 'fetch', description: 'Fetch a URL and return its content' },
    ],
    api_pricing: 'free',
    github_stars: 15000,
    health_status: 'active',
  },
  {
    slug: 'memory',
    name: 'Memory MCP Server',
    tagline: 'Persistent memory using a knowledge graph',
    github_url: 'https://github.com/modelcontextprotocol/servers',
    npm_package: '@modelcontextprotocol/server-memory',
    author_name: 'Anthropic',
    author_github: 'modelcontextprotocol',
    author_type: 'official',
    transport: ['stdio'],
    categories: ['ai-ml'],
    tools: [
      { name: 'create_entities', description: 'Create new entities in the knowledge graph' },
      { name: 'create_relations', description: 'Create relationships between entities' },
      { name: 'search_nodes', description: 'Search for nodes in the graph' },
      { name: 'open_nodes', description: 'Read specific nodes' },
      { name: 'delete_entities', description: 'Remove entities from the graph' },
    ],
    api_pricing: 'free',
    github_stars: 15000,
    health_status: 'active',
  },
  {
    slug: 'sequential-thinking',
    name: 'Sequential Thinking MCP Server',
    tagline: 'Dynamic problem-solving through sequential thought chains',
    github_url: 'https://github.com/modelcontextprotocol/servers',
    npm_package: '@modelcontextprotocol/server-sequential-thinking',
    author_name: 'Anthropic',
    author_github: 'modelcontextprotocol',
    author_type: 'official',
    transport: ['stdio'],
    categories: ['ai-ml'],
    tools: [
      { name: 'sequentialthinking', description: 'Think through a problem step by step' },
    ],
    api_pricing: 'free',
    github_stars: 15000,
    health_status: 'active',
  },
  {
    slug: 'supabase',
    name: 'Supabase MCP Server',
    tagline: 'Manage Supabase projects — databases, auth, storage, and edge functions',
    github_url: 'https://github.com/supabase-community/supabase-mcp',
    npm_package: 'supabase-mcp',
    author_name: 'Supabase',
    author_github: 'supabase-community',
    author_type: 'official',
    transport: ['stdio'],
    categories: ['cloud', 'data', 'developer-tools'],
    tools: [
      { name: 'list_projects', description: 'List all Supabase projects' },
      { name: 'execute_sql', description: 'Execute SQL on a project database' },
      { name: 'apply_migration', description: 'Apply a database migration' },
      { name: 'list_tables', description: 'List tables in the database' },
    ],
    api_pricing: 'freemium',
    requires_api_key: true,
    github_stars: 1800,
    health_status: 'active',
  },
]

async function main() {
  console.log('Seeding database...')

  for (const server of servers) {
    const { error } = await supabase.from('servers').upsert(
      {
        ...server,
        source: 'import',
        verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slug' }
    )

    if (error) {
      console.error(`Error inserting ${server.slug}: ${error.message}`)
    } else {
      console.log(`Inserted: ${server.slug}`)
    }
  }

  console.log('Done!')
}

main().catch(console.error)
