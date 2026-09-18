import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { submitServerSchema } from '@/lib/validators'
import { fetchRepoMetadata, fetchReadme } from '@/lib/github'
import { rateLimitUser } from '@/lib/rate-limit'
import {
  scanSecurity,
  measureTokenEfficiency,
  scoreDocumentation,
  scoreCompatibility,
  scoreMaintenance,
} from '@/lib/scoring'
import { deriveDangerousPatternCount, deriveInjectionRisk } from '@/lib/security-columns'
import { mergeScoresOnOsvFailure } from '@/lib/score-merge'
import { reconcileAdvisories } from '@/lib/advisories'
import { revalidateServer, revalidateProfile } from '@/lib/revalidate'
import { normalizeGithubUrl, normalizePackageName } from '@/lib/normalize'
import { isMonorepoUrl } from '@/lib/duplicate-groups'
import type { Tool } from '@/lib/types'

// Widest candidate window we scan for duplicates. A read that comes back full
// can't prove the submission is unique, so the route fails closed rather than
// silently inserting a duplicate — see the scan comment below.
const CANDIDATE_LIMIT = 200

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimitUser(user.id, 'submit', 5, 3600_000) // 5 per hour
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = submitServerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data
  const slug = data.name
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  if (!slug) {
    return NextResponse.json({ error: 'Name must contain at least one letter or number' }, { status: 400 })
  }

  const normalizedGithubUrl = normalizeGithubUrl(data.github_url)
  const normalizedNpm = normalizePackageName(data.npm_package)
  const normalizedPip = normalizePackageName(data.pip_package)

  // Check for duplicate slug
  const { data: existingBySlug } = await supabase
    .from('servers')
    .select('slug, name, is_archived')
    .eq('slug', slug)
    .maybeSingle()

  if (existingBySlug) {
    // An archived entry still holds the slug, so a legit resubmission collides.
    // Say so explicitly instead of the generic "already exists" — otherwise the
    // submitter has no idea the blocking row is archived and unreachable, and
    // can't tell it apart from an active listing they could edit/claim. (#27)
    const archived = existingBySlug.is_archived
    return NextResponse.json({
      error: 'duplicate_slug',
      message: archived
        ? 'An archived listing with this name already exists. Ask a maintainer to reactivate it (or open a GitHub issue), or resubmit under a slightly different name.'
        : 'A server with this name already exists.',
      existing: {
        slug: existingBySlug.slug,
        name: existingBySlug.name,
        url: `/s/${existingBySlug.slug}`,
        archived,
      },
    }, { status: 409 })
  }

  // Check for duplicate GitHub URL or package (normalized). Older rows may not
  // yet be normalized in-place, so we filter the candidate set in JS rather
  // than an exact `.eq()`.
  // Archived rows are in scope too: a resubmission of a previously-listed
  // server has to be told the row exists-but-is-archived, not silently allowed
  // to create a second listing for the same repository.
  // The URL clause is a SUBSTRING match, so the window also holds rows that
  // merely contain the fragment and never normalize-equal — the JS filter below
  // is what decides. There is deliberately NO `ORDER BY`: none of these columns
  // is indexed, so sorting would forfeit `LIMIT`'s early scan exit on
  // user-controlled input, and any sort key would systematically starve one
  // partition of the window (ordering live-first evicts exactly the archived
  // rows this check exists to find). Because the window is therefore arbitrary,
  // a failed or saturated read fails CLOSED instead of inserting.
  // Sanitize values going into the .or() string to prevent PostgREST filter injection.
  const orFilters: string[] = []
  if (normalizedGithubUrl) {
    const rawFragment = normalizedGithubUrl.replace(/^https:\/\//, '')
    const safeFragment = rawFragment.replace(/[,()]/g, '')
    orFilters.push(`github_url.ilike.%${safeFragment}%`)
  }
  if (normalizedNpm) {
    const safeNpm = normalizedNpm.replace(/[,()]/g, '')
    orFilters.push(`npm_package.ilike.${safeNpm}`)
  }
  if (normalizedPip) {
    const safePip = normalizedPip.replace(/[,()]/g, '')
    orFilters.push(`pip_package.ilike.${safePip}`)
  }

  if (orFilters.length > 0) {
    type CandidateRow = {
      slug: string
      name: string
      github_url: string | null
      npm_package: string | null
      pip_package: string | null
      is_archived: boolean | null
    }

    const { data: candidates, error: candidatesError } = await supabase
      .from('servers')
      .select('slug, name, github_url, npm_package, pip_package, is_archived')
      .or(orFilters.join(','))
      .limit(CANDIDATE_LIMIT)

    if (candidatesError) {
      console.error('submit duplicate scan failed; refusing submission:', candidatesError.code, candidatesError.message, orFilters.join(','), user.id)
      return NextResponse.json({
        error: 'duplicate_check_unavailable',
        message: 'Could not verify this submission is not a duplicate. Please try again shortly.',
      }, { status: 503 })
    }

    const rows = (candidates as unknown as CandidateRow[]) || []
    const matchOf = (c: CandidateRow) => ({
      url: normalizedGithubUrl !== null && normalizeGithubUrl(c.github_url) === normalizedGithubUrl,
      pkg:
        (normalizedNpm !== null && normalizePackageName(c.npm_package) === normalizedNpm) ||
        (normalizedPip !== null && normalizePackageName(c.pip_package) === normalizedPip),
    })

    const conflict = rows.filter(c => !c.is_archived).find(c => {
      const m = matchOf(c)
      return m.url || m.pkg
    })

    if (conflict) {
      return NextResponse.json({
        error: 'duplicate',
        message: 'This server is already on MCPpedia. Edit or claim the existing entry instead.',
        existing: {
          slug: conflict.slug,
          name: conflict.name,
          url: `/s/${conflict.slug}`,
        },
      }, { status: 409 })
    }

    const archivedConflict = rows
      .filter(c => c.is_archived)
      .find(c => {
        const m = matchOf(c)
        if (!m.url && !m.pkg) return false
        // A monorepo holds many distinct servers, so an archived row sharing only
        // its URL is not this submission's prior listing. A package match is
        // identity, so it still blocks.
        if (m.url && !m.pkg && normalizedGithubUrl !== null && isMonorepoUrl(normalizedGithubUrl)) return false
        return true
      })

    if (archivedConflict) {
      return NextResponse.json({
        error: 'duplicate_archived',
        message: 'This server was previously listed on MCPpedia and is now archived, so it no longer appears in the catalog. Ask a maintainer to reactivate it (or open a GitHub issue) rather than resubmitting — a resubmission would create a second listing for the same repository.',
        existing: {
          slug: archivedConflict.slug,
          name: archivedConflict.name,
          url: `/s/${archivedConflict.slug}`,
          archived: true,
        },
      }, { status: 409 })
    }

    // No conflict found — but if the window came back full, the absence of a
    // match proves nothing. Only refuse when a match could have identified a
    // duplicate. For the known monorepo roots in MONOREPO_URLS, a URL-only
    // submission is exempt: those URLs are shared by many distinct servers and
    // would saturate on every attempt, so we accept a possible missed LIVE
    // duplicate (the live branch, unlike the archived one, has no monorepo
    // carve-out) rather than permanently blocking every monorepo submission.
    // That miss needs >= CANDIDATE_LIMIT substring-only matches AND the exact
    // duplicate row to be the one truncated away.
    // `>=` rather than `===`: `===` assumes the server never returns more rows
    // than we asked for, and would silently stop detecting saturation if a
    // server-side row cap were ever set below CANDIDATE_LIMIT.
    const saturated = rows.length >= CANDIDATE_LIMIT
    const urlCanIdentify = normalizedGithubUrl !== null && !isMonorepoUrl(normalizedGithubUrl)
    if (saturated && (urlCanIdentify || normalizedNpm !== null || normalizedPip !== null)) {
      console.error('submit duplicate scan saturated at', CANDIDATE_LIMIT, 'candidates; refusing submission:', orFilters.join(','), user.id)
      return NextResponse.json({
        // Saturation is a property of the catalog, not of transient load: the
        // same submission saturates on every retry, so we must not promise one.
        error: 'duplicate_check_unavailable',
        message: 'Too many similar entries to check this submission against automatically. Please open a GitHub issue so a maintainer can add it manually — retrying will not help.',
      }, { status: 503 })
    }
  }

  // Enrich from GitHub
  let meta = null
  if (normalizedGithubUrl) {
    meta = await fetchRepoMetadata(normalizedGithubUrl)
  }

  const { data: server, error } = await supabase
    .from('servers')
    .insert({
      slug,
      name: data.name,
      tagline: data.tagline || meta?.description || null,
      github_url: normalizedGithubUrl,
      npm_package: normalizedNpm,
      pip_package: normalizedPip,
      license: data.license || meta?.license || null,
      author_name: data.author_name || meta?.owner || null,
      author_github: data.author_github || meta?.owner || null,
      author_type: 'community',
      transport: data.transport,
      categories: data.categories,
      api_pricing: data.api_pricing,
      requires_api_key: data.requires_api_key,
      github_stars: meta?.stars || 0,
      github_last_commit: meta?.lastCommit || null,
      github_open_issues: meta?.openIssues || 0,
      is_archived: meta?.archived || false,
      homepage_url: meta?.homepage || null,
      health_status: meta?.lastCommit ? 'unknown' : 'unknown',
      source: 'manual',
      submitted_by: user.id,
      verified: false,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      // Race with the pre-submit dedup check — DB index caught it.
      return NextResponse.json({
        error: 'duplicate',
        message: 'This server is already on MCPpedia.',
      }, { status: 409 })
    }
    console.error('submit insert error:', error.message)
    return NextResponse.json({ error: 'Failed to submit server' }, { status: 500 })
  }

  // Compute scores immediately so the server isn't listed without a score
  try {
    const admin = createAdminClient('submit-post-score')
    const tools = (server.tools || []) as Tool[]

    const security = await scanSecurity(
      server.npm_package,
      server.pip_package,
      server.has_authentication || false,
      server.license,
      server.is_archived || false,
      server.security_verified || false,
      tools,
      server.tool_definition_hash || null
    )

    const efficiency = measureTokenEfficiency(tools)

    let readme: string | null = null
    if (server.github_url) {
      readme = await fetchReadme(server.github_url)
    }

    const docs = await scoreDocumentation(
      readme,
      server.description,
      server.tagline,
      tools,
      server.install_configs || {},
      server.api_name,
      server.github_url,
      server.homepage_url
    )

    const compat = scoreCompatibility(
      server.transport || [],
      server.compatible_clients || [],
      tools
    )

    const maint = scoreMaintenance(
      server.github_last_commit,
      server.github_stars || 0,
      server.npm_weekly_downloads || 0,
      server.github_open_issues || 0,
      server.is_archived || false,
      server.verified || false
    )

    // OSV scan failed — skip CVE-derived columns rather than record an inflated
    // "no CVEs found" result from a transient API outage. A just-inserted row
    // has no prior successful scan, so the fresh (CVE-blind) component stands.
    const merged = mergeScoresOnOsvFailure(server, {
      scan_status: security.scan_status,
      security_score: security.score,
      other_score_total: efficiency.score + docs.score + compat.score + maint.score,
    })

    await admin
      .from('servers')
      .update({
        score_total: merged.score_total,
        score_security: merged.score_security,
        score_maintenance: maint.score,
        score_documentation: docs.score,
        score_compatibility: compat.score,
        score_efficiency: efficiency.score,
        score_computed_at: new Date().toISOString(),
        has_authentication: security.has_authentication,
        // Every column derived from `security.evidence` moves together with the
        // evidence array itself — writing fresh flags beside a stale evidence
        // list makes the row self-contradictory where ScorePanel renders both.
        ...(merged.osv_failed ? {} : {
          cve_count: security.cve_count,
          security_evidence: security.evidence,
          has_code_execution: security.evidence.some(e => e.id === 'tool-safety' && e.pass === false),
          has_injection_risk: deriveInjectionRisk(security.evidence),
          dangerous_pattern_count: deriveDangerousPatternCount(security.evidence),
        }),
        security_scan_status: security.scan_status,
        last_security_scan: new Date().toISOString(),
        // Deliberately NOT under the guard above: dep-health comes from deps.dev,
        // and scan_status 'failed' reflects only the OSV queries — so this entry
        // is genuinely fresh during an OSV outage.
        dep_health_score: security.evidence.find(e => e.id === 'dep-health')?.points ?? null,
        has_tool_poisoning: security.has_tool_poisoning,
        tool_poisoning_flags: security.tool_poisoning_flags,
        tool_definition_hash: security.tool_definition_hash,
        total_tool_tokens: efficiency.total_tool_tokens,
        estimated_tokens_per_call: efficiency.estimated_tokens_per_call,
        token_efficiency_grade: efficiency.grade,
        doc_readme_quality: docs.readme_quality,
        doc_has_setup: docs.has_setup_instructions,
        doc_has_examples: docs.has_examples,
        doc_tool_schema_ratio: tools.length > 0
          ? tools.filter(t => t.input_schema && Object.keys(t.input_schema).length > 0).length / tools.length
          : null,
      })
      .eq('id', server.id)

    // The close half is a provable no-op here — the row was just inserted, so it
    // has no open advisories to go stale. The call exists so this upsert has ONE
    // implementation shared with the bot and the refresh-score route, not three.
    await reconcileAdvisories(admin, server.id, security.advisories, security.scan_status, 'success')

    server.score_total = merged.score_total
  } catch (e) {
    console.error('submit scoring error:', (e as Error).message)
    // Scoring failure doesn't block the submission
  }

  // Make the new server and the submitter's profile visible immediately
  // (karma is awarded by a DB trigger on the servers insert above).
  revalidateServer(slug)
  const { data: submitter } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  if (submitter?.username) revalidateProfile(submitter.username)

  return NextResponse.json({ server }, { status: 201 })
}
