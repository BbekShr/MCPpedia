/**
 * Deterministic blog article templates.
 *
 * These render a finished article body from Supabase data alone — no model call,
 * no credential, nothing that can 401. The blog ran on the Claude Code action
 * (subscription-billed via CLAUDE_CODE_OAUTH_TOKEN) until that token started
 * returning `authentication_error: Invalid bearer token` on 2026-06-25; two
 * refreshes later it still did, and the blog had been dark for nine weeks. A
 * template path has no credential to expire, so the schedule cannot silently
 * stop producing posts again.
 *
 * Each renderer returns the SAME shape the model was prompted for — article body
 * followed by a ```json metadata block — so `buildArticleFromResponse` in
 * generate-blog.ts parses this output through the identical slug/frontmatter
 * path it used for generated prose. Nothing downstream knows the difference.
 *
 * Every sentence here is either fixed copy or a value read straight off a row.
 * Do not add a claim that isn't in the data — CLAUDE.md §4: blog claims are
 * fact-checked against the real codebase and Supabase, never asserted.
 */

// ---------- Row shapes (only the fields the templates actually read) ----------

export interface ServerRow {
  slug: string
  name?: string | null
  tagline?: string | null
  description?: string | null
  categories?: string[] | null
  github_stars?: number | null
  score_total?: number | null
  score_security?: number | null
  score_maintenance?: number | null
  score_documentation?: number | null
  score_efficiency?: number | null
  score_compatibility?: number | null
  tools?: unknown[] | null
  tool_count?: number | null
  resources?: unknown[] | null
  prompts?: unknown[] | null
  transport?: string[] | null
  npm_package?: string | null
  pip_package?: string | null
  github_url?: string | null
  cve_count?: number | null
  starGain?: number
}

export interface AdvisoryRow {
  id: string
  cve_id?: string | null
  severity?: string | null
  title?: string | null
  description?: string | null
  published_at?: string | null
  servers?: { slug?: string | null; name?: string | null } | { slug?: string | null; name?: string | null }[] | null
}

export interface EcosystemStats {
  totalServers: number
  newThisWeek: number
}

export interface RenderedArticle {
  title: string
  description: string
  hook: string
  body: string
}

// ---------- Text safety ----------

/**
 * MDX parses `{` as an expression and `<` as a JSX tag, so a server named
 * `foo<bar>` or a tagline containing `{query}` would break the page build at
 * request time — for a bot-written file nobody reviews before it ships. Escape
 * both, plus the markdown link brackets, in every value that comes from the DB.
 */
export function mdxText(value: unknown): string {
  return String(value ?? '')
    .replace(/[{}]/g, m => (m === '{' ? '&#123;' : '&#125;'))
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Same, for text used as a markdown link label, where `[` / `]` also break. */
function linkLabel(value: unknown): string {
  return mdxText(value).replace(/[[\]]/g, '')
}

/** Same, for a double-quoted JSX prop value. */
function propText(value: unknown): string {
  return mdxText(value).replace(/"/g, '&quot;')
}

/**
 * Flatten DB prose that is itself markdown into plain running text.
 *
 * Advisory descriptions arrive from OSV as full markdown documents — `###
 * Summary`, fenced code, the lot. Collapsing that to one line without stripping
 * the syntax leaves a `#` at the head of the line, which markdown then renders
 * as a page-level heading in the middle of the post, wrecking the outline. Strip
 * the block syntax before the whitespace collapse, not after.
 */
function flattenMarkdown(value: unknown): string {
  return String(value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')      // fenced code blocks
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')    // ATX headings
    .replace(/^\s{0,3}>\s?/gm, '')         // blockquote markers
    .replace(/^\s*[-*+]\s+/gm, '')         // list bullets
    // OSV bodies are section-labelled ("### Summary", "### Impact"). Once the
    // heading markers are gone those labels are bare words that read as noise
    // mid-sentence, so drop the ones that stood alone on their own line.
    .replace(/^\s*(summary|details|impact|overview|description|poc|background)\s*[:.]?\s*$/gim, '')
    .trim()
}

/** Trim a DB string to a sentence-ish length without cutting mid-word. */
function clamp(value: unknown, max: number): string {
  const text = mdxText(flattenMarkdown(value))
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:]$/, '')}…`
}

// ---------- Small formatters ----------

function displayName(s: ServerRow): string {
  if (s.name) return mdxText(s.name)
  return s.slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function serverLink(s: ServerRow): string {
  return `[${linkLabel(displayName(s))}](/s/${s.slug})`
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toolCount(s: ServerRow): number {
  if (Array.isArray(s.tools)) return s.tools.length
  return num(s.tool_count)
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

function grade(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

/** Join a list into readable prose: "a", "a and b", "a, b and c". */
function proseList(items: string[]): string {
  if (items.length <= 1) return items[0] || ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function categoryTitle(category: string): string {
  return category
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Pick one of several fixed phrasings, keyed off the data itself.
 *
 * These posts ship on a schedule, so an opener that is byte-identical every
 * week reads like a broken cron job rather than a column. The choice is a pure
 * function of the seed — same input, same post, so a re-run is idempotent.
 */
function variant<T>(options: T[], seed: number): T {
  return options[Math.abs(Math.trunc(seed)) % options.length]
}

/** Stable small integer derived from a string, for seeding `variant`. */
function seedFrom(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return h
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ---------- Shared fragments ----------

function serverCard(s: ServerRow): string {
  const props = [`slug="${s.slug}"`, `name="${propText(displayName(s))}"`]
  if (s.score_total != null) props.push(`score={${num(s.score_total)}}`)
  const tools = toolCount(s)
  if (tools > 0) props.push(`tools={${tools}}`)
  if (s.cve_count != null) props.push(`cves={${num(s.cve_count)}}`)
  const transport = (s.transport || [])[0]
  if (transport) props.push(`transport="${propText(transport)}"`)
  return `<ServerCardMini ${props.join(' ')} />`
}

/** One server, described entirely in numbers we hold. */
function serverSentence(s: ServerRow): string {
  const facts: string[] = []
  const tools = toolCount(s)
  if (tools > 0) facts.push(`exposes ${plural(tools, 'tool')}`)
  if (num(s.github_stars) > 0) facts.push(`carries ${plural(num(s.github_stars), 'GitHub star')}`)
  if (s.score_total != null) facts.push(`scores ${num(s.score_total)}/100 (grade ${grade(num(s.score_total))})`)
  if (!facts.length) return `${serverLink(s)} is newly catalogued.`
  return `${serverLink(s)} ${proseList(facts)}.`
}

const METHODOLOGY_NOTE =
  'Scores are the MCPpedia 0–100 rating — security, maintenance, efficiency, documentation and compatibility, weighted as described in the [scoring methodology](/methodology).'

function footer(): string {
  return [
    '---',
    '',
    `*Compiled automatically from the MCPpedia catalog on ${todayISO()}. ${METHODOLOGY_NOTE} Browse the full catalog at [mcppedia.org/servers](/servers), or compare any two servers side by side with the [comparison tool](/compare).*`,
  ].join('\n')
}

// ---------- Weekly roundup ----------

export function renderWeeklyRoundup(
  newServers: ServerRow[],
  trending: ServerRow[],
  stats: EcosystemStats,
): RenderedArticle | null {
  if (!newServers.length && !trending.length) return null

  const seed = seedFrom(todayISO())
  const topNew = newServers.slice(0, 5)
  const topTrending = trending.slice(0, 5)
  const lead = topTrending[0] || topNew[0]

  const opener = variant(
    [
      `The MCP catalog grew by ${plural(stats.newThisWeek, 'server')} this week.`,
      `${plural(stats.newThisWeek, 'new server')} landed in the MCP catalog this week.`,
      `This week added ${plural(stats.newThisWeek, 'server')} to the MCP catalog.`,
    ],
    seed,
  )

  const body: string[] = [
    `${opener} Here is what moved, ranked by the numbers rather than the announcements.`,
    '',
    '<StatGrid>',
    `  <Stat value="${stats.totalServers.toLocaleString('en-US')}" label="Servers Catalogued" detail="Active, non-archived" />`,
    `  <Stat value="${stats.newThisWeek.toLocaleString('en-US')}" label="Added This Week" detail="Last 7 days" />`,
    `  <Stat value="${trending.length.toLocaleString('en-US')}" label="Gaining Stars" detail="Trending right now" />`,
    '</StatGrid>',
    '',
  ]

  if (topNew.length) {
    body.push(
      '<SectionLabel>New This Week</SectionLabel>',
      '',
      `## ${topNew.length === 1 ? 'The new arrival' : `${topNew.length} new arrivals worth a look`}`,
      '',
      `Ordered by MCPpedia score — the highest-rated new entries first.`,
      '',
    )
    topNew.forEach((s, i) => {
      body.push(`### ${i + 1}. ${mdxText(displayName(s))}`, '')
      if (s.tagline) body.push(`${clamp(s.tagline, 200)}`, '')
      body.push(serverCard(s), '', serverSentence(s), '')
    })
  }

  if (topTrending.length) {
    body.push('<SectionLabel>Gaining Stars</SectionLabel>', '', '## What the ecosystem starred', '')
    const gainer = topTrending[0]
    if (num(gainer.starGain) > 0) {
      body.push(
        `${serverLink(gainer)} led the week with **${plural(num(gainer.starGain), 'new star')}**, reaching ${plural(num(gainer.github_stars), 'star')} total.`,
        '',
      )
    }
    body.push('| Server | Stars gained | Total stars | Score |', '| --- | ---: | ---: | ---: |')
    topTrending.forEach(s => {
      body.push(
        `| ${serverLink(s)} | ${num(s.starGain) > 0 ? `+${num(s.starGain).toLocaleString('en-US')}` : '—'} | ${num(s.github_stars).toLocaleString('en-US')} | ${s.score_total != null ? `${num(s.score_total)}/100` : '—'} |`,
      )
    })
    body.push('')
  }

  if (lead) {
    body.push(
      `<Callout type="tip">Every number above is read straight from the catalog the morning this post went out — star counts, tool counts and scores included. Check any of them on the server's own page.</Callout>`,
      '',
    )
  }

  body.push(footer())

  const leadName = lead ? displayName(lead) : 'the MCP ecosystem'
  return {
    title: `MCP Weekly: ${stats.newThisWeek.toLocaleString('en-US')} New Servers, ${clamp(leadName, 28)} Leads on Stars`.slice(0, 79),
    description: clamp(
      `${plural(stats.newThisWeek, 'new MCP server')} this week across a catalog of ${stats.totalServers.toLocaleString('en-US')}, with ${plural(trending.length, 'server')} gaining stars.`,
      158,
    ),
    hook: clamp(
      `${plural(stats.newThisWeek, 'new MCP server')} shipped this week. ${lead ? `${displayName(lead)} took the star lead.` : ''} The full ranked breakdown, straight from the catalog.`,
      220,
    ),
    body: body.join('\n'),
  }
}

// ---------- Server spotlight ----------

export function renderSpotlight(server: ServerRow): RenderedArticle | null {
  if (!server?.slug) return null

  const name = displayName(server)
  const total = num(server.score_total)
  const tools = toolCount(server)
  const seed = seedFrom(server.slug)

  const opener = variant(
    [
      `${serverLink(server)} scores ${total}/100 on MCPpedia — grade ${grade(total)}. Here is what is behind that number.`,
      `A grade ${grade(total)} at ${total}/100 puts ${serverLink(server)} above most of the catalog. The breakdown explains why.`,
      `${serverLink(server)} lands at ${total}/100. Worth unpacking which of the five scoring dimensions carried it.`,
    ],
    seed,
  )

  const body: string[] = [opener, '', serverCard(server), '']

  if (server.tagline) body.push(`> ${clamp(server.tagline, 220)}`, '')
  if (server.description) body.push(clamp(server.description, 600), '')

  body.push('<SectionLabel>Score Breakdown</SectionLabel>', '', '## Where the points come from', '')

  const rows: Array<[string, number | null | undefined, string]> = [
    ['Security', server.score_security, 'Advisories, authentication, and tool-poisoning checks.'],
    ['Maintenance', server.score_maintenance, 'Commit recency, release cadence, and issue handling.'],
    ['Efficiency', server.score_efficiency, 'Tool surface and runtime footprint.'],
    ['Documentation', server.score_documentation, 'README depth, install instructions, and examples.'],
    ['Compatibility', server.score_compatibility, 'Transports supported and clients known to work.'],
  ]
  const present = rows.filter(([, v]) => v != null)
  if (present.length) {
    body.push('<ScoreBreakdown>')
    present.forEach(([label, value, description]) => {
      body.push(`  <ScoreRow label="${label}" points="${num(value)}" description="${propText(description)}" />`)
    })
    body.push('</ScoreBreakdown>', '')

    const sorted = [...present].sort((a, b) => num(b[1]) - num(a[1]))
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    if (best && worst && best[0] !== worst[0]) {
      body.push(
        `**${best[0]}** is the strongest dimension at ${num(best[1])} points; **${worst[0]}** is the weakest at ${num(worst[1])}. ${METHODOLOGY_NOTE}`,
        '',
      )
    }
  }

  const capabilities: string[] = []
  if (tools > 0) capabilities.push(`**${plural(tools, 'tool')}**`)
  if (Array.isArray(server.resources) && server.resources.length) {
    capabilities.push(`**${plural(server.resources.length, 'resource')}**`)
  }
  if (Array.isArray(server.prompts) && server.prompts.length) {
    capabilities.push(`**${plural(server.prompts.length, 'prompt')}**`)
  }
  if (capabilities.length) {
    body.push('<SectionLabel>Capabilities</SectionLabel>', '', '## What it exposes', '')
    body.push(`${mdxText(name)} exposes ${proseList(capabilities)}.`, '')
  }

  const install: string[] = []
  if (server.npm_package) install.push(`npm as \`${mdxText(server.npm_package)}\``)
  if (server.pip_package) install.push(`PyPI as \`${mdxText(server.pip_package)}\``)
  if (install.length) {
    body.push(`It ships on ${proseList(install)}. The [server page](/s/${server.slug}) carries the ready-to-paste client config.`, '')
  }

  if (num(server.cve_count) > 0) {
    body.push(
      `<Callout type="warning">MCPpedia currently tracks ${plural(num(server.cve_count), 'open advisory', 'open advisories')} against this server. Read the security section on its [server page](/s/${server.slug}) before deploying it.</Callout>`,
      '',
    )
  }

  body.push(footer())

  return {
    title: clamp(`${name}: A ${total}/100 MCP Server, Scored Line by Line`, 79),
    description: clamp(
      `${name} scores ${total}/100 on MCPpedia${tools > 0 ? ` and exposes ${plural(tools, 'tool')}` : ''}. The full five-dimension breakdown.`,
      158,
    ),
    hook: clamp(
      `${name} scores ${total}/100 — grade ${grade(total)}${tools > 0 ? `, across ${plural(tools, 'tool')}` : ''}. Here is exactly where the points came from.`,
      220,
    ),
    body: body.join('\n'),
  }
}

// ---------- Trending ----------

export function renderTrending(trending: ServerRow[]): RenderedArticle | null {
  if (!trending.length) return null

  const top = trending.slice(0, 10)
  const lead = top[0]
  const totalGain = top.reduce((sum, s) => sum + num(s.starGain), 0)
  const seed = seedFrom(todayISO() + lead.slug)

  const opener = variant(
    [
      `${plural(top.length, 'MCP server')} gained stars this week, ${totalGain.toLocaleString('en-US')} between them.`,
      `Star movement across the MCP catalog this week: ${totalGain.toLocaleString('en-US')} added across ${plural(top.length, 'server')}.`,
      `${totalGain.toLocaleString('en-US')} new GitHub stars landed across ${plural(top.length, 'MCP server')} this week.`,
    ],
    seed,
  )

  const body: string[] = [
    `${opener} ${serverLink(lead)} took the largest share.`,
    '',
    '<StatGrid>',
    `  <Stat value="+${num(lead.starGain).toLocaleString('en-US')}" label="Top Gainer" detail="${propText(displayName(lead))}" />`,
    `  <Stat value="${totalGain.toLocaleString('en-US')}" label="Stars Added" detail="Across the leaderboard" />`,
    `  <Stat value="${top.length}" label="Servers Moving" detail="Tracked this week" />`,
    '</StatGrid>',
    '',
    '<SectionLabel>The Leaderboard</SectionLabel>',
    '',
    '## Ranked by stars gained',
    '',
    '| # | Server | Stars gained | Total | Score |',
    '| ---: | --- | ---: | ---: | ---: |',
  ]

  top.forEach((s, i) => {
    body.push(
      `| ${i + 1} | ${serverLink(s)} | +${num(s.starGain).toLocaleString('en-US')} | ${num(s.github_stars).toLocaleString('en-US')} | ${s.score_total != null ? `${num(s.score_total)}/100` : '—'} |`,
    )
  })
  body.push('')

  const scored = top.filter(s => s.score_total != null)
  if (scored.length >= 3) {
    const avg = Math.round(scored.reduce((sum, s) => sum + num(s.score_total), 0) / scored.length)
    body.push(
      `<Callout type="info">The servers climbing fastest average **${avg}/100** on MCPpedia. Stars measure attention, not quality — the score is the part that survives a security review.</Callout>`,
      '',
    )
  }

  body.push('<SectionLabel>Top Three, In Detail</SectionLabel>', '', '## What they actually do', '')
  top.slice(0, 3).forEach(s => {
    body.push(`### ${mdxText(displayName(s))}`, '')
    if (s.tagline) body.push(clamp(s.tagline, 200), '')
    body.push(serverCard(s), '', serverSentence(s), '')
  })

  body.push(footer())

  return {
    title: clamp(
      `Trending MCP Servers: ${displayName(lead)} Leads With +${num(lead.starGain).toLocaleString('en-US')} Stars`,
      79,
    ),
    description: clamp(
      `${plural(top.length, 'MCP server')} gained ${totalGain.toLocaleString('en-US')} GitHub stars this week. The ranked leaderboard with scores.`,
      158,
    ),
    hook: clamp(
      `${totalGain.toLocaleString('en-US')} stars across ${plural(top.length, 'MCP server')} this week — ${displayName(lead)} took +${num(lead.starGain)}. Attention and quality are not the same list.`,
      220,
    ),
    body: body.join('\n'),
  }
}

// ---------- Security alert ----------

function advisoryServer(a: AdvisoryRow): { slug?: string | null; name?: string | null } | null {
  if (!a.servers) return null
  return Array.isArray(a.servers) ? a.servers[0] || null : a.servers
}

export function renderSecurityAlert(alerts: AdvisoryRow[]): RenderedArticle | null {
  if (!alerts.length) return null

  const critical = alerts.filter(a => a.severity === 'critical')
  const high = alerts.filter(a => a.severity === 'high')
  const affected = new Set(
    alerts.map(a => advisoryServer(a)?.slug).filter((s): s is string => Boolean(s)),
  )

  const severityPhrase = critical.length
    ? `${plural(critical.length, 'critical advisory', 'critical advisories')}`
    : `${plural(high.length, 'high-severity advisory', 'high-severity advisories')}`

  const body: string[] = [
    `MCPpedia picked up ${severityPhrase} affecting ${plural(affected.size, 'catalogued MCP server')} in the last seven days. Details, and what to do about each, below.`,
    '',
    '<StatGrid>',
    `  <Stat value="${alerts.length}" label="New Advisories" detail="Last 7 days" />`,
    `  <Stat value="${critical.length}" label="Critical" detail="Highest severity" />`,
    `  <Stat value="${affected.size}" label="Servers Affected" detail="In the catalog" />`,
    '</StatGrid>',
    '',
    `<Callout type="warning">If you run any server listed here, treat this as an action item rather than a newsletter. Check the version you have deployed against the advisory before your next agent run.</Callout>`,
    '',
    '<SectionLabel>The Advisories</SectionLabel>',
    '',
  ]

  alerts.forEach((a, i) => {
    const server = advisoryServer(a)
    const label = a.cve_id ? mdxText(a.cve_id) : `Advisory ${i + 1}`
    body.push(`## ${label}${a.severity ? ` — ${mdxText(a.severity).toUpperCase()}` : ''}`, '')
    if (a.title) body.push(`**${clamp(a.title, 200)}**`, '')
    if (server?.slug) {
      body.push(
        `Affects ${serverLink({ slug: server.slug, name: server.name })}.`,
        '',
        serverCard({ slug: server.slug, name: server.name }),
        '',
      )
    }
    if (a.description) body.push(clamp(a.description, 700), '')
    if (a.published_at) body.push(`*Published ${mdxText(String(a.published_at).split('T')[0])}.*`, '')
    body.push('---', '')
  })

  body.push(
    '## What to do',
    '',
    '1. Check which of these servers your client config actually loads — an MCP server you installed once and forgot still runs with the permissions you gave it.',
    '2. Upgrade to a patched version where the advisory names one.',
    '3. Where no patch exists, remove the server from your config until one does.',
    '',
    `Each affected server's page on MCPpedia carries its full advisory list and current security score.`,
    '',
    footer(),
  )

  const leadServer = advisoryServer(alerts[0])
  const leadName = leadServer?.name || leadServer?.slug || 'MCP servers'
  return {
    title: clamp(
      `Security Alert: ${severityPhrase} affecting ${affected.size === 1 ? mdxText(leadName) : `${affected.size} MCP servers`}`,
      79,
    ),
    description: clamp(
      `${plural(alerts.length, 'new security advisory', 'new security advisories')} across ${plural(affected.size, 'MCP server')}, with severity and remediation for each.`,
      158,
    ),
    hook: clamp(
      `${severityPhrase} just landed against ${plural(affected.size, 'MCP server')} in the catalog. If one of them is in your client config, this is an action item.`,
      220,
    ),
    body: body.join('\n'),
  }
}

// ---------- Category deep dive ----------

export function renderCategoryDeepDive(category: string, servers: ServerRow[]): RenderedArticle | null {
  if (servers.length < 3) return null

  const title = categoryTitle(category)
  const top = servers.slice(0, 10)
  const winner = top[0]
  const scored = top.filter(s => s.score_total != null)
  const avg = scored.length
    ? Math.round(scored.reduce((sum, s) => sum + num(s.score_total), 0) / scored.length)
    : 0

  const body: string[] = [
    `MCPpedia catalogues ${plural(servers.length, 'server')} under **${title}**. Ranked by score, ${serverLink(winner)} leads at ${num(winner.score_total)}/100.`,
    '',
    '<StatGrid>',
    `  <Stat value="${servers.length}" label="Servers Ranked" detail="${propText(title)}" />`,
    `  <Stat value="${num(winner.score_total)}/100" label="Top Score" detail="${propText(displayName(winner))}" />`,
    `  <Stat value="${avg}/100" label="Category Average" detail="Across the top ${top.length}" />`,
    '</StatGrid>',
    '',
    '<SectionLabel>The Ranking</SectionLabel>',
    '',
    `## Every ${title} server, by score`,
    '',
    '| # | Server | Score | Tools | Stars |',
    '| ---: | --- | ---: | ---: | ---: |',
  ]

  top.forEach((s, i) => {
    body.push(
      `| ${i + 1} | ${serverLink(s)} | ${s.score_total != null ? `${num(s.score_total)}/100` : '—'} | ${toolCount(s) || '—'} | ${num(s.github_stars).toLocaleString('en-US')} |`,
    )
  })
  body.push('')

  body.push('<SectionLabel>The Top Three</SectionLabel>', '', '## Where each one earns its place', '')
  top.slice(0, 3).forEach((s, i) => {
    body.push(`### ${i + 1}. ${mdxText(displayName(s))}`, '')
    if (s.tagline) body.push(clamp(s.tagline, 200), '')
    body.push(serverCard(s), '', serverSentence(s), '')
    if (s.score_security != null) {
      body.push(`Security scores ${num(s.score_security)} of a possible 30 on the MCPpedia rating.`, '')
    }
  })

  body.push(
    `<Callout type="tip">Picking between two of these? The [comparison tool](/compare) puts any pair side by side across all five scoring dimensions.</Callout>`,
    '',
    footer(),
  )

  return {
    title: clamp(`The Best ${title} MCP Servers, Ranked by Score`, 79),
    description: clamp(
      `All ${servers.length} ${title} MCP servers ranked by the MCPpedia score. ${displayName(winner)} leads at ${num(winner.score_total)}/100.`,
      158,
    ),
    hook: clamp(
      `${plural(servers.length, title + ' MCP server')} ranked by security, maintenance and docs — not by stars. ${displayName(winner)} takes the top slot at ${num(winner.score_total)}/100.`,
      220,
    ),
    body: body.join('\n'),
  }
}

// ---------- Entry point ----------

/**
 * Render a planned article to the body-plus-```json shape that
 * `buildArticleFromResponse` expects. Returns null when the plan's data cannot
 * carry a post (too few servers, no alerts), which the caller treats the same
 * way it treated a model returning nothing.
 */
export function renderArticle(type: string, data: Record<string, unknown>): string | null {
  let article: RenderedArticle | null = null

  switch (type) {
    case 'weekly-roundup':
      article = renderWeeklyRoundup(
        (data.newServers as ServerRow[]) || [],
        (data.trending as ServerRow[]) || [],
        (data.stats as EcosystemStats) || { totalServers: 0, newThisWeek: 0 },
      )
      break
    case 'server-spotlight':
      article = renderSpotlight(data.server as ServerRow)
      break
    case 'trending':
      article = renderTrending((data.trending as ServerRow[]) || [])
      break
    case 'security-alert':
      article = renderSecurityAlert((data.alerts as AdvisoryRow[]) || [])
      break
    case 'category-deep-dive':
      article = renderCategoryDeepDive(data.category as string, (data.servers as ServerRow[]) || [])
      break
    default:
      return null
  }

  if (!article) return null

  const meta = JSON.stringify({
    title: article.title,
    description: article.description,
    hook: article.hook,
  })

  return `${article.body}\n\n\`\`\`json\n${meta}\n\`\`\`\n`
}
