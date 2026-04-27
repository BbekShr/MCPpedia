/**
 * Auto-categorize MCP servers based on name, description, and README content.
 * Uses keyword matching — no AI needed.
 *
 * Design principles:
 * - Balance precision and recall — broad enough to catch real categories,
 *   specific enough to avoid nonsense matches
 * - "developer-tools" must NOT match just because a README has a GitHub link
 */

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'browser': [
    'puppeteer', 'playwright', 'selenium', 'browser automation', 'headless browser',
    'web scraping', 'web scraper', 'html scrape', 'page scrape', 'crawl',
    'chrome extension', 'chromium', 'dom manipulation', 'page navigation',
    'browser control', 'headless chrome', 'screenshot tool', 'webpage',
    'web content', 'html parsing', 'web page',
  ],

  'search': [
    'web search', 'search engine', 'serper', 'serpapi', 'google search', 'bing search',
    'duckduckgo', 'brave search', 'tavily', 'exa search', 'perplexity search',
    'full-text search', 'semantic search', 'search results', 'search api',
    'search tool', 'search service', 'web lookup', 'internet search',
  ],

  'developer-tools': [
    'code review', 'pull request', 'version control', 'git repository', 'git commit',
    'github actions', 'gitlab ci', 'bitbucket', 'sourcegraph', 'sentry',
    'linear issue', 'jira', 'issue tracker', 'bug tracker',
    'linter', 'lint ', 'debugger', 'breakpoint', 'stack trace',
    'compiler', 'transpiler', 'bundler', 'webpack', 'vite', 'esbuild',
    'ide plugin', 'vscode extension', 'jetbrains', 'editor plugin',
    'docker', 'container', 'dockerfile',
    'swagger', 'openapi spec', 'graphql schema', 'grpc ', 'protobuf',
    'ast parser', 'code formatter', 'prettier', 'eslint', 'refactor',
    'package manager', 'npm registry', 'pypi package',
    'test runner', 'unit test', 'coverage report',
    'sdk generator', 'api documentation',
    'repl ', 'code sandbox',
    // Broader dev signals
    'code generation', 'code analysis', 'source code', 'repository',
    'build tool', 'cli tool', 'command line', 'terminal',
    'intellij', 'xcode', 'android studio', 'visual studio',
    'type checking', 'typescript', 'code completion', 'intellisense',
    'api client', 'rest api', 'api gateway', 'api server',
    'code snippet', 'boilerplate', 'scaffold', 'starter template',
    'package.json', 'cargo.toml', 'go.mod',
    'test framework', 'testing tool', 'integration test', 'e2e test',
    'code quality', 'static analysis', 'code scan',
    'monorepo', 'workspace', 'turborepo',
  ],

  'data': [
    'database', 'sql query', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis',
    'elasticsearch', 'bigquery', 'snowflake', 'supabase', 'firebase',
    'data pipeline', 'etl ', 'csv ', 'parquet', 'arrow format',
    'data warehouse', 'dbt ', 'airflow', 'kafka', 'rabbitmq', 'message queue',
    'neon database', 'planetscale', 'cockroachdb', 'dynamodb', 'fauna',
    'vector database', 'pinecone', 'weaviate', 'qdrant', 'chromadb',
    'data schema', 'query builder', 'orm ',
    // Broader data signals
    'data source', 'data access', 'data management', 'data store',
    'spreadsheet', 'table data', 'structured data', 'json data',
    'data import', 'data export', 'data extraction', 'data transform',
    'couchdb', 'cassandra', 'mariadb', 'timescaledb', 'influxdb',
    'milvus', 'neo4j', 'graph database', 'dgraph', 'arangodb',
  ],

  'ai-ml': [
    'openai', 'anthropic claude', 'gpt-4', 'gpt-3', 'llm ', 'language model',
    'text embedding', 'vector embedding',
    'langchain', 'llamaindex', 'llama index', 'huggingface', 'hugging face',
    'machine learning', 'deep learning', 'neural network', 'model inference',
    'rag pipeline', 'retrieval augmented', 'fine-tuning', 'tokenizer',
    'stable diffusion', 'image generation', 'text-to-image', 'text-to-speech',
    'ollama', 'replicate', 'together ai', 'mistral', 'groq ',
    'prompt engineering', 'ai agent', 'ai workflow',
    // Broader AI signals
    'artificial intelligence', 'ai model', 'ai tool', 'ai service',
    'chatbot', 'conversational ai', 'nlp ', 'natural language',
    'sentiment analysis', 'text classification', 'named entity',
    'computer vision', 'object detection', 'image recognition',
    'speech recognition', 'voice ', 'transcription', 'whisper',
    'gemini', 'claude', 'cohere', 'perplexity', 'deepseek',
    'model context protocol', 'agent framework', 'multi-agent',
    'ai assistant', 'intelligent', 'reasoning', 'ai-powered',
    'inference', 'ai api', 'llama', 'phi-3',
  ],

  'cloud': [
    'aws ', 'amazon web services', 'azure ', 'microsoft azure', 'gcp ', 'google cloud',
    'cloudflare', 'vercel deploy', 'netlify', 'heroku', 'railway deploy', 'fly.io',
    'terraform', 'pulumi', 'kubernetes', 'k8s ', 'helm chart',
    's3 bucket', 'ec2 instance', 'aws lambda', 'serverless function', 'cloud storage',
    'cdn ', 'load balancer', 'cloud dns',
    'cloud run', 'app engine', 'cloud functions',
    // Broader cloud signals
    'oracle cloud', 'oci ', 'digital ocean', 'linode', 'vultr',
    'cloud platform', 'cloud service', 'cloud provider', 'saas ',
    'object storage', 'blob storage', 'cloud computing',
    'microservice', 'service mesh', 'istio',
  ],

  'devops': [
    'ci/cd', 'deployment pipeline', 'jenkins', 'github actions workflow',
    'infrastructure as code', 'ansible', 'chef recipe', 'puppet manifest',
    'nginx config', 'caddy', 'traefik', 'reverse proxy',
    'incident management', 'pagerduty', 'opsgenie', 'alerting',
    'log management', 'log aggregation', 'apm ', 'application performance',
    'uptime monitor', 'status page', 'health check',
    // Broader devops signals
    'deployment', 'deploy ', 'release management', 'rollback',
    'server management', 'server monitoring', 'infrastructure',
    'vagrant', 'container orchestration', 'docker compose',
    'site reliability', 'sre ', 'runbook',
  ],

  'productivity': [
    'slack ', 'discord bot', 'microsoft teams', 'notion ', 'obsidian ',
    'todoist', 'google calendar', 'scheduling', 'meeting',
    'task management', 'project management', 'asana', 'trello', 'monday.com',
    'note-taking', 'bookmark', 'clipboard', 'reminder', 'time tracking',
    'google sheets', 'excel ', 'airtable',
    'zapier', 'make.com', 'automation workflow',
    'apple notes', 'evernote', 'roam research',
    // Broader productivity signals
    'workflow automation', 'personal assistant', 'organizer',
    'to-do list', 'todo list', 'kanban', 'planner',
    'google workspace', 'office 365', 'microsoft office',
    'file management', 'file organiz', 'document management',
    'google drive', 'dropbox', 'onedrive',
    'calendar event', 'appointment', 'agenda',
  ],

  'communication': [
    'send email', 'email api', 'gmail api', 'outlook api', 'smtp server',
    'sms api', 'twilio', 'sendgrid', 'mailchimp email',
    'push notification', 'notification service',
    'telegram bot', 'whatsapp api',
    'chat api', 'messaging api', 'webhook handler',
    'matrix protocol',
    // Broader communication signals
    'email server', 'email client', 'inbox', 'mail ',
    'slack api', 'discord api', 'teams api',
    'real-time messaging', 'instant messaging', 'chat service',
    'voice call', 'video call', 'conference',
  ],

  'finance': [
    'payment', 'stripe api', 'paypal', 'invoice', 'billing',
    'cryptocurrency', 'bitcoin', 'ethereum', 'blockchain', 'web3 ',
    'stock price', 'trading', 'exchange rate', 'market data', 'forex',
    'accounting', 'quickbooks', 'bank account', 'banking api',
    'financial data', 'portfolio', 'defi ',
    // Broader finance signals
    'fintech', 'stock market', 'crypto ', 'wallet ',
    'transaction', 'ledger', 'revenue', 'expense',
    'tax ', 'financial report', 'investment',
    'stock exchange', 'nasdaq', 'fund data', 'bond ',
  ],

  'security': [
    'oauth ', 'jwt token', 'saml', 'ldap', 'sso ', 'single sign-on',
    'vulnerability scan', 'cve database', 'security scan', 'pentest',
    'encryption', 'hashicorp vault', 'secret management', 'credential',
    'firewall', 'waf ', 'intrusion detection', 'security audit',
    'access control', 'rbac',
    // Broader security signals
    'authentication', 'authorization', 'identity management',
    'password', 'token management', 'api key management',
    'threat detection', 'malware', 'phishing',
    'code scanning', 'pii detection', 'prompt injection defense',
    'security layer', 'guardianshield', 'cyber',
    'zero trust', 'mfa ', 'two-factor', '2fa ',
  ],

  'analytics': [
    'analytics platform', 'product analytics', 'user analytics',
    'metrics dashboard', 'observability',
    'logging service', 'datadog', 'grafana', 'prometheus',
    'mixpanel', 'amplitude', 'posthog', 'segment.io',
    'google analytics', 'plausible', 'fathom',
    'business intelligence', 'data visualization', 'report generation',
    // Broader analytics signals
    'tracking', 'insights', 'statistics', 'charting',
    'reporting tool', 'kpi ', 'metric', 'telemetry',
  ],

  'design': [
    'figma', 'sketch app', 'design system', 'ui component',
    'image editing', 'photo editing', 'svg ', 'css framework', 'tailwind',
    'color palette', 'typography', 'icon library',
    'pdf generation', 'document layout',
    'wireframe', 'prototype', 'design token',
    // Broader design signals
    'image processing', 'image convert', 'image resize',
    'pdf tool', 'pdf extract', 'pdf merge', 'document convert',
    'graphic design', 'illustration', 'canvas tool',
    'ui design', 'ux design', 'mockup',
    'font tool', 'logo design', 'banner design',
  ],

  'education': [
    'learning platform', 'online course', 'tutorial', 'coding challenge',
    'knowledge base', 'wiki', 'documentation site', 'faq',
    'flashcard', 'quiz', 'study tool',
    'language learning', 'e-learning',
    // Broader education signals
    'teaching', 'student', 'classroom', 'curriculum',
    'research paper', 'academic', 'arxiv', 'scholar',
    'training material', 'educational', 'lesson',
  ],

  'entertainment': [
    'spotify', 'music player', 'youtube api', 'video streaming', 'media player',
    'movie database', 'imdb', 'tmdb', 'podcast',
    'gaming', 'game server', 'steam api', 'twitch',
    'comic', 'meme generator',
    // Broader entertainment signals — kept specific to avoid matching analytics/marketing video tools
    'music streaming', 'audio player', 'roblox', 'minecraft',
    'anime', 'manga', 'recipe ', 'cooking', 'food recipe', 'restaurant menu',
  ],

  'health': [
    'health data', 'medical record', 'fitness tracker', 'wellness',
    'patient data', 'clinical', 'diagnosis',
    'fhir ', 'hl7 ', 'dicom',
    'drug information', 'symptom', 'telehealth',
    // Broader health signals
    'healthcare', 'medicine', 'pharmacy', 'hospital',
    'mental health', 'therapy', 'nutrition', 'workout',
    'fda ', 'biomedical', 'genomic',
    'ekyc', 'face detection', 'liveness',
  ],

  'marketing': [
    'seo tool', 'keyword research', 'social media post', 'content marketing',
    'twitter api', 'facebook api', 'instagram api', 'linkedin api',
    'ad campaign', 'google ads', 'facebook ads',
    'email marketing', 'hubspot', 'salesforce crm', 'crm system',
    'lead generation', 'marketing automation',
    // Broader marketing signals
    'social media', 'brand ', 'engagement', 'audience',
    'content strategy', 'influencer', 'campaign',
    'newsletter', 'outreach', 'conversion',
    'seo ', 'sem ', 'content calendar',
  ],

  'writing': [
    'writing assistant', 'content creation', 'copywriting', 'proofreading',
    'grammar check', 'spell check', 'text editor', 'rich text',
    'blog post', 'article generator', 'summarize text', 'translation',
    'document editor', 'word processor', 'markdown editor',
    'ghostwriting', 'paraphrase',
    // Broader writing signals
    'text generation', 'content writer', 'summariz', 'translat',
    'markdown', 'latex ', 'docx', 'word document',
    'note editor', 'publish content', 'content tool',
  ],

  'maps': [
    'google maps', 'mapbox', 'openstreetmap', 'geocoding', 'reverse geocode',
    'location search', 'nearby places', 'points of interest',
    'routing', 'directions', 'turn-by-turn',
    'latitude longitude', 'coordinates', 'geospatial',
    'address lookup', 'zip code', 'postal code',
    // Broader maps signals — deliberately narrow to avoid false positives
    'geographic information', 'gis data', 'gis tool', 'map service',
    'geolocation api', 'place search', 'distance matrix',
  ],

  'ecommerce': [
    'shopify', 'woocommerce', 'magento', 'bigcommerce',
    'product catalog', 'shopping cart', 'checkout',
    'inventory management', 'order management', 'fulfillment',
    'amazon seller', 'ebay api', 'marketplace',
    'price comparison', 'sku ',
    // Broader ecommerce signals
    'online store', 'e-commerce', 'retail', 'merchant',
    'product listing', 'shipping', 'warehouse',
  ],

  'legal': [
    'legal document', 'legal research', 'legal advice', 'law firm',
    'contract review', 'contract analysis', 'legislation', 'statute',
    'case law', 'court filing', 'court record',
    'gdpr compliance', 'terms of service', 'privacy policy',
    'patent search', 'trademark', 'intellectual property',
    // Broader legal signals — kept narrow to avoid matching devops/security "compliance"
    'regulatory compliance', 'legal regulation', 'compliance law',
    'legal database', 'legal api',
  ],
}

/**
 * Auto-categorize a server. Returns 1-3 best-fit categories.
 * Falls back to ['other'] if nothing matches.
 */
export function categorize(
  name: string,
  description?: string | null,
  readme?: string | null
): string[] {
  const text = [name, description || '', (readme || '').slice(0, 3000)]
    .join(' ')
    .toLowerCase()

  const scores: Record<string, number> = {}

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0
    for (const kw of keywords) {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const matches = text.match(regex)
      if (matches) {
        score += Math.min(matches.length, 3)
      }
    }
    if (score > 0) scores[category] = score
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])

  if (sorted.length === 0) return ['other']

  // Take top category, plus one more if it scores ≥50% of the top (max 2)
  const threshold = sorted[0][1] * 0.5
  const result = sorted
    .filter(([, s]) => s >= threshold)
    .slice(0, 2)
    .map(([cat]) => cat)

  return result
}

const FREEMIUM_PATTERNS = [
  'stripe', 'notion', 'github', 'linear ', 'slack ', 'openai', 'anthropic',
  'quickbooks', 'salesforce', 'hubspot', 'shopify', 'twilio', 'sendgrid',
  'datadog', 'pagerduty', 'cloudflare', 'vercel', 'aws ', 'google cloud',
  'azure ', 'dropbox', 'airtable', 'figma', 'monday.com', 'asana',
  'jira ', 'zoom ', 'spotify', 'todoist', 'perplexity', 'tavily',
  'runway', 'replicate', 'together ai',
]

const PAID_PATTERNS = [
  'x402', 'l402', 'lightning payment', 'per-call', 'pay-per-use',
  'usdc payment', 'bitcoin payment', 'micropayment',
]

// GitHub orgs known to publish official MCP servers under their own name
const OFFICIAL_ORGS = new Set([
  'anthropic', 'modelcontextprotocol', 'github', 'supabase', 'cloudflare',
  'stripe', 'google', 'jetbrains', 'xeroapi', 'ahrefs', 'freepik-company',
  'aws-samples', 'openai', 'solana-foundation', 'azure-samples', 'microsoft',
  'cdatasoftware', 'railwayapp', 'sassoftware', 'aqara', 'shopify', 'linear',
  'vercel', 'planetscale', 'resend', 'liveblocks', 'neon-tech', 'upstash',
  'turso-tech', 'datastax', 'elastic', 'mongodb', 'redis', 'hashicorp',
  'atlassian', 'notion-so', 'figma', 'asana', 'hubspot',
])

/**
 * Infer api_pricing from available signals. Returns 'free' | 'freemium' | 'paid' | 'unknown'.
 * Does NOT overwrite an existing curated value — callers must check before applying.
 */
export function inferPricing(
  requiresApiKey: boolean | null | undefined,
  name: string,
  description?: string | null,
): string {
  const text = [name, description || ''].join(' ').toLowerCase()

  if (PAID_PATTERNS.some(p => text.includes(p))) return 'paid'
  if (requiresApiKey === false) return 'free'
  if (FREEMIUM_PATTERNS.some(p => text.includes(p))) return 'freemium'
  return 'unknown'
}

/**
 * Default compatible clients for a newly-discovered server.
 * Always returns the standard trio; callers can narrow later via curated data.
 */
export function inferCompatibleClients(): string[] {
  return ['claude-desktop', 'cursor', 'claude-code']
}

/**
 * Infer author_type from GitHub org/user.
 * Returns 'official' when author_github is a known vendor org AND github_url
 * is under that same org. Returns 'community' when author info exists but isn't
 * a known vendor. Returns 'unknown' when no author info is available.
 */
export function inferAuthorType(
  authorGithub: string | null | undefined,
  githubUrl: string | null | undefined,
): string {
  if (!authorGithub) return 'unknown'
  const org = authorGithub.toLowerCase()
  if (!OFFICIAL_ORGS.has(org)) return 'community'
  // Confirm the repo actually lives under that org (guards against forks)
  if (githubUrl && !githubUrl.toLowerCase().includes(`/${org}/`)) return 'community'
  return 'official'
}
