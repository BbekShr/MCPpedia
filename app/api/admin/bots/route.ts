import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Bot definitions — what each bot does and its GitHub workflow.
// Schedules here are a manually-kept mirror of the cron in each
// .github/workflows/*.yml — they drift when a schedule is retuned there
// without updating this display copy, so cross-check against the workflow
// file's `cron:` line (not a prior version of this map) when editing.
const BOT_REGISTRY: Record<string, { name: string; description: string; workflow: string | null; schedule: string }> = {
  'sync-registry': {
    name: 'Sync Registry',
    description: 'Pulls servers from the official MCP Registry',
    workflow: 'sync-registry.yml',
    schedule: 'Daily 4am UTC',
  },
  'discover': {
    name: 'Discovery',
    description: 'Finds new MCP servers on GitHub',
    workflow: 'discover.yml',
    schedule: 'Mon+Thu 5am UTC',
  },
  'update-metadata': {
    name: 'Update Metadata',
    description: 'Refreshes GitHub stars, downloads, health status',
    workflow: 'update-metadata.yml',
    schedule: 'Daily 6am UTC',
  },
  'extract-install-info': {
    name: 'Extract Install Info',
    description: 'Parses READMEs for npm/pip packages and install configs',
    workflow: 'extract-install-info.yml',
    schedule: 'Mon+Thu 7am UTC',
  },
  'enrich-descriptions': {
    name: 'Enrich Descriptions',
    description: 'Fills in missing server descriptions from READMEs',
    workflow: 'enrich-descriptions.yml',
    schedule: 'Mon+Thu 7:30am UTC',
  },
  'extract-schemas': {
    name: 'Extract Schemas',
    description: 'Extracts MCP tools from READMEs using Claude Haiku',
    workflow: 'extract-schemas.yml',
    schedule: 'Daily 8am UTC',
  },
  'compute-scores': {
    name: 'Compute Scores',
    description: 'Computes security, efficiency, documentation, and compatibility scores',
    workflow: 'compute-scores.yml',
    schedule: 'Daily 8am UTC',
  },
  'snapshot-metrics': {
    name: 'Snapshot Metrics',
    description: 'Writes the nightly ecosystem aggregate snapshot powering /analytics',
    workflow: 'snapshot-metrics.yml',
    schedule: 'Daily 8:30am UTC',
  },
  'track-trending': {
    name: 'Track Trending',
    description: 'Updates the trending servers list from recent star/download velocity',
    workflow: 'track-trending.yml',
    schedule: 'Daily 9:30am UTC',
  },
  'generate-blog': {
    name: 'Generate Blog',
    description: 'Writes weekly roundup posts and same-day security advisory alerts',
    workflow: 'generate-blog.yml',
    schedule: 'Tue 9am UTC (+ daily 9:30am security check)',
  },
  'detect-duplicates': {
    name: 'Detect Duplicates',
    description: 'Finds and archives duplicate server entries',
    workflow: 'detect-duplicates.yml',
    schedule: 'Weekly Mon 9am UTC',
  },
  'generate-comparisons': {
    name: 'Generate Comparisons',
    description: 'Builds head-to-head server comparison pages',
    workflow: 'generate-comparisons.yml',
    schedule: 'Weekly Sun 9am UTC',
  },
  'check-broken-links': {
    name: 'Check Broken Links',
    description: 'Flags servers whose GitHub/npm links are dead',
    workflow: 'check-broken-links.yml',
    schedule: 'Weekly Sun 9am UTC',
  },
  'send-digest': {
    name: 'Send Digest',
    description: 'Emails the weekly digest to subscribed users',
    workflow: 'send-digest.yml',
    schedule: 'Weekly Tue 3pm UTC',
  },
}

export { BOT_REGISTRY }

// GET /api/admin/bots — fetch bot status + recent runs
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['maintainer', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const admin = createAdminClient('admin-bots-ui')

  // Get the latest run for each bot + last 20 runs total
  const { data: recentRuns } = await admin
    .from('bot_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50)

  // Build response: merge registry info with latest run data
  const bots = Object.entries(BOT_REGISTRY).map(([key, info]) => {
    const runs = (recentRuns || []).filter(r => r.bot_name === key)
    const lastRun = runs[0] || null
    return {
      id: key,
      ...info,
      lastRun: lastRun ? {
        id: lastRun.id,
        status: lastRun.status,
        startedAt: lastRun.started_at,
        finishedAt: lastRun.finished_at,
        durationMs: lastRun.duration_ms,
        serversProcessed: lastRun.servers_processed,
        serversUpdated: lastRun.servers_updated,
        errorMessage: lastRun.error_message,
        summary: lastRun.summary,
      } : null,
      recentRuns: runs.slice(0, 5).map(r => ({
        id: r.id,
        status: r.status,
        startedAt: r.started_at,
        durationMs: r.duration_ms,
        serversProcessed: r.servers_processed,
        serversUpdated: r.servers_updated,
      })),
    }
  })

  return NextResponse.json({ bots })
}

// POST /api/admin/bots — trigger a bot run via GitHub Actions
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['maintainer', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const botId = body.bot
  if (typeof botId !== 'string' || botId.length > 100) {
    return NextResponse.json({ error: 'Invalid bot parameter' }, { status: 400 })
  }

  const bot = BOT_REGISTRY[botId]
  if (!bot) {
    return NextResponse.json({ error: 'Unknown bot' }, { status: 400 })
  }

  if (!bot.workflow) {
    return NextResponse.json({ error: 'Bot has no GitHub workflow — run it manually' }, { status: 400 })
  }

  // Trigger GitHub Actions workflow_dispatch
  const ghToken = process.env.BOT_GITHUB_TOKEN || process.env.GITHUB_TOKEN
  if (!ghToken) {
    return NextResponse.json({ error: 'No GitHub token configured' }, { status: 500 })
  }

  const repo = process.env.GITHUB_REPOSITORY || 'bibekshrestha/mcppedia'
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${bot.workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  )

  if (!res.ok) {
    console.error(`GitHub API error triggering ${bot.name}: ${res.status}`)
    return NextResponse.json({ error: `Failed to trigger workflow (GitHub returned ${res.status})` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, message: `Triggered ${bot.name}` })
}
