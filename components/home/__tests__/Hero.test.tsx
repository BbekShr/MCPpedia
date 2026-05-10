// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// HeroSearch (rendered inside Hero) calls useRouter().
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

class ImmediateIO {
  private cb: IntersectionObserverCallback
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
  }
  observe(el: Element) {
    this.cb(
      [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [] as IntersectionObserverEntry[]
  }
}

import Hero from '../Hero'

const stats = {
  total_servers: 21580,
  official_count: 682,
  open_cves: 93,
  servers_with_open_advisories: 47,
}

describe('Hero (integration)', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ImmediateIO)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders the headline and subhead', () => {
    render(<Hero stats={stats} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toMatch(/Find an MCP server/i)
    expect(h1.textContent).toMatch(/you can actually trust\./i)
    expect(screen.getByText(/Every server is scored on security, maintenance/i)).toBeTruthy()
  })

  it('renders the trust ticker with the real stats and labels', () => {
    render(<Hero stats={stats} />)
    // CountUp's server/initial render shows the real, formatted value.
    expect(screen.getByText('21,580')).toBeTruthy()
    expect(screen.getByText('682')).toBeTruthy()
    expect(screen.getByText('93')).toBeTruthy()
    expect(screen.getByText('47')).toBeTruthy()
    expect(screen.getByText('Servers indexed')).toBeTruthy()
    expect(screen.getByText('Open CVEs')).toBeTruthy()
    expect(screen.getByText('Official publishers')).toBeTruthy()
    expect(screen.getByText('Servers with open advisories')).toBeTruthy()
  })

  it('renders the search box', () => {
    render(<Hero stats={stats} />)
    expect(screen.getByLabelText('Search MCP servers')).toBeTruthy()
  })

  it('renders zero alert stats as a static 0 without crashing', () => {
    render(
      <Hero
        stats={{ total_servers: 5, official_count: 0, open_cves: 0, servers_with_open_advisories: 0 }}
      />,
    )
    expect(screen.getByText('Servers indexed')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1)
  })
})
