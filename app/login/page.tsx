'use client'

import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { Brand } from '@/components/ui/brand-marks'

function LoginForm() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const mode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin'
  const error = searchParams.get('error')
  const supabase = createClient()

  const isSignup = mode === 'signup'
  const heading = isSignup ? 'Create your MCPpedia account' : 'Sign in to MCPpedia'
  const subheading = isSignup
    ? 'Join the catalog - earn karma for every contribution.'
    : 'Welcome back. Sign in to keep contributing.'
  const altLinkHref = isSignup
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : `/login?mode=signup&redirect=${encodeURIComponent(redirect)}`
  const altLinkLabel = isSignup
    ? 'Already have an account? Sign in'
    : 'New here? Create an account'

  async function handleLogin(provider: 'github' | 'google') {
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    })
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-20">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">{heading}</h1>
        <p className="text-sm text-text-muted">{subheading}</p>
      </div>

      {isSignup && (
        <ul className="mb-6 space-y-2 text-sm text-text-muted border border-border rounded-md p-4 bg-bg-secondary/30">
          <li className="flex items-start gap-2">
            <span className="text-accent shrink-0" aria-hidden="true">✓</span>
            <span>Submit MCP servers and earn <strong className="text-text-primary">+15 karma</strong> each.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent shrink-0" aria-hidden="true">✓</span>
            <span>Propose edits, post in discussions, verify servers you use.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent shrink-0" aria-hidden="true">✓</span>
            <span>Climb tier ranks from Newcomer to Maintainer.</span>
          </li>
        </ul>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-md border border-red bg-red/5 text-sm text-red">
          Authentication failed. Please try again.
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={() => handleLogin('github')}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-md bg-[#24292f] text-white hover:bg-[#32383f] transition-colors duration-150 font-medium"
        >
          <Brand name="github" size={20} />
          Sign in with GitHub
        </button>

        <button
          onClick={() => handleLogin('google')}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-md bg-white text-[#1f1f1f] border border-border hover:bg-bg-secondary transition-colors duration-150 font-medium"
        >
          <Brand name="google" size={20} />
          Sign in with Google
        </button>
      </div>

      <p className="mt-6 text-xs text-text-muted text-center">
        {isSignup
          ? 'By creating an account, you agree to contribute constructively to the MCPpedia community.'
          : 'By signing in, you agree to contribute constructively to the MCPpedia community.'}
      </p>

      <p className="mt-4 text-xs text-center">
        <Link href={altLinkHref} className="text-accent hover:text-accent-hover">
          {altLinkLabel}
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
