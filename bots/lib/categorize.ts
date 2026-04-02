/**
 * Auto-categorize MCP servers based on name, description, and README content.
 * Uses keyword matching — no AI needed.
 */

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'developer-tools': [
    'github', 'gitlab', 'bitbucket', 'git ', 'code', 'codegen', 'lint', 'debug',
    'compiler', 'ide', 'editor', 'vscode', 'jetbrains', 'terminal', 'shell',
    'docker', 'container', 'npm', 'package', 'build', 'test', 'ci/cd',
    'sdk', 'api client', 'swagger', 'openapi', 'graphql', 'grpc', 'rest api',
    'snippet', 'refactor', 'ast', 'parser', 'formatter', 'prettier',
    'sourcegraph', 'sentry', 'linear', 'jira', 'issue tracker',
    'puppeteer', 'playwright', 'selenium', 'browser automation', 'headless',
    'scraper', 'web scraping', 'crawl',
  ],
  'data': [
    'database', 'sql', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis',
    'elasticsearch', 'bigquery', 'snowflake', 'supabase', 'firebase',
    'data pipeline', 'etl', 'csv', 'json', 'parquet', 'arrow',
    'warehouse', 'dbt', 'airflow', 'kafka', 'rabbitmq', 'queue',
    'neon', 'planetscale', 'cockroach', 'dynamodb', 'fauna',
  ],
  'ai-ml': [
    'openai', 'anthropic', 'claude', 'gpt', 'llm', 'embedding',
    'vector', 'pinecone', 'weaviate', 'qdrant', 'chromadb', 'chroma',
    'langchain', 'llamaindex', 'hugging face', 'huggingface',
    'machine learning', 'deep learning', 'neural', 'model',
    'rag', 'retrieval', 'inference', 'tokenizer', 'transformer',
    'stable diffusion', 'image generation', 'text-to',
    'ollama', 'replicate', 'together ai',
  ],
  'cloud': [
    'aws', 'amazon', 'azure', 'gcp', 'google cloud',
    'cloudflare', 'vercel', 'netlify', 'heroku', 'railway', 'fly.io',
    'terraform', 'pulumi', 'kubernetes', 'k8s', 'helm',
    's3', 'ec2', 'lambda', 'serverless', 'cloud storage',
    'cdn', 'load balancer', 'dns',
  ],
  'productivity': [
    'slack', 'discord', 'teams', 'notion', 'obsidian', 'todoist',
    'calendar', 'email', 'gmail', 'outlook', 'schedule',
    'task', 'project management', 'asana', 'trello', 'monday',
    'note', 'bookmark', 'clipboard', 'reminder', 'time tracking',
    'spreadsheet', 'google sheets', 'excel', 'airtable',
    'zapier', 'ifttt', 'automation', 'workflow',
    'apple notes', 'bear', 'evernote', 'roam',
  ],
  'communication': [
    'chat', 'messaging', 'sms', 'twilio', 'sendgrid',
    'webhook', 'notification', 'push notification',
    'telegram', 'whatsapp', 'signal', 'matrix',
    'email send', 'mailer', 'smtp', 'imap',
  ],
  'finance': [
    'payment', 'stripe', 'paypal', 'invoice', 'billing',
    'crypto', 'bitcoin', 'ethereum', 'blockchain', 'web3',
    'stock', 'trading', 'exchange', 'market data', 'forex',
    'accounting', 'quickbooks', 'bank',
  ],
  'security': [
    'auth', 'oauth', 'jwt', 'saml', 'ldap', 'sso',
    'vulnerability', 'cve', 'security scan', 'pentest',
    'encryption', 'vault', 'secret', 'credential',
    'firewall', 'waf', 'ddos',
  ],
  'analytics': [
    'analytics', 'metrics', 'monitoring', 'observability',
    'logging', 'log ', 'datadog', 'grafana', 'prometheus',
    'mixpanel', 'amplitude', 'posthog', 'segment',
    'dashboard', 'visualization', 'chart', 'report',
    'google analytics', 'plausible',
  ],
  'design': [
    'figma', 'sketch', 'design', 'ui/ux', 'icon',
    'image', 'photo', 'svg', 'css', 'tailwind',
    'color', 'font', 'typography', 'layout',
    'screenshot', 'pdf', 'document',
  ],
  'devops': [
    'deploy', 'ci/cd', 'pipeline', 'jenkins', 'github actions',
    'monitoring', 'uptime', 'incident', 'pagerduty', 'opsgenie',
    'infrastructure', 'ansible', 'chef', 'puppet',
    'nginx', 'caddy', 'proxy', 'traefik',
    'log management', 'apm',
  ],
  'education': [
    'learn', 'tutorial', 'course', 'education', 'teaching',
    'documentation', 'wiki', 'knowledge base', 'faq',
    'quiz', 'flashcard', 'study',
  ],
  'entertainment': [
    'game', 'music', 'spotify', 'video', 'youtube', 'media',
    'movie', 'podcast', 'stream', 'twitch',
    'comic', 'meme',
  ],
  'health': [
    'health', 'medical', 'fitness', 'wellness',
    'patient', 'clinical', 'diagnosis',
    'fhir', 'hl7', 'dicom',
  ],
  'marketing': [
    'seo', 'marketing', 'social media', 'twitter', 'facebook',
    'instagram', 'linkedin', 'content marketing', 'campaign',
    'ad ', 'advertisement', 'mailchimp', 'hubspot',
    'crm', 'salesforce', 'marketing automation',
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
      // Count occurrences but cap per keyword to avoid one repeated term dominating
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

  // Take top category, plus any others with at least 40% of the top score
  const threshold = sorted[0][1] * 0.4
  const result = sorted
    .filter(([, s]) => s >= threshold)
    .slice(0, 3)
    .map(([cat]) => cat)

  return result
}
