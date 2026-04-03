import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const enrichments = [
  {
    slug: 'chrome-devtools-mcp',
    description: 'Chrome DevTools MCP server by Google. Gives AI assistants access to Chrome DevTools Protocol for debugging, profiling, and inspecting web pages. Connects to a running Chrome instance and exposes developer tools as MCP tools.',
    categories: ['developer-tools'],
    compatible_clients: ['claude-desktop', 'cursor', 'claude-code', 'windsurf'],
  },
  {
    slug: 'context7',
    description: 'Context7 provides up-to-date code documentation directly in your AI assistant. Instead of the AI relying on potentially outdated training data, Context7 fetches current documentation for libraries and frameworks in real-time.',
    categories: ['developer-tools', 'ai-ml'],
    compatible_clients: ['claude-desktop', 'cursor', 'claude-code', 'windsurf'],
  },
  {
    slug: 'github-mcp-server',
    description: 'Official GitHub MCP Server. Provides tools to interact with the GitHub API: manage repositories, issues, pull requests, branches, code search, and more. Built and maintained by GitHub. Requires Docker and a GitHub Personal Access Token.',
    categories: ['developer-tools'],
    compatible_clients: ['claude-desktop', 'cursor', 'claude-code', 'windsurf'],
  },
  {
    slug: 'gemini-cli',
    description: "Google's AI coding assistant for the terminal. Not an MCP server itself — it is an AI client that can connect TO MCP servers. Supports Gemini models with a 1M token context window.",
    categories: ['ai-ml', 'developer-tools'],
  },
  {
    slug: 'n8n',
    description: 'n8n is a workflow automation platform with 400+ integrations. While not primarily an MCP server, it supports MCP connections for AI agent workflows. Self-hostable, open source, and extensible.',
    categories: ['productivity', 'devops', 'cloud'],
  },
  {
    slug: 'awesome-mcp-servers',
    description: 'A curated community list of MCP servers. This is NOT an installable server — it is a directory of links to MCP server projects on GitHub.',
    categories: ['developer-tools'],
  },
  {
    slug: 'trendradar',
    description: 'TrendRadar aggregates trending topics and content across platforms. Provides tools for monitoring trends, analyzing content popularity, and tracking viral topics for research and marketing.',
    categories: ['analytics', 'data'],
  },
  {
    slug: 'scrapling',
    description: 'High-performance web scraping library for Python. Provides undetectable, adaptive web scraping with stealth features, automatic retry, and anti-bot bypass capabilities.',
    categories: ['data', 'developer-tools'],
  },
  {
    slug: 'ruflo',
    description: 'AI-powered code analysis and automation framework. Provides tools for code review, refactoring suggestions, and automated code improvements using LLM-driven analysis.',
    categories: ['developer-tools', 'ai-ml'],
  },
  {
    slug: 'ui-tars-desktop',
    description: 'UI-TARS Desktop by ByteDance. A desktop AI assistant that can see and interact with your screen. Uses vision models to understand UI elements and automate desktop tasks.',
    categories: ['ai-ml', 'productivity'],
  },
]

async function main() {
  for (const e of enrichments) {
    const { slug, ...data } = e
    const { error } = await s.from('servers').update(data).eq('slug', slug)
    console.log(slug + ': ' + (error ? 'ERROR ' + error.message : 'OK'))
  }
  console.log('\nDone!')
}

main()
