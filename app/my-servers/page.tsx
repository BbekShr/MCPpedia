import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ServerCard from '@/components/ServerCard'
import ExportConfigButton from '@/components/ExportConfigButton'
import { PUBLIC_SERVER_FIELDS } from '@/lib/constants'
import type { Server } from '@/lib/types'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'My Servers',
  description: 'Your saved MCP servers — manage your favorites and export configs.',
}

export default async function MyServersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirect=/my-servers')
  }

  // Fetch user's favorites with full server data
  const { data: favorites } = await supabase
    .from('favorites')
    .select('server_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const serverIds = (favorites || []).map((f: { server_id: string }) => f.server_id)

  let servers: Server[] = []
  if (serverIds.length > 0) {
    const { data } = await supabase
      .from('servers')
      .select(PUBLIC_SERVER_FIELDS)
      .in('id', serverIds)
    // Preserve favorites order
    const serverMap = new Map((data as Server[] || []).map(s => [s.id, s]))
    servers = serverIds.map((id: string) => serverMap.get(id)).filter(Boolean) as Server[]
  }

  // Build combined config for export
  const combinedConfig: Record<string, unknown> = {}
  for (const server of servers) {
    const configs = server.install_configs as Record<string, unknown> | null
    if (configs?.['claude-desktop']) {
      const cd = configs['claude-desktop'] as Record<string, unknown>
      const mcpServers = cd.mcpServers as Record<string, unknown> | undefined
      if (mcpServers) {
        Object.assign(combinedConfig, mcpServers)
      }
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">My Servers</h1>
          <p className="text-text-muted text-sm">
            {servers.length === 0
              ? 'Save servers to build your personal MCP stack.'
              : `${servers.length} saved server${servers.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        {Object.keys(combinedConfig).length > 0 && (
          <ExportConfigButton config={combinedConfig} count={servers.length} />
        )}
      </div>

      {servers.length > 0 ? (
        <div className="space-y-3">
          {servers.map(server => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border border-border rounded-lg bg-bg-secondary">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" className="mx-auto mb-4 opacity-40" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <p className="text-text-muted mb-4">No saved servers yet.</p>
          <p className="text-sm text-text-muted mb-6">Click the heart icon on any server card to save it here.</p>
          <Link
            href="/servers"
            className="inline-block px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Browse servers &rarr;
          </Link>
        </div>
      )}
    </div>
  )
}
