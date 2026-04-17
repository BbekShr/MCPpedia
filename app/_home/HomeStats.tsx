import { createPublicClient } from '@/lib/supabase/public'

interface HomeStatsData {
  total_servers: number
  with_cves: number
  official_count: number
  open_cves: number
}

export async function getHomeStats(): Promise<HomeStatsData> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('home_stats')
  if (error || !data) {
    // Don't break the page — return zeros and log. Stats are non-critical.
    console.error('home_stats rpc failed:', error?.message)
    return { total_servers: 0, with_cves: 0, official_count: 0, open_cves: 0 }
  }
  return data as HomeStatsData
}

export default async function HomeStats() {
  const stats = await getHomeStats()

  return (
    <section className="border-b border-border bg-bg-secondary">
      <div className="max-w-[1200px] mx-auto px-4 py-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">{stats.total_servers.toLocaleString()}</div>
            <div className="text-xs text-text-muted">Servers tracked and counting</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">{stats.official_count}</div>
            <div className="text-xs text-text-muted">Official servers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red">{stats.open_cves}</div>
            <div className="text-xs text-text-muted">Open CVEs across {stats.with_cves} servers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green">Daily</div>
            <div className="text-xs text-text-muted">Security scans</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function HomeStatsSkeleton() {
  return (
    <section className="border-b border-border bg-bg-secondary">
      <div className="max-w-[1200px] mx-auto px-4 py-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-busy="true" aria-label="Loading stats">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="text-center">
              <div className="h-8 w-20 mx-auto rounded bg-bg-tertiary animate-pulse mb-1" />
              <div className="h-3 w-32 mx-auto rounded bg-bg-tertiary animate-pulse opacity-50" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
