import Link from 'next/link'
import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/constants'
import {
  JsonLdScript,
  generateBreadcrumbJsonLd,
  generateCollectionJsonLd,
  generateItemListJsonLd,
} from '@/lib/seo'
import {
  getAllSkills,
  getFeaturedSkills,
  getTrendingSkills,
  getSkillCategoriesWithCounts,
} from '@/lib/skills'
import SkillsBrowser from '@/components/SkillsBrowser'
import HubIntro from '@/components/HubIntro'

export const metadata: Metadata = {
  title: { absolute: `Claude Code Skills Directory — ${SITE_NAME}` },
  description:
    'Browse curated, high-quality Claude Code skills and plugins. Official Anthropic skills, Superpowers, UI UX Pro Max, and the best of the community — all in one place.',
  openGraph: {
    title: `Claude Code Skills Directory — ${SITE_NAME}`,
    description:
      'Curated skills and plugins for Claude Code, Codex, Cursor, Gemini CLI, and more.',
    url: `${SITE_URL}/skills`,
  },
  alternates: { canonical: `${SITE_URL}/skills` },
}

export default function SkillsPage() {
  const all = getAllSkills()
  const featured = getFeaturedSkills(6)
  const trending = getTrendingSkills(6)
  const categoriesWithCounts = getSkillCategoriesWithCounts()

  // Derived from the directory itself so the numbers cannot go stale: adding a
  // skill file rewrites this paragraph on the next build.
  const topCategories = [...categoriesWithCounts].sort((a, b) => b.count - a.count).slice(0, 3)
  const lastUpdated = all
    .map(s => (s.last_updated ? new Date(s.last_updated) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date()

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <JsonLdScript
        data={[
          generateBreadcrumbJsonLd([
            { name: 'Home', url: SITE_URL },
            { name: 'Skills', url: `${SITE_URL}/skills` },
          ]),
          generateCollectionJsonLd(
            'Claude Code Skills Directory',
            'Curated, high-quality Claude Code skills and plugins.',
            `${SITE_URL}/skills`
          ),
          generateItemListJsonLd(
            all.map(s => ({
              name: s.name,
              url: `${SITE_URL}/skills/${s.slug}`,
              description: s.tagline,
            }))
          ),
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
          <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium uppercase tracking-wide">
            New
          </span>
          <span>Beta · curated list</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary mb-2">
          Claude Code Skills Directory
        </h1>
        <p className="text-text-muted max-w-2xl">
          Curated, high-quality skills and plugins for Claude Code, Codex, Cursor, Gemini CLI,
          and more. Hand-picked from the official Anthropic library, the Superpowers framework,
          and the best of the community.
        </p>
      </div>

      <HubIntro
        updatedAt={lastUpdated}
        paragraphs={[
          `This directory lists ${all.length} Claude Code skills across ${categoriesWithCounts.length} ` +
            `categories${topCategories.length ? `, the largest being ${topCategories.map(c => `${c.category} (${c.count})`).join(', ')}` : ''}. ` +
            `A skill is not an MCP server: an MCP server gives an agent new tools to call over a protocol, ` +
            `while a skill gives it instructions, context and a workflow for a task it can already do. ` +
            `Most real setups end up using both.`,
          `Every entry here is checked against concrete criteria, not just scraped off a topic listing — ` +
            `it must actually ship a SKILL.md, links to the source repository, says which clients it works ` +
            `with, and shows when it was last updated, because an abandoned skill is worse than no skill: ` +
            `it will confidently walk an agent through a workflow that no longer matches the tool it is ` +
            `driving. A weekly bot scans GitHub for new entries that clear that bar; the list above is ` +
            `refreshed automatically rather than by hand.`,
        ]}
        siblingsLabel="Also see"
        siblings={[
          { label: 'Best MCP servers', href: '/best' },
          { label: 'All MCP servers', href: '/servers' },
          { label: 'Getting started with MCP', href: '/get-started' },
          { label: 'MCPpedia MCP server', href: '/mcp' },
        ]}
      />

      {/* Interactive search + browse */}
      <SkillsBrowser
        skills={all}
        featured={featured}
        trending={trending}
        categoriesWithCounts={categoriesWithCounts}
      />

      {/* Submit CTA */}
      <section className="mt-14 border-t border-border pt-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary mb-1">
              Have a skill you&apos;d like us to add?
            </h2>
            <p className="text-sm text-text-muted">
              We&apos;re curating by hand for now. Open an issue or PR with the skill&apos;s repo URL.
            </p>
          </div>
          <Link
            href="https://github.com/BbekShr/MCPpedia/issues/new"
            className="shrink-0 text-sm px-3 py-1.5 rounded-md bg-accent text-accent-fg hover:bg-accent-hover"
            target="_blank"
            rel="noreferrer"
          >
            Suggest a skill
          </Link>
        </div>
      </section>
    </div>
  )
}
