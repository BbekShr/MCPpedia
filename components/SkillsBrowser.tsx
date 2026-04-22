'use client'

import { useMemo, useState } from 'react'
import type { Skill, SkillCategory } from '@/lib/skills'
import { SKILL_CATEGORY_ICONS, SKILL_CATEGORY_LABELS } from '@/lib/skills'
import SkillCard from './SkillCard'

interface Props {
  skills: Skill[]
  featured: Skill[]
  categoriesWithCounts: { category: SkillCategory; count: number }[]
}

function matchesQuery(skill: Skill, needle: string): boolean {
  if (!needle) return true
  const q = needle.toLowerCase()
  const hay = [
    skill.name,
    skill.tagline,
    skill.description ?? '',
    skill.author,
    skill.repo,
    SKILL_CATEGORY_LABELS[skill.category],
    ...skill.tags,
    ...skill.compatible_with,
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

const CHIP_BASE =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors border'
const CHIP_INACTIVE =
  'border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
const CHIP_ACTIVE =
  'border-accent bg-accent text-accent-fg hover:bg-accent-hover'

export default function SkillsBrowser({ skills, featured, categoriesWithCounts }: Props) {
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all')
  const q = query.trim()
  const searching = q.length > 0

  const filtered = useMemo(() => {
    let list = skills
    if (selectedCategory !== 'all') {
      list = list.filter(s => s.category === selectedCategory)
    }
    if (q) {
      list = list.filter(s => matchesQuery(s, q))
    }
    return list
  }, [skills, q, selectedCategory])

  const categoryLabel =
    selectedCategory === 'all' ? null : SKILL_CATEGORY_LABELS[selectedCategory]
  const categoryIcon =
    selectedCategory === 'all' ? null : SKILL_CATEGORY_ICONS[selectedCategory]

  const statusText = searching
    ? `${filtered.length} skill${filtered.length === 1 ? '' : 's'} match "${q}"${
        categoryLabel ? ` in ${categoryLabel}` : ''
      }`
    : categoryLabel
    ? `${filtered.length} skill${filtered.length === 1 ? '' : 's'} in ${categoryLabel}`
    : `Browsing ${skills.length} curated skills`

  return (
    <div>
      {/* Search */}
      <div className="mb-6">
        <label htmlFor="skills-search" className="sr-only">
          Search skills
        </label>
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id="skills-search"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search skills by name, tag, author, or agent…"
            className="w-full pl-10 pr-10 py-2.5 rounded-md border border-border bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            aria-describedby="skills-search-status"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1 rounded"
              aria-label="Clear search"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <p
          id="skills-search-status"
          className="mt-2 text-xs text-text-muted"
          aria-live="polite"
        >
          {statusText}
        </p>
      </div>

      {/* Featured — only on pristine default view */}
      {!searching && selectedCategory === 'all' && featured.length > 0 && (
        <section aria-labelledby="featured-heading" className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 id="featured-heading" className="text-lg font-semibold text-text-primary">
              Featured
            </h2>
            <span className="text-xs text-text-muted">Hand-picked highlights</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {featured.map(skill => (
              <SkillCard key={skill.slug} skill={skill} />
            ))}
          </div>
        </section>
      )}

      {/* Category chips — hidden while searching; search narrows the grid alone */}
      {!searching && (
        <div
          className="flex flex-wrap gap-2 mb-5"
          role="tablist"
          aria-label="Filter by category"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            className={`${CHIP_BASE} ${selectedCategory === 'all' ? CHIP_ACTIVE : CHIP_INACTIVE}`}
          >
            <span>All</span>
            <span className="text-xs opacity-80">({skills.length})</span>
          </button>
          {categoriesWithCounts.map(({ category, count }) => {
            const active = selectedCategory === category
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(category)}
                className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_INACTIVE}`}
              >
                <span aria-hidden="true">{SKILL_CATEGORY_ICONS[category]}</span>
                <span>{SKILL_CATEGORY_LABELS[category]}</span>
                <span className="text-xs opacity-80">({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Results grid */}
      {filtered.length === 0 ? (
        <div className="border border-border rounded-md p-8 text-center bg-bg-secondary">
          <p className="text-text-primary mb-1">
            {searching ? (
              <>No skills match &ldquo;{q}&rdquo;{categoryLabel ? ` in ${categoryLabel}` : ''}.</>
            ) : (
              <>No skills in {categoryLabel ?? 'this category'}.</>
            )}
          </p>
          <p className="text-sm text-text-muted">
            Try a broader term, or{' '}
            <a
              href="https://github.com/BbekShr/MCPpedia/issues/new"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:text-accent-hover"
            >
              suggest a skill
            </a>
            .
          </p>
        </div>
      ) : (
        <section aria-labelledby="skills-grid-heading">
          <h2
            id="skills-grid-heading"
            className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2"
          >
            {searching ? (
              <>Search results</>
            ) : categoryLabel ? (
              <>
                <span aria-hidden="true">{categoryIcon}</span>
                {categoryLabel}
                <span className="text-xs font-normal text-text-muted">
                  · {filtered.length}
                </span>
              </>
            ) : (
              <>
                All skills
                <span className="text-xs font-normal text-text-muted">
                  · {filtered.length}
                </span>
              </>
            )}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(skill => (
              <SkillCard key={skill.slug} skill={skill} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
