import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CATEGORIES } from '@/lib/constants'
import { rateLimitUser } from '@/lib/rate-limit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Sign in to suggest categories' }, { status: 401 })

  const rl = await rateLimitUser(user.id, 'categories', 10, 3600_000) // 10 per hour
  if (!rl.allowed) return Response.json({ error: 'Rate limited' }, { status: 429 })

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.categories)) {
    return Response.json({ error: 'categories must be an array' }, { status: 400 })
  }

  const submitted = body.categories as string[]
  const valid = submitted.filter(c => (CATEGORIES as readonly string[]).includes(c) && c !== 'other')

  if (valid.length === 0) {
    return Response.json({ error: 'No valid categories provided' }, { status: 400 })
  }
  if (valid.length > 3) {
    return Response.json({ error: 'Maximum 3 categories' }, { status: 400 })
  }

  const admin = createAdminClient('user-set-categories')

  const { data: server, error } = await admin
    .from('servers')
    .update({ categories: valid })
    .eq('slug', slug)
    .select('slug, categories')
    .single()

  if (error || !server) {
    return Response.json({ error: 'Server not found' }, { status: 404 })
  }

  return Response.json({ categories: server.categories })
}
