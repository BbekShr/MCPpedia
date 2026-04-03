import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Bot definitions — what each bot does and its GitHub workflow
const BOT_REGISTRY: Record<string, { name: string; description: string; workflow: string | null; schedule: string }> = {
  'sync-registry': {
    name: 'Sync Registry',
    description: 'Pulls servers from the official MCP Registry',
    workflow: 'sync-registry.yml',
    schedule: 'Daily 1am UTC',
  },
  'discover': {
    name: 'Discovery',
    description: 'Finds new MCP servers on GitHub',
    workflow: 'discover.yml',
    schedule: 'Daily 2am UTC',
  },
  'update-metadata': {
    name: 'Update Metadata',
    description: 'Refreshes GitHub stars, downloads, health status',
    workflow: 'update-metadata.yml',
    schedule: 'Daily 3am UTC',
  },
  'extract-schemas': {
    name: 'Extract Schemas',
    description: 'Extracts MCP tools from READMEs using Claude Haiku',
    workflow: 'extract-schemas.yml',
    schedule: 'Daily 4am UTC',
  },
  'compute-scores': {
    name: 'Compute Scores',
    description: 'Computes security, efficiency, documentation, and compatibility scores',
    workflow: 'compute-scores.yml',
    schedule: 'Daily 5am UTC',
  },
  'extract-install-info': {
    name: 'Extract Install Info',
    description: 'Parses READMEs for npm/pip packages and install configs',
    workflow: null,
    schedule: 'Manual only',
  },
  'detect-changelogs': {
    name: 'Detect Changelogs',
    description: 'Detects new versions from GitHub releases',
    workflow: null,
    schedule: 'Manual only',
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

  const admin = createAdminClient()

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

  const body = await request.json()
  const botId = body.bot as string

  const bot = BOT_REGISTRY[botId]
  if (!bot) {
    return NextResponse.json({ error: `Unknown bot: ${botId}` }, { status: 400 })
  }

  if (!bot.workflow) {
    return NextResponse.json({ error: `Bot "${botId}" has no GitHub workflow — run it manually` }, { status: 400 })
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
    const text = await res.text()
    return NextResponse.json({ error: `GitHub API error: ${res.status} ${text}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, message: `Triggered ${bot.name}` })
}
