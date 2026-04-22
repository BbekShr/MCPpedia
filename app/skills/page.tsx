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
  getSkillCategoriesWithCounts,
} from '@/lib/skills'
import SkillsBrowser from '@/components/SkillsBrowser'

export const metadata: Metadata = {
  title: `Claude Code Skills Directory — ${SITE_NAME}`,
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
  const categoriesWithCounts = getSkillCategoriesWithCounts()

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

      {/* Interactive search + browse */}
      <SkillsBrowser
        skills={all}
        featured={featured}
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
