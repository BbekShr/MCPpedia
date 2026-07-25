import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function m() {
  const r = await supabase.from('servers').select('id', { count: 'exact', head: true }).eq('is_archived', false)
  process.stdout.write('RESULT ' + JSON.stringify(r) + '\n')
  process.exit(0)
}
m()
