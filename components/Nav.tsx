'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from './ThemeToggle'
import type { User } from '@supabase/supabase-js'

export default function Nav() {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [supabase.auth])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  const navLinks = [
    { href: '/get-started', label: 'Get Started' },
    { href: '/servers', label: 'Browse' },
    { href: '/security', label: 'Security' },
    { href: '/guides', label: 'Guides' },
    { href: '/about', label: 'About' },
  ]

  return (
    <nav className="border-b border-border sticky top-0 z-50 backdrop-blur-md bg-bg/80">
      <div className="max-w-[1200px] mx-auto px-4 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="font-semibold text-lg shrink-0 flex items-center gap-1.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-accent">
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2"/>
            <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor"/>
            <circle cx="15.5" cy="9.5" r="1.5" fill="currentColor"/>
            <path d="M8 15c1 1.5 3 2.5 4 2.5s3-1 4-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="text-text-primary">MCP</span>
          <span className="text-accent">pedia</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-0.5">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative px-3 py-1.5 rounded-md text-sm ${
                pathname === link.href
                  ? 'text-accent font-medium'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              {link.label}
              {pathname === link.href && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent rounded-full" />
              )}
            </Link>
          ))}
        </div>

        <div className="flex-1" />

        {/* Right side */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          <a
            href="https://github.com/BbekShr/MCPpedia"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-md hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
            aria-label="GitHub"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/profile/${user.user_metadata?.user_name || 'me'}`}
                className="text-sm text-text-muted hover:text-text-primary"
              >
                {user.user_metadata?.user_name || 'Profile'}
              </Link>
              <button
                onClick={handleSignOut}
                className="text-sm px-3 py-1.5 rounded-md border border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover"
            >
              Sign in
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-md hover:bg-bg-tertiary"
            aria-label="Toggle menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-bg/95 backdrop-blur-md px-4 py-3 space-y-1">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`block px-3 py-2 rounded-md text-sm ${
                pathname === link.href
                  ? 'bg-accent-subtle text-accent font-medium'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-border mt-2">
            {user ? (
              <>
                <Link
                  href={`/profile/${user.user_metadata?.user_name || 'me'}`}
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 rounded-md text-sm text-text-muted hover:text-text-primary"
                >
                  Profile
                </Link>
                <button
                  onClick={() => { handleSignOut(); setMobileOpen(false) }}
                  className="block w-full text-left px-3 py-2 rounded-md text-sm text-text-muted hover:text-text-primary"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-md text-sm text-accent hover:text-accent-hover"
              >
                Sign in with GitHub
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
