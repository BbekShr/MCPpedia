import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
async function main() {
  const { count: total } = await supabase.from('servers').select('id', { count: 'exact', head: true }).eq('is_archived', false)
  const { count: new7 } = await supabase.from('servers').select('id', { count: 'exact', head: true }).gte('created_at', daysAgo(7)).eq('is_archived', false)
  process.stdout.write('STATS ' + JSON.stringify({ total, new7 }) + '\n')
  const { data: newServers } = await supabase.from('servers').select('slug, name, tagline, categories, github_stars, score_total, created_at, tools, npm_package').gte('created_at', daysAgo(8)).eq('is_archived', false).order('score_total', { ascending: false }).limit(25)
  process.stdout.write('NEW ' + JSON.stringify(newServers) + '\n')
  const { data: top } = await supabase.from('servers').select('slug, name, tagline, github_stars, score_total, score_security, score_maintenance, score_documentation, score_efficiency, score_compatibility, categories, npm_downloads_weekly, tools').eq('is_archived', false).order('score_total', { ascending: false }).limit(15)
  process.stdout.write('TOP ' + JSON.stringify(top) + '\n')
  const { data: adv } = await supabase.from('security_advisories').select('cve_id, severity, title, published_at, servers(slug, name)').gte('published_at', daysAgo(10)).order('published_at', { ascending: false }).limit(20)
  process.stdout.write('ADV ' + JSON.stringify(adv) + '\n')
  const { data: dl } = await supabase.from('servers').select('slug, name, github_stars, npm_downloads_weekly, score_total').eq('is_archived', false).not('npm_downloads_weekly', 'is', null).order('npm_downloads_weekly', { ascending: false }).limit(12)
  process.stdout.write('DL ' + JSON.stringify(dl) + '\n')
  const { data: trendRaw } = await supabase.from('servers').select('slug, name, tagline, github_stars, tags, score_total, categories').eq('is_archived', false).not('tags', 'is', null).order('github_stars', { ascending: false }).limit(600)
  const trending = (trendRaw || []).filter((s: any) => s.tags?.some((t: string) => t.startsWith('trending:'))).map((s: any) => ({ slug: s.slug, name: s.name, tagline: s.tagline, stars: s.github_stars, score: s.score_total, cats: s.categories, gain: parseInt(s.tags.find((t: string) => t.startsWith('trending:')).split(':')[1], 10) })).sort((a: any, b: any) => b.gain - a.gain).slice(0, 12)
  process.stdout.write('TRENDING ' + JSON.stringify(trending) + '\n')
  process.exit(0)
}
main()
