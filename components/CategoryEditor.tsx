'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { CATEGORIES, CATEGORY_LABELS, type Category } from '@/lib/constants'

const SELECTABLE = CATEGORIES.filter(c => c !== 'other')

export default function CategoryEditor({
  slug,
  initialCategories,
}: {
  slug: string
  initialCategories: string[]
}) {
  const [categories, setCategories] = useState<string[]>(initialCategories)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string[]>(initialCategories)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(cat: string) {
    setPending(prev =>
      prev.includes(cat)
        ? prev.filter(c => c !== cat)
        : prev.length < 3
        ? [...prev, cat]
        : prev
    )
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/server/${slug}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: pending }),
      })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (res.ok) {
        const data = await res.json()
        setCategories(data.categories)
        setPending(data.categories)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        setOpen(false)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  const classes = "inline-block px-2 py-0.5 rounded text-xs bg-tag-bg text-tag-text"

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-1 mb-3">
      {categories.length > 0
        ? categories.map(cat => (
            <Link
              key={cat}
              href={`/category/${cat}`}
              className={`${classes} hover:opacity-80 transition-opacity`}
            >
              {CATEGORY_LABELS[cat as Category] ?? cat}
            </Link>
          ))
        : <span className="text-xs text-text-muted">No categories yet</span>
      }

      <button
        onClick={() => { setPending(categories); setOpen(o => !o) }}
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-dashed border-border text-text-muted hover:text-text-primary hover:border-text-muted transition-colors"
        title="Suggest categories"
      >
        {saved ? '✓ Saved' : '+ Edit'}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-bg border border-border rounded-md shadow-lg p-3 w-72">
          <p className="text-xs text-text-muted mb-2">Select up to 3 categories</p>
          <div className="grid grid-cols-2 gap-1 mb-3">
            {SELECTABLE.map(cat => {
              const selected = pending.includes(cat)
              return (
                <button
                  key={cat}
                  onClick={() => toggle(cat)}
                  disabled={!selected && pending.length >= 3}
                  className={`text-left text-xs px-2 py-1.5 rounded border transition-colors ${
                    selected
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-text-muted hover:border-text-muted hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  {CATEGORY_LABELS[cat as Category]}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">{pending.length}/3 selected</span>
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="text-xs px-3 py-1 rounded border border-border text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || pending.length === 0}
                className="text-xs px-3 py-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
