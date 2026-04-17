import { createClient } from '@supabase/supabase-js'

/**
 * Creates a service-role Supabase client for bots and scripts.
 *
 * The `actorLabel` is sent as an `x-actor-label` request header on every call;
 * the server_changes audit trigger records it so we can trace field changes
 * back to the bot/script that made them. Required for accurate attribution.
 */
export function createAdminClient(actorLabel: string) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(url, key, {
    global: { headers: { 'x-actor-label': actorLabel } },
  })
}
