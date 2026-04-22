import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/constants'
import { JsonLdScript, generateBreadcrumbJsonLd } from '@/lib/seo'
import {
  getAllSkills,
  getSkill,
  SKILL_AGENT_LABELS,
  SKILL_CATEGORY_ICONS,
  SKILL_CATEGORY_LABELS,
} from '@/lib/skills'
import type { Skill, SkillAgent } from '@/lib/skills'
import SkillCard from '@/components/SkillCard'

export async function generateStaticParams() {
  return getAllSkills().map(s => ({ slug: s.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const skill = getSkill(slug)
  if (!skill) return { title: 'Skill Not Found' }

  const url = `${SITE_URL}/skills/${slug}`
  const description = skill.description ?? skill.tagline
  return {
    title: `${skill.name} — ${SITE_NAME}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${skill.name} — ${SITE_NAME}`,
      description,
      url,
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title: `${skill.name} — ${SITE_NAME}`,
      description,
    },
  }
}

const INSTALL_LABELS: Record<keyof Skill['install'], string> = {
  claude_code: 'Claude Code',
  codex: 'Codex CLI',
  cursor: 'Cursor',
  gemini: 'Gemini CLI',
  manual: 'Manual',
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function softwareJsonLd(skill: Skill) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: skill.name,
    description: skill.description ?? skill.tagline,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Cross-platform',
    url: `${SITE_URL}/skills/${skill.slug}`,
    codeRepository: skill.github_url,
    ...(skill.license && skill.license !== 'NOASSERTION' ? { license: skill.license } : {}),
    author: {
      '@type': skill.author_type === 'official' ? 'Organization' : 'Person',
      name: skill.author,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  }
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const skill = getSkill(slug)
  if (!skill) notFound()

  const installEntries = (Object.entries(skill.install) as [keyof Skill['install'], string | undefined][]).filter(
    ([, v]) => Boolean(v)
  )

  const related = getAllSkills()
    .filter(s => s.slug !== skill.slug && s.category === skill.category)
    .slice(0, 3)

  return (
    <div className="max-w-[1000px] mx-auto px-4 py-8">
      <JsonLdScript
        data={[
          generateBreadcrumbJsonLd([
            { name: 'Home', url: SITE_URL },
            { name: 'Skills', url: `${SITE_URL}/skills` },
            { name: skill.name, url: `${SITE_URL}/skills/${skill.slug}` },
          ]),
          softwareJsonLd(skill),
        ]}
      />

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-text-muted mb-4">
        <ol className="flex items-center gap-1 flex-wrap">
          <li>
            <Link href="/" className="hover:text-accent">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/skills" className="hover:text-accent">
              Skills
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-text-primary" aria-current="page">
            {skill.name}
          </li>
        </ol>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-3xl leading-none pt-0.5" aria-hidden="true">
            {SKILL_CATEGORY_ICONS[skill.category]}
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary mb-1">
              {skill.name}
            </h1>
            <p className="text-text-muted">{skill.tagline}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {skill.author_type === 'official' && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
              Official
            </span>
          )}
          {skill.featured && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-green/10 text-green font-medium">
              Featured
            </span>
          )}
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-medium">
            {SKILL_CATEGORY_LABELS[skill.category]}
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-medium capitalize">
            {skill.type.replace('-', ' ')}
          </span>
          {skill.license && skill.license !== 'NOASSERTION' && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-medium">
              {skill.license}
            </span>
          )}
          {skill.stars > 0 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-medium inline-flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {formatStars(skill.stars)}
            </span>
          )}
        </div>
      </header>

      {/* Main body */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Description */}
          {skill.description && (
            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="text-lg font-semibold text-text-primary mb-2">
                About
              </h2>
              <p className="text-text-primary leading-relaxed">{skill.description}</p>
            </section>
          )}

          {/* Install */}
          {installEntries.length > 0 && (
            <section aria-labelledby="install-heading">
              <h2 id="install-heading" className="text-lg font-semibold text-text-primary mb-2">
                Install
              </h2>
              <div className="space-y-3">
                {installEntries.map(([key, value]) => (
                  <div key={key}>
                    <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
                      {INSTALL_LABELS[key]}
                    </div>
                    <pre className="bg-code-bg border border-border rounded-md px-3 py-2 text-sm text-text-primary overflow-x-auto whitespace-pre-wrap break-words">
                      <code>{value}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tags */}
          {skill.tags.length > 0 && (
            <section aria-labelledby="tags-heading">
              <h2 id="tags-heading" className="text-lg font-semibold text-text-primary mb-2">
                Tags
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {skill.tags.map(tag => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full bg-bg-tertiary text-text-muted border border-border"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <section
            aria-labelledby="meta-heading"
            className="border border-border rounded-md p-4 bg-bg"
          >
            <h2 id="meta-heading" className="sr-only">
              Skill details
            </h2>
            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-text-muted">Author</dt>
                <dd className="text-text-primary">{skill.author}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Repository</dt>
                <dd>
                  <a
                    href={skill.github_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:text-accent-hover break-all"
                  >
                    {skill.repo}
                  </a>
                </dd>
              </div>
              {skill.homepage_url && (
                <div>
                  <dt className="text-text-muted">Homepage</dt>
                  <dd>
                    <a
                      href={skill.homepage_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:text-accent-hover break-all"
                    >
                      {skill.homepage_url.replace(/^https?:\/\//, '')}
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-text-muted">Compatible with</dt>
                <dd className="flex flex-wrap gap-1 mt-1">
                  {skill.compatible_with.map((a: SkillAgent) => (
                    <span
                      key={a}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted"
                    >
                      {SKILL_AGENT_LABELS[a]}
                    </span>
                  ))}
                </dd>
              </div>
              {skill.last_updated && (
                <div>
                  <dt className="text-text-muted">Last updated</dt>
                  <dd className="text-text-primary">
                    {new Date(skill.last_updated).toLocaleDateString()}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-4">
              <a
                href={skill.github_url}
                target="_blank"
                rel="noreferrer"
                className="w-full text-center text-sm px-3 py-1.5 rounded-md bg-accent text-accent-fg hover:bg-accent-hover inline-block"
              >
                View on GitHub
              </a>
            </div>
          </section>
        </aside>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-12">
          <h2 id="related-heading" className="text-lg font-semibold text-text-primary mb-3">
            More {SKILL_CATEGORY_LABELS[skill.category]} skills
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {related.map(s => (
              <SkillCard key={s.slug} skill={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
