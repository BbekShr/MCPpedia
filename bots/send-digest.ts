/**
 * Weekly MCP Newsletter — a friend texting you a link, not a publication.
 * The blog post is the content. The email just sells the click.
 * Runs every Friday at 10am UTC via GitHub Actions.
 *
 * Usage:
 *   npx tsx bots/send-digest.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'

const supabase = createAdminClient()

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter(item => {
    const lower = item.name.toLowerCase()
    if (seen.has(lower)) return false
    seen.add(lower)
    return true
  })
}

// ---------- Data Gathering ----------

async function getNewServerCount(): Promise<number> {
  const { count } = await supabase
    .from('servers')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', daysAgo(7))
    .eq('is_archived', false)
  return count || 0
}

async function getNewCVECount(): Promise<number> {
  const { count } = await supabase
    .from('security_advisories')
    .select('id', { count: 'exact', head: true })
    .gte('published_at', daysAgo(7))
    .eq('status', 'open')
  return count || 0
}

async function getTopNewServer(): Promise<{ name: string; slug: string; score_total: number } | null> {
  const { data } = await supabase
    .from('servers')
    .select('name, slug, score_total')
    .gte('created_at', daysAgo(7))
    .eq('is_archived', false)
    .order('score_total', { ascending: false })
    .limit(5)
  const deduped = dedupeByName((data || []) as Array<{ name: string; slug: string; score_total: number }>)
  return deduped[0] || null
}

interface BlogPost {
  slug: string
  title: string
  description: string
  hook: string
  date: string
  category: string
  readingTime: number
}

function getLatestBlogPost(): BlogPost | null {
  const blogDir = path.join(process.cwd(), 'content', 'blog')
  if (!fs.existsSync(blogDir)) return null

  const posts = fs.readdirSync(blogDir)
    .filter(f => f.endsWith('.mdx'))
    .map(file => {
      const raw = fs.readFileSync(path.join(blogDir, file), 'utf-8')
      const { data, content } = matter(raw)
      const words = content.trim().split(/\s+/).length
      return {
        slug: file.replace(/\.mdx$/, ''),
        title: data.title || '',
        description: data.description || '',
        hook: data.hook || data.description || '',
        date: data.date || '',
        category: data.category || '',
        readingTime: Math.max(1, Math.round(words / 238)),
      }
    })
    .filter(p => p.title)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return posts[0] || null
}

async function getSubscribers(): Promise<Array<{ email: string; unsubscribe_token: string }>> {
  const { data } = await supabase
    .from('newsletter_subscribers')
    .select('email, unsubscribe_token')
  return data || []
}

// ---------- Email Template ----------

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildHtmlEmail(params: {
  blogPost: BlogPost | null
  newServerCount: number
  newCVECount: number
  topNewServer: { name: string; slug: string; score_total: number } | null
  unsubscribeToken: string
}): string {
  const { blogPost, newServerCount, newCVECount, topNewServer, unsubscribeToken } = params
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://mcppedia.org'

  // --- Main body: the pitch for the blog post ---
  let bodyHtml: string
  if (blogPost) {
    bodyHtml = `
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 16px;font-size:15px;color:#24292f;line-height:1.6;">
              ${escapeHtml(blogPost.hook)}
            </p>
            <p style="margin:0 0 20px;font-size:15px;color:#24292f;line-height:1.6;">
              We wrote up the ones that matter:
            </p>
            <p style="margin:0;">
              <a href="${siteUrl}/blog/${blogPost.slug}" style="display:inline-block;background:#24292f;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">Read the full breakdown &rarr;</a>
            </p>
            <p style="margin:8px 0 0;font-size:12px;color:#8b949e;">${blogPost.readingTime} min read</p>
          </td>
        </tr>`
  } else {
    bodyHtml = `
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0;font-size:15px;color:#24292f;line-height:1.6;">
              Quiet week on the blog. But the ecosystem keeps moving.
            </p>
          </td>
        </tr>`
  }

  // --- Quick hits: one tight line ---
  const hits: string[] = []
  if (newServerCount > 0) hits.push(`${newServerCount} new server${newServerCount !== 1 ? 's' : ''}`)
  hits.push(newCVECount > 0 ? `${newCVECount} new CVE${newCVECount !== 1 ? 's' : ''}` : '0 new CVEs')
  if (topNewServer) hits.push(`top score: <a href="${siteUrl}/s/${topNewServer.slug}" style="color:#0969da;text-decoration:none;">${escapeHtml(topNewServer.name)}</a> (${topNewServer.score_total})`)

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:24px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e1e4e8;border-radius:8px;overflow:hidden;max-width:520px;">

        <!-- Header -->
        <tr>
          <td style="padding:24px 32px 0;">
            <p style="margin:0;font-size:13px;color:#8b949e;">
              <a href="${siteUrl}" style="color:#24292f;font-weight:700;text-decoration:none;">MCPpedia</a>
              <span style="margin:0 6px;color:#d0d7de;">&middot;</span>
              <span>Weekly</span>
            </p>
          </td>
        </tr>

        <!-- Subject as headline -->
        ${blogPost ? `
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#24292f;line-height:1.3;">
              <a href="${siteUrl}/blog/${blogPost.slug}" style="color:#24292f;text-decoration:none;">${escapeHtml(blogPost.title)}</a>
            </p>
          </td>
        </tr>` : ''}

        ${bodyHtml}

        <!-- Divider -->
        <tr><td style="padding:24px 32px 0;"><hr style="border:none;border-top:1px solid #e1e4e8;margin:0;"></td></tr>

        <!-- Quick hits -->
        <tr>
          <td style="padding:12px 32px 0;">
            <p style="margin:0;font-size:13px;color:#57606a;line-height:1.5;font-style:italic;">
              Also this week: ${hits.join(' &middot; ')}
            </p>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:16px 32px 0;"><hr style="border:none;border-top:1px solid #e1e4e8;margin:0;"></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:12px 32px 20px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#8b949e;">
              <a href="${siteUrl}" style="color:#8b949e;text-decoration:none;">mcppedia.org</a>
              <span style="margin:0 8px;color:#d0d7de;">&middot;</span>
              <a href="${siteUrl}/api/newsletter/unsubscribe?token=${unsubscribeToken}" style="color:#8b949e;text-decoration:none;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ---------- Send via Resend ----------

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL || 'digest@mail.mcppedia.org'

  if (!apiKey) {
    console.log(`[send-digest] RESEND_API_KEY not set — skipping email to ${to}`)
    return false
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `MCPpedia <${fromEmail}>`,
      to,
      subject,
      html,
    }),
  })

  return res.ok
}

// ---------- Main ----------

async function main() {
  const botRun = await BotRun.start('send-digest')

  try {
    const [newServerCount, newCVECount, topNewServer, subscribers] = await Promise.all([
      getNewServerCount(),
      getNewCVECount(),
      getTopNewServer(),
      getSubscribers(),
    ])
    const blogPost = getLatestBlogPost()

    console.log(`[send-digest] ${subscribers.length} subscribers, ${newServerCount} new servers, ${newCVECount} CVEs, blog: ${blogPost ? blogPost.slug : 'none'}`)

    if (subscribers.length === 0) {
      await botRun.finish()
      return
    }

    // Subject = blog title, rewritten as curiosity hook
    const subject = blogPost
      ? blogPost.title
      : newCVECount > 0
        ? `${newCVECount} new CVE${newCVECount !== 1 ? 's' : ''} in the MCP ecosystem`
        : `${newServerCount} new MCP servers this week`

    let sent = 0
    let failed = 0

    for (const subscriber of subscribers) {
      const html = buildHtmlEmail({
        blogPost,
        newServerCount,
        newCVECount,
        topNewServer,
        unsubscribeToken: subscriber.unsubscribe_token,
      })

      const ok = await sendEmail(subscriber.email, subject, html)
      if (ok) sent++
      else failed++

      await new Promise(r => setTimeout(r, 100))
    }

    console.log(`[send-digest] Sent: ${sent}, Failed: ${failed}`)
    botRun.addProcessed(subscribers.length)
    botRun.addUpdated(sent)
    await botRun.finish()
  } catch (err) {
    await botRun.fail(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main()
