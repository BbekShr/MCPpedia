'use client'

import { useState, useEffect } from 'react'

interface TOCItem {
  id: string
  text: string
  level: number
}

export default function TableOfContents() {
  const [headings, setHeadings] = useState<TOCItem[]>([])
  const [activeId, setActiveId] = useState<string>('')

  // Extract headings from the article on mount
  useEffect(() => {
    const article = document.querySelector('.blog-content')
    if (!article) return

    const elements = article.querySelectorAll('h2, h3')
    const items: TOCItem[] = []

    elements.forEach((el) => {
      // Generate an ID if one doesn't exist
      if (!el.id) {
        el.id = el.textContent
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || `heading-${items.length}`
      }
      items.push({
        id: el.id,
        text: el.textContent || '',
        level: el.tagName === 'H2' ? 2 : 3,
      })
    })

    setHeadings(items)
  }, [])

  // Track active heading via IntersectionObserver
  useEffect(() => {
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first heading that's intersecting
        const visible = entries.find(e => e.isIntersecting)
        if (visible?.target.id) {
          setActiveId(visible.target.id)
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    )

    headings.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [headings])

  if (headings.length < 3) return null // Don't show TOC for short posts

  return (
    <nav
      aria-label="Table of contents"
      className="hidden xl:block fixed right-[max(1rem,calc((100vw-680px)/2-280px))] top-28 w-56 max-h-[calc(100vh-160px)] overflow-y-auto"
    >
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        On this page
      </p>
      <ul className="space-y-1.5 border-l border-border">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth' })
              }}
              className={`block text-xs leading-snug transition-colors duration-150 border-l-2 -ml-[1px] ${
                heading.level === 3 ? 'pl-5' : 'pl-3'
              } py-1 ${
                activeId === heading.id
                  ? 'border-accent text-accent font-medium'
                  : 'border-transparent text-text-muted hover:text-text-primary hover:border-border'
              }`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
