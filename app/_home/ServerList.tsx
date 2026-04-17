import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import { PUBLIC_CARD_FIELDS } from '@/lib/constants'
import ServerCard from '@/components/ServerCard'
import type { Server } from '@/lib/types'

interface SectionProps {
  title: string
  subtitle: string
  viewAllHref: string
  viewAllLabel?: string
  gridCols?: string
}

interface ListProps extends SectionProps {
  servers: Server[]
}

function Section({ title, subtitle, viewAllHref, viewAllLabel, children }: SectionProps & { children: React.ReactNode }) {
  return (
    <section className="border-t border-border">
      <div className="max-w-[1200px] mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <p className="text-xs text-text-muted">{subtitle}</p>
          </div>
          <Link href={viewAllHref} className="text-sm text-accent hover:text-accent-hover">
            {viewAllLabel || 'View all'} &rarr;
          </Link>
        </div>
        {children}
      </div>
    </section>
  )
}

function ServerGrid({ servers, cols = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' }: { servers: Server[]; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-4`}>
      {servers.map(server => (
        <ServerCard key={server.id} server={server} />
      ))}
    </div>
  )
}

export function SectionSkeleton({ title, subtitle, viewAllHref, viewAllLabel, count = 6, gridCols }: SectionProps & { count?: number }) {
  return (
    <Section title={title} subtitle={subtitle} viewAllHref={viewAllHref} viewAllLabel={viewAllLabel}>
      <div className={`grid ${gridCols || 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'} gap-4`} aria-busy="true">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="border border-border rounded-md p-4 bg-bg">
            <div className="flex items-start gap-2.5 mb-2">
              <div className="w-7 h-7 rounded bg-bg-tertiary animate-pulse" />
              <div className="flex-1 h-5 rounded bg-bg-tertiary animate-pulse" />
            </div>
            <div className="h-4 rounded bg-bg-tertiary animate-pulse mb-2 w-3/4 opacity-70" />
            <div className="h-3 rounded bg-bg-tertiary animate-pulse w-1/2 opacity-50" />
          </div>
        ))}
      </div>
    </Section>
  )
}

function ServerSection({ title, subtitle, viewAllHref, viewAllLabel, servers, gridCols }: ListProps) {
  if (servers.length === 0) return null
  return (
    <Section title={title} subtitle={subtitle} viewAllHref={viewAllHref} viewAllLabel={viewAllLabel}>
      <ServerGrid servers={servers} cols={gridCols} />
    </Section>
  )
}

// --- Data fetchers ---

export async function TopScoredSection() {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('servers')
    .select(PUBLIC_CARD_FIELDS)
    .eq('is_archived', false)
    .neq('author_type', 'official')
    .gt('score_total', 0)
    .order('score_total', { ascending: false })
    .limit(6)
  return (
    <ServerSection
      title="Highest rated"
      subtitle="Servers with the best MCPpedia scores"
      viewAllHref="/servers?sort=score"
      servers={(data as Server[]) || []}
    />
  )
}

export async function OfficialSection() {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('servers')
    .select(PUBLIC_CARD_FIELDS)
    .eq('author_type', 'official')
    .eq('is_archived', false)
    .order('score_total', { ascending: false })
    .limit(6)
  return (
    <ServerSection
      title="Official servers"
      subtitle="Built by the companies behind the services"
      viewAllHref="/servers?author=official"
      servers={(data as Server[]) || []}
    />
  )
}

export async function CVESection({ withCVEsCount }: { withCVEsCount: number }) {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('servers')
    .select(PUBLIC_CARD_FIELDS)
    .gt('cve_count', 0)
    .eq('is_archived', false)
    .order('cve_count', { ascending: false })
    .limit(6)
  return (
    <ServerSection
      title="Servers with known CVEs"
      subtitle={`${withCVEsCount} servers have vulnerabilities — check before you install`}
      viewAllHref="/security"
      viewAllLabel="All advisories"
      servers={(data as Server[]) || []}
    />
  )
}

export async function RecentSection() {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('servers')
    .select(PUBLIC_CARD_FIELDS)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(4)
  return (
    <ServerSection
      title="Just added"
      subtitle="New servers discovered by our bots"
      viewAllHref="/servers?sort=newest"
      servers={(data as Server[]) || []}
      gridCols="grid-cols-1 md:grid-cols-2"
    />
  )
}
