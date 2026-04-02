'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useRef, useCallback, Suspense } from 'react'

function SearchBarInner({
  placeholder = 'Search MCP servers...',
  action = '/servers',
  large = false,
}: {
  placeholder?: string
  action?: string
  large?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set('q', value)
      } else {
        params.delete('q')
      }
      params.delete('page')
      router.push(`${action}?${params.toString()}`)
    }, 300)
  }, [router, searchParams, action])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const input = form.querySelector('input') as HTMLInputElement
    const params = new URLSearchParams(searchParams.toString())
    if (input.value) {
      params.set('q', input.value)
    } else {
      params.delete('q')
    }
    params.delete('page')
    router.push(`${action}?${params.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute left-3 text-text-muted ${large ? 'top-4' : 'top-2.5'}`}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          name="q"
          defaultValue={searchParams.get('q') || ''}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-full border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors duration-150 ${
            large ? 'pl-10 pr-4 py-3 text-base' : 'pl-10 pr-4 py-2 text-sm'
          }`}
        />
      </div>
    </form>
  )
}

export default function SearchBar(props: {
  placeholder?: string
  action?: string
  large?: boolean
}) {
  return (
    <Suspense fallback={
      <div className="w-full">
        <div className={`border border-border rounded-md bg-bg ${props.large ? 'h-12' : 'h-9'}`} />
      </div>
    }>
      <SearchBarInner {...props} />
    </Suspense>
  )
}
