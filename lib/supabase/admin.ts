import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client for server-side admin routes.
 *
 * `actorLabel` is sent as the `x-actor-label` HTTP header on every request.
 * The server_changes audit trigger stores it so we can trace writes back to
 * their origin (e.g. 'admin-categorize', 'admin-archive'). Required.
 */
export function createAdminClient(actorLabel: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: { headers: { 'x-actor-label': actorLabel } },
    }
  )
}
