// Server display names are derived from a package or repo name by replacing
// hyphens with spaces and title-casing every word (bots/discover.ts). That turns
// `mcp-hn` into "Mcp Hn" and `mcp-server-sql-analyzer` into "Mcp Server Sql
// Analyzer" — which is what every <title>, <h1> and OG image on those pages
// says. It reads as broken to a human and it costs the exact-match keyword: a
// searcher looking for "MCP HN" is not looking for "Mcp Hn".
//
// This restores the casing of terms that have one. It is deliberately
// conservative: a token is only rewritten when the WHOLE token matches a known
// term, so `Mcp Api Forge` becomes "MCP API Forge" while a real word that merely
// contains an acronym is untouched.

// Lowercased token -> canonical spelling. Not every entry is an acronym; several
// are just names with fixed casing that title-casing gets wrong.
const CANONICAL_TERMS: Record<string, string> = {
  // Protocol / project terms
  mcp: 'MCP',
  llm: 'LLM',
  llms: 'LLMs',
  ai: 'AI',
  ml: 'ML',
  rag: 'RAG',
  ocr: 'OCR',
  tts: 'TTS',
  iot: 'IoT',
  // Services and platforms
  hn: 'HN',
  aws: 'AWS',
  gcp: 'GCP',
  s3: 'S3',
  k8s: 'K8s',
  github: 'GitHub',
  gitlab: 'GitLab',
  npm: 'npm',
  pypi: 'PyPI',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  graphql: 'GraphQL',
  // Interfaces and formats
  api: 'API',
  apis: 'APIs',
  cli: 'CLI',
  sdk: 'SDK',
  ide: 'IDE',
  ui: 'UI',
  ux: 'UX',
  rest: 'REST',
  rpc: 'RPC',
  grpc: 'gRPC',
  rss: 'RSS',
  sql: 'SQL',
  db: 'DB',
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  csv: 'CSV',
  pdf: 'PDF',
  svg: 'SVG',
  png: 'PNG',
  // Transport and security
  http: 'HTTP',
  https: 'HTTPS',
  url: 'URL',
  dns: 'DNS',
  ssh: 'SSH',
  tls: 'TLS',
  ssl: 'SSL',
  oauth: 'OAuth',
  jwt: 'JWT',
  // Infrastructure
  vm: 'VM',
  cpu: 'CPU',
  gpu: 'GPU',
  ci: 'CI',
  cd: 'CD',
}

// Leading/trailing punctuation is kept so `(api)` and `api,` survive intact.
const TOKEN = /^(\W*)([\w+.#]*?)(\W*)$/

function normalizeToken(token: string): string {
  const match = TOKEN.exec(token)
  if (!match) return token
  const [, lead, core, trail] = match
  const canonical = CANONICAL_TERMS[core.toLowerCase()]
  return canonical ? `${lead}${canonical}${trail}` : token
}

export function normalizeServerName(name: string | null | undefined): string {
  if (!name) return ''
  // Registry-style identifiers (`io.github.owner/repo`) have no spaces and are
  // not display names — tokenizing them would be meaningless, and no token can
  // match a canonical term anyway, so they fall through unchanged.
  return name.split(/(\s+)/).map(part => (/\s/.test(part) ? part : normalizeToken(part))).join('')
}

// Slug or package name -> display name, in one step, for the bots that write
// `servers.name`. Keeps the existing hyphen-to-space title-casing and then
// fixes the casing of known terms.
export function humanizeServerName(raw: string): string {
  const titled = raw
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
  return normalizeServerName(titled)
}
