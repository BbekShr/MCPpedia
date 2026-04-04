import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { categorize } from '@/bots/lib/categorize'

export const dynamic = 'force-dynamic'

// SSE endpoint — streams progress as categorization runs
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['maintainer', 'admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const admin = createAdminClient()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Fetch all uncategorized servers (paginate)
        const servers: { id: string; slug: string; name: string; tagline: string | null }[] = []
        let page = 0
        const PAGE_SIZE = 1000
        while (true) {
          const { data: batch } = await admin
            .from('servers')
            .select('id, slug, name, tagline, description')
            .or('categories.is.null,categories.eq.[]')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

          if (!batch || batch.length === 0) break
          servers.push(...batch)
          if (batch.length < PAGE_SIZE) break
          page++
        }

        const total = servers.length
        send({ type: 'start', total })

        if (total === 0) {
          send({ type: 'done', total: 0, updated: 0, message: 'All servers already categorized' })
          controller.close()
          return
        }

        let updated = 0
        let processed = 0
        const BATCH_SIZE = 50

        for (let i = 0; i < servers.length; i += BATCH_SIZE) {
          const batch = servers.slice(i, i + BATCH_SIZE)
          const updates: { id: string; categories: string[] }[] = []

          for (const srv of batch) {
            const fullText = [srv.tagline, srv.description].filter(Boolean).join(' ')
            const cats = categorize(srv.name, fullText)
            updates.push({ id: srv.id, categories: cats })
          }

          // Batch update
          for (const u of updates) {
            const { error } = await admin
              .from('servers')
              .update({ categories: u.categories })
              .eq('id', u.id)
            if (!error) updated++
          }

          processed += batch.length
          send({
            type: 'progress',
            processed,
            total,
            updated,
            pct: Math.round((processed / total) * 100),
            sample: `${batch[0].slug} → ${updates[0].categories.join(', ')}`,
          })
        }

        send({ type: 'done', total, updated, message: `Categorized ${updated} servers` })
      } catch (err) {
        console.error('categorize error:', err)
        send({ type: 'error', message: 'Categorization failed' })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
