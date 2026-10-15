import type { SupabaseClient } from '@supabase/supabase-js'
import type { Edit } from './types'

// The definition of "pending" lives here because the admin moderation list and
// the sidebar badge count must share it (S73): an unfiltered 50-row window let
// auto-approved rows evict pending proposals while the badge counted them.
export const PENDING_EDIT_STATUS = 'pending' as const satisfies Edit['status']
export const EDIT_STATUS_FILTERS = ['pending', 'approved', 'rejected', 'all'] as const
export type EditStatusFilter = (typeof EDIT_STATUS_FILTERS)[number]

export const EDITS_SELECT = '*, profile:profiles(username), server:servers(name, slug)'

export function matchesEditFilter(status: string, filter: EditStatusFilter): boolean {
  return filter === 'all' || status === filter
}

export function buildEditsQuery(client: SupabaseClient, filter: EditStatusFilter, limit = 50) {
  let q = client.from('edits').select(EDITS_SELECT)
  if (filter !== 'all') q = q.eq('status', filter)
  return q.order('created_at', { ascending: false }).limit(limit)
}
