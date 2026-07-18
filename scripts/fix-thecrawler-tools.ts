/**
 * Follow-up for #22: set TheCrawler's full 8-tool MCP surface.
 * The README-based extractor only caught 1 tool; the canonical 8-tool list is in
 * the repo's llms-install.md (verified 2026-07-18). Descriptions composed from repo docs.
 *
 * Run: npx tsx scripts/fix-thecrawler-tools.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const tools = [
  { name: 'crawl', description: 'Crawl one or more URLs and return extracted page data — visible text, metadata, links/images, JSON-LD/microdata and other structured data.' },
  { name: 'crawl_markdown', description: 'Crawl a URL and return clean, LLM-ready Markdown for the page content. Requires no LLM.' },
  { name: 'search_and_crawl', description: 'Run a web search and crawl the resulting pages, returning extracted content for each hit.' },
  { name: 'crawl_sitemap', description: "Discover URLs from a site's sitemap and crawl them." },
  { name: 'extract_structured', description: 'Extract structured data from a page using an OpenAI-compatible chat-completions endpoint.' },
  { name: 'list_extraction_contracts', description: 'List the available built-in extraction contracts (e.g. real-estate-listing).' },
  { name: 'diagnose_extraction_contract', description: 'Run no-LLM readiness diagnostics for an extraction contract against a target page.' },
  { name: 'extract_extraction_contract', description: 'Extract data for a given extraction contract from a page (requires an OpenAI-compatible LLM endpoint).' },
]

async function main() {
  const { data, error } = await s.from('servers')
    .update({ tools })
    .eq('slug', 'io-github-manchittlab-thecrawler')
    .select('slug, name')
  console.log(error ? `ERROR: ${error.message}` : data, `tools: ${tools.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
