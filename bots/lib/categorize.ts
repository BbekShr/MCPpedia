/**
 * Auto-categorize MCP servers based on name, description, and README content.
 * Uses keyword matching — no AI needed.
 *
 * Design principles:
 * - Keywords must be specific enough to not fire on nearly every server
 * - "developer-tools" must NOT match just because a README has a GitHub link
 * - Prefer false negatives (→ other) over false positives (wrong category)
 */

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // Browser automation — split out from developer-tools
  'browser': [
    'puppeteer', 'playwright', 'selenium', 'browser automation', 'headless browser',
    'web scraping', 'web scraper', 'html scrape', 'page scrape', 'crawl',
    'chrome extension', 'chromium', 'dom manipulation', 'page navigation',
    'browser control',
  ],

  // Search — servers that are primarily search wrappers
  'search': [
    'web search', 'search engine', 'serper', 'serpapi', 'google search', 'bing search',
    'duckduckgo', 'brave search', 'tavily', 'exa search', 'perplexity search',
    'full-text search', 'semantic search', 'search results', 'search api',
  ],

  // Developer tools — specific to dev workflow, not just "has github link"
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
  ],

  'data': [
    'database', 'sql query', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis',
    'elasticsearch', 'bigquery', 'snowflake', 'supabase', 'firebase',
    'data pipeline', 'etl ', 'csv ', 'parquet', 'arrow format',
    'data warehouse', 'dbt ', 'airflow', 'kafka', 'rabbitmq', 'message queue',
    'neon database', 'planetscale', 'cockroachdb', 'dynamodb', 'fauna',
    'vector database', 'pinecone', 'weaviate', 'qdrant', 'chromadb',
    'data schema', 'query builder', 'orm ',
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
  ],

  'cloud': [
    'aws ', 'amazon web services', 'azure ', 'microsoft azure', 'gcp ', 'google cloud',
    'cloudflare', 'vercel deploy', 'netlify', 'heroku', 'railway deploy', 'fly.io',
    'terraform', 'pulumi', 'kubernetes', 'k8s ', 'helm chart',
    's3 bucket', 'ec2 instance', 'aws lambda', 'serverless function', 'cloud storage',
    'cdn ', 'load balancer', 'cloud dns',
    'cloud run', 'app engine', 'cloud functions',
  ],

  'devops': [
    'ci/cd', 'deployment pipeline', 'jenkins', 'github actions workflow',
    'infrastructure as code', 'ansible', 'chef recipe', 'puppet manifest',
    'nginx config', 'caddy', 'traefik', 'reverse proxy',
    'incident management', 'pagerduty', 'opsgenie', 'alerting',
    'log management', 'log aggregation', 'apm ', 'application performance',
    'uptime monitor', 'status page', 'health check',
  ],

  'productivity': [
    'slack ', 'discord bot', 'microsoft teams', 'notion ', 'obsidian ',
    'todoist', 'google calendar', 'scheduling', 'meeting',
    'task management', 'project management', 'asana', 'trello', 'monday.com',
    'note-taking', 'bookmark', 'clipboard', 'reminder', 'time tracking',
    'google sheets', 'excel ', 'airtable',
    'zapier', 'make.com', 'automation workflow',
    'apple notes', 'evernote', 'roam research',
  ],

  'communication': [
    'send email', 'email api', 'gmail api', 'outlook api', 'smtp server',
    'sms api', 'twilio', 'sendgrid', 'mailchimp email',
    'push notification', 'notification service',
    'telegram bot', 'whatsapp api',
    'chat api', 'messaging api', 'webhook handler',
    'matrix protocol',
  ],

  'finance': [
    'payment', 'stripe api', 'paypal', 'invoice', 'billing',
    'cryptocurrency', 'bitcoin', 'ethereum', 'blockchain', 'web3 ',
    'stock price', 'trading', 'exchange rate', 'market data', 'forex',
    'accounting', 'quickbooks', 'bank account', 'banking api',
    'financial data', 'portfolio', 'defi ',
  ],

  'security': [
    'oauth ', 'jwt token', 'saml', 'ldap', 'sso ', 'single sign-on',
    'vulnerability scan', 'cve database', 'security scan', 'pentest',
    'encryption', 'hashicorp vault', 'secret management', 'credential',
    'firewall', 'waf ', 'intrusion detection', 'security audit',
    'access control', 'rbac',
  ],

  'analytics': [
    'analytics platform', 'product analytics', 'user analytics',
    'metrics dashboard', 'observability',
    'logging service', 'datadog', 'grafana', 'prometheus',
    'mixpanel', 'amplitude', 'posthog', 'segment.io',
    'google analytics', 'plausible', 'fathom',
    'business intelligence', 'data visualization', 'report generation',
  ],

  'design': [
    'figma', 'sketch app', 'design system', 'ui component',
    'image editing', 'photo editing', 'svg ', 'css framework', 'tailwind',
    'color palette', 'typography', 'icon library',
    'screenshot', 'pdf generation', 'document layout',
    'wireframe', 'prototype', 'design token',
  ],

  'education': [
    'learning platform', 'online course', 'tutorial', 'coding challenge',
    'knowledge base', 'wiki', 'documentation site', 'faq',
    'flashcard', 'quiz', 'study tool',
    'language learning', 'e-learning',
  ],

  'entertainment': [
    'spotify', 'music player', 'youtube ', 'video streaming', 'media player',
    'movie database', 'imdb', 'tmdb', 'podcast',
    'gaming', 'game server', 'steam api', 'twitch',
    'comic', 'meme generator',
  ],

  'health': [
    'health data', 'medical record', 'fitness tracker', 'wellness',
    'patient data', 'clinical', 'diagnosis',
    'fhir ', 'hl7 ', 'dicom',
    'drug information', 'symptom', 'telehealth',
  ],

  'marketing': [
    'seo tool', 'keyword research', 'social media post', 'content marketing',
    'twitter api', 'facebook api', 'instagram api', 'linkedin api',
    'ad campaign', 'google ads', 'facebook ads',
    'email marketing', 'hubspot', 'salesforce crm', 'crm system',
    'lead generation', 'marketing automation',
  ],

  'writing': [
    'writing assistant', 'content creation', 'copywriting', 'proofreading',
    'grammar check', 'spell check', 'text editor', 'rich text',
    'blog post', 'article generator', 'summarize text', 'translation',
    'document editor', 'word processor', 'markdown editor',
    'ghostwriting', 'paraphrase',
  ],

  'maps': [
    'google maps', 'mapbox', 'openstreetmap', 'geocoding', 'reverse geocode',
    'location search', 'nearby places', 'points of interest',
    'routing', 'directions', 'navigation',
    'latitude longitude', 'coordinates', 'geospatial',
    'address lookup', 'zip code', 'postal code',
  ],

  'ecommerce': [
    'shopify', 'woocommerce', 'magento', 'bigcommerce',
    'product catalog', 'shopping cart', 'checkout',
    'inventory management', 'order management', 'fulfillment',
    'amazon seller', 'ebay api', 'marketplace',
    'price comparison', 'sku ',
  ],

  'legal': [
    'legal document', 'contract', 'legislation', 'statute',
    'legal research', 'case law', 'court filing',
    'compliance', 'gdpr', 'terms of service', 'privacy policy',
    'patent', 'trademark', 'intellectual property',
    'law firm', 'legal advice',
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

  // Take top category, plus any others with at least 50% of the top score
  const threshold = sorted[0][1] * 0.5
  const result = sorted
    .filter(([, s]) => s >= threshold)
    .slice(0, 3)
    .map(([cat]) => cat)

  return result
}
