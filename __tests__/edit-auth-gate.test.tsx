// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'

// EditServerPage calls useParams()/useRouter() at render time.
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'datamcp' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

type AuthChangeCallback = (event: string, session: { user: User } | null) => void
type GetUserResult = { data: { user: User | null }; error: { message: string } | null }

// A minimal fake of the browser Supabase client, scoped to exactly what
// EditServerPage's auth effect touches: `auth.getUser()`, `auth.onAuthStateChange()`,
// and a `from().select().eq().single()` chain for the `servers`/`profiles` reads
// that effect also fires. Those two table reads are irrelevant to the auth-gate
// behaviour under test, so they always resolve to "not found" — the page then
// sits on its own internal "Loading..." branch (`!server || !form`) rather than
// rendering the full edit form, which is fine: the assertions below only care
// about the sign-in screen's presence/absence.
function makeFakeSupabase(getUser: () => Promise<GetUserResult>) {
  let authCallback: AuthChangeCallback | null = null
  const unsubscribe = vi.fn()
  const client = {
    auth: {
      getUser,
      onAuthStateChange: (cb: AuthChangeCallback) => {
        authCallback = cb
        return { data: { subscription: { unsubscribe } } }
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  }
  return {
    client,
    unsubscribe,
    fireAuthChange: (event: string, session: { user: User } | null) => authCallback?.(event, session),
  }
}

const fakeUser = { id: 'user-1', email: 'a@b.com' } as unknown as User

let currentSupabase: ReturnType<typeof makeFakeSupabase>['client']
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => currentSupabase,
}))

// Imported after the mocks above so the component picks them up.
import EditServerPage from '@/app/s/[slug]/edit/page'

const SIGN_IN_TEXT = /Sign in to edit this page/i

describe('EditServerPage auth gate (issue #68)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('does not show the sign-in screen while auth state is still unresolved', () => {
    // getUser() never resolves and onAuthStateChange never fires — simulates
    // the window between mount and the auth check settling.
    const fake = makeFakeSupabase(() => new Promise<GetUserResult>(() => {}))
    currentSupabase = fake.client

    render(<EditServerPage />)

    expect(screen.queryByText(SIGN_IN_TEXT)).toBeNull()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('renders past the sign-in gate once onAuthStateChange resolves a session', async () => {
    const fake = makeFakeSupabase(() => new Promise<GetUserResult>(() => {}))
    currentSupabase = fake.client

    render(<EditServerPage />)
    expect(screen.queryByText(SIGN_IN_TEXT)).toBeNull()

    act(() => {
      fake.fireAuthChange('INITIAL_SESSION', { user: fakeUser })
    })

    // authLoading is now false and user is non-null, so the component falls
    // through to the `!server` loading branch rather than the sign-in screen.
    expect(screen.queryByText(SIGN_IN_TEXT)).toBeNull()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('survives a rejected getUser() promise and still resolves via onAuthStateChange', async () => {
    const fake = makeFakeSupabase(() => Promise.reject(new Error('NavigatorLockAcquireTimeoutError')))
    currentSupabase = fake.client

    render(<EditServerPage />)

    // Let the rejected getUser() promise's .catch() run (it's handled inside
    // the component, so this must not surface as an unhandled rejection or
    // crash the render).
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByText(SIGN_IN_TEXT)).toBeNull()

    act(() => {
      fake.fireAuthChange('INITIAL_SESSION', { user: fakeUser })
    })

    expect(screen.queryByText(SIGN_IN_TEXT)).toBeNull()
  })

  it('unsubscribes the auth listener on unmount', () => {
    const fake = makeFakeSupabase(() => new Promise<GetUserResult>(() => {}))
    currentSupabase = fake.client

    const { unmount } = render(<EditServerPage />)
    unmount()

    expect(fake.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
