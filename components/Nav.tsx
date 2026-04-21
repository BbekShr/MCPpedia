'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from './ThemeToggle'
import BlinkLogo from './BlinkLogo'
import type { User } from '@supabase/supabase-js'

export default function Nav() {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [karma, setKarma] = useState<number | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        supabase.from('profiles').select('role, username, karma').eq('id', data.user.id).single().then(({ data: p }) => {
          setIsAdmin(p?.role === 'admin' || p?.role === 'maintainer')
          setUsername(p?.username ?? null)
          setKarma(typeof p?.karma === 'number' ? p.karma : null)
        })
      } else {
        setUsername(null)
        setKarma(null)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) {
        setUsername(null)
        setKarma(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUser(null)
    setUsername(null)
    setKarma(null)
  }

  const navLinks = [
    { href: '/servers', label: 'Servers' },
    { href: '/get-started', label: 'Get Started' },
    { href: '/security', label: 'Security' },
    { href: '/blog', label: 'Blog' },
    { href: '/about', label: 'About' },
  ]

  return (
    <nav aria-label="Primary" className="border-b border-border sticky top-0 z-50 backdrop-blur-md bg-bg/90">
      <div className="max-w-[1200px] mx-auto px-4 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="font-semibold text-lg shrink-0 flex items-center gap-1.5" aria-label="MCPpedia home">
          <BlinkLogo size={22} className="text-accent" />
          <span className="text-text-primary">MCP</span>
          <span className="text-accent">pedia</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-0.5">
          {navLinks.map(link => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`relative px-3 py-1.5 rounded-md text-sm ${
                  active
                    ? 'text-accent font-medium'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent rounded-full" />
                )}
              </Link>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* Right side */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Link
                  href="/admin"
                  className="text-sm px-2 py-1 rounded-md bg-red/10 text-red hover:bg-red/20"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/my-servers"
                className={`text-sm px-2 py-1 rounded-md ${
                  pathname === '/my-servers'
                    ? 'text-accent font-medium'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                <span className="flex items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  My Servers
                </span>
              </Link>
              <Link
                href={username ? `/profile/${username}` : '/login'}
                className="text-sm text-text-muted hover:text-text-primary inline-flex items-center gap-1.5"
              >
                {username || 'Profile'}
                {typeof karma === 'number' && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-semibold tabular-nums" title={`${karma} karma`}>
                    {karma}
                  </span>
                )}
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
              className="text-sm px-3 py-1.5 rounded-md bg-accent text-accent-fg hover:bg-accent-hover"
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
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
        <div id="mobile-nav" className="md:hidden border-t border-border bg-bg/95 backdrop-blur-md px-4 py-3 space-y-1">
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
                  href="/my-servers"
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 rounded-md text-sm text-text-muted hover:text-text-primary"
                >
                  My Servers
                </Link>
                <Link
                  href={username ? `/profile/${username}` : '/login'}
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
