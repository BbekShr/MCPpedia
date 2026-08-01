import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { categorize } from '@/bots/lib/categorize'

export const dynamic = 'force-dynamic'
// 60s is legal on every Vercel plan; a higher value fails the VERCEL build on Hobby —
// which a local `next build` cannot catch and which would block all deploys off main.
export const maxDuration = 60

// Rows are updated one serial round trip each, and every one of those UPDATEs also fires
// the `servers_audit` AFTER-UPDATE row trigger, which `to_jsonb`s the whole OLD and NEW
// row and loops 23 audited fields — `categories` is one of them, so the audit INSERT
// happens on every row here. The 60s budget also has to cover `auth.getUser()`, the
// `profiles` read and the row fetch. This cap is BUDGETED, NOT MEASURED — the endpoint
// has never run in production — so only raise it after a timed real run. Being
// conservative is nearly free: the run is idempotent (`categorize` never returns an empty
// array, so every processed row leaves the uncategorized predicate), so a smaller chunk
// just means the operator clicks again.
const MAX_PER_RUN = 500

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
        // One bounded read, no offset walk: ask for exactly one row MORE than the cap, so
        // the overflow row is what proves more remain rather than an inference from the
        // count. `categories` is text[], so the empty-array literal is `{}` — `[]` is
        // malformed and makes the whole filter fail. `.order('id')` on the unique PK makes
        // the slice deterministic.
        const { data: rows, error } = await admin
          .from('servers')
          .select('id, slug, name, tagline, description')
          .or('categories.is.null,categories.eq.{}')
          .order('id')
          .range(0, MAX_PER_RUN)

        if (error) {
          send({ type: 'error', message: `Failed to load uncategorized servers: ${error.message}` })
          controller.close()
          return
        }

        const servers = rows ?? []
        const capped = servers.length > MAX_PER_RUN
        if (capped) servers.length = MAX_PER_RUN

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
