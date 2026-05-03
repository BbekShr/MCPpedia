import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client for server-side admin routes.
 *
 * `actorLabel` is sent as the `x-actor-label` HTTP header on every request.
 * The server_changes audit trigger stores it so we can trace writes back to
 * their origin (e.g. 'admin-categorize', 'admin-archive'). Required.
 *
 * `originalActorId` (optional) is sent as `x-original-actor-id` and tells the
 * audit trigger to credit the audit row to that user instead of the calling
 * session. Used by the approve-edit route so an approved proposal's audit
 * entry shows the proposer, not the moderator who clicked Approve.
 */
export function createAdminClient(actorLabel: string, originalActorId?: string) {
  const headers: Record<string, string> = { 'x-actor-label': actorLabel }
  if (originalActorId) headers['x-original-actor-id'] = originalActorId
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: { headers },
    }
  )
}
