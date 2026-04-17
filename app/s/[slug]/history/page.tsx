import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import Link from 'next/link'
import type { Edit } from '@/lib/types'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return {
    title: `Edit History - ${slug}`,
    robots: { index: false, follow: false },
  }
}

export default async function EditHistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = createPublicClient()

  const { data: server } = await supabase
    .from('servers')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()

  if (!server) notFound()

  const { data: edits } = await supabase
    .from('edits')
    .select('*, profile:profiles(id, username, avatar_url)')
    .eq('server_id', server.id)
    .order('created_at', { ascending: false })

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow text-white',
    approved: 'bg-green text-white',
    rejected: 'bg-red text-white',
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
        <Link href={`/s/${slug}`} className="text-accent hover:text-accent-hover">{server.name}</Link>
        <span>/</span>
        <span>Edit History</span>
      </div>

      <h1 className="text-2xl font-semibold text-text-primary mb-6">Edit History</h1>

      {edits && edits.length > 0 ? (
        <div className="space-y-4">
          {(edits as Edit[]).map(edit => (
            <div key={edit.id} className="border border-border rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    @{edit.profile?.username || 'anonymous'}
                  </span>
                  <span className="text-xs text-text-muted">
                    {new Date(edit.created_at).toLocaleDateString()}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${statusColors[edit.status] || ''}`}>
                  {edit.status}
                </span>
              </div>

              <div className="text-sm mb-2">
                <span className="text-text-muted">Field:</span>{' '}
                <code className="font-mono text-text-primary">{edit.field_name}</code>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                <div>
                  <span className="text-text-muted block mb-1">Old value:</span>
                  <div className="px-2 py-1 bg-red/5 border border-border rounded text-text-primary text-xs font-mono truncate">
                    {JSON.stringify(edit.old_value)}
                  </div>
                </div>
                <div>
                  <span className="text-text-muted block mb-1">New value:</span>
                  <div className="px-2 py-1 bg-green/5 border border-border rounded text-text-primary text-xs font-mono truncate">
                    {JSON.stringify(edit.new_value)}
                  </div>
                </div>
              </div>

              {edit.edit_reason && (
                <p className="text-xs text-text-muted italic">&ldquo;{edit.edit_reason}&rdquo;</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-text-muted text-sm">No edits have been proposed for this server.</p>
      )}
    </div>
  )
}
