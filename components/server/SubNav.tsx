'use client'

import { useEffect, useState } from 'react'
import { Icon } from './helpers'

interface Item {
  id: string
  label: string
}

export default function SubNav({ items }: { items: Item[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '')

  useEffect(() => {
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) setActive(e.target.id)
        })
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
    )
    items.forEach(i => {
      const el = document.getElementById(i.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [items])

  function jump(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    const y = el.getBoundingClientRect().top + window.scrollY - 60
    window.scrollTo({ top: y, behavior: 'smooth' })
  }

  return (
    <nav
      className="sticky top-0 z-10 border-b border-border backdrop-blur"
      style={{ background: 'color-mix(in srgb, var(--bg) 94%, transparent)' }}
    >
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 flex gap-1 overflow-x-auto">
        {items.map(it => (
          <button
            key={it.id}
            onClick={() => jump(it.id)}
            className={`px-3 py-2.5 text-[13px] whitespace-nowrap ${
              active === it.id
                ? 'text-text-primary font-semibold'
                : 'text-text-muted hover:text-text-primary font-medium'
            }`}
            style={{
              borderBottom: `2px solid ${active === it.id ? 'var(--accent)' : 'transparent'}`,
            }}
          >
            {it.label}
          </button>
        ))}
        <span className="flex-1" />
        <button
          onClick={() => jump('install')}
          className="my-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 text-accent-fg shrink-0"
          style={{ background: 'var(--accent)' }}
        >
          <Icon name="download" size={12} /> Install
        </button>
      </div>
    </nav>
  )
}
