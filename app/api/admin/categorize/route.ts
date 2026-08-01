import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { categorize } from '@/bots/lib/categorize'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Rows are updated one serial round trip each, so the run duration scales with the row
// count. Cap the work per invocation well below `maxDuration`; the run is idempotent
// (`categorize` never returns an empty array, so every processed row leaves the
// uncategorized predicate) and the operator continues by clicking again.
const MAX_PER_RUN = 5000

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

  const admin = createAdminClient('admin-categorize')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Fetch all uncategorized servers (paginate)
        const servers: { id: string; slug: string; name: string; tagline: string | null; description: string | null }[] = []
        let page = 0
        let capped = false
        const PAGE_SIZE = 1000
        while (true) {
          // `categories` is text[], so the empty-array literal is `{}` — `[]` is malformed
          // and makes the whole filter fail. `.order('id')` on the unique PK gives the
          // offset walk a stable order within a snapshot; it does not make the walk exact,
          // because the predicate is mutable — a row categorized by another writer between
          // two page reads leaves the result set and shifts every later offset by one.
          // Rows missed that way are picked up on the next run.
          const { data: batch, error } = await admin
            .from('servers')
            .select('id, slug, name, tagline, description')
            .or('categories.is.null,categories.eq.{}')
            .order('id')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

          if (error) {
            send({ type: 'error', message: `Failed to load uncategorized servers: ${error.message}` })
            controller.close()
            return
          }

          if (!batch || batch.length === 0) break
          servers.push(...batch)
          if (batch.length < PAGE_SIZE) break
          if (servers.length >= MAX_PER_RUN) {
            servers.splice(MAX_PER_RUN)
            capped = true
            break
          }
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
        let failed = 0
        let firstFailure: string | null = null
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
            if (error) {
              failed++
              if (!firstFailure) {
                firstFailure = error.message
                console.error(`categorize: update failed for ${u.id}: ${error.message}`)
              }
            } else {
              updated++
            }
          }

          processed += batch.length
          send({
            type: 'progress',
            processed,
            total,
            updated,
            failed,
            pct: Math.round((processed / total) * 100),
            sample: `${batch[0].slug} → ${updates[0].categories.join(', ')}`,
          })
        }

        // Every write failing is a broken endpoint, not a completed run — say so on the
        // error channel rather than reporting "Categorized 0 servers" as a success.
        if (updated === 0 && failed > 0) {
          send({ type: 'error', message: `All ${failed} updates failed: ${firstFailure}` })
          controller.close()
          return
        }

        const parts = [`Categorized ${updated} of ${total} servers`]
        if (failed > 0) parts.push(`${failed} failed (first: ${firstFailure})`)
        if (capped) parts.push(`hit the ${MAX_PER_RUN}-row cap for this run — more remain, click again to continue`)
        send({ type: 'done', total, updated, failed, capped, message: parts.join('; ') })
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
