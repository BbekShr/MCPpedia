// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import CountUp from '../CountUp'

/** Minimal IntersectionObserver that reports the target as visible synchronously on observe(). */
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

describe('CountUp', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('server-renders the real, formatted value (so crawlers / no-JS see it)', () => {
    const html = renderToString(<CountUp value={21580} className="x" />)
    expect(html).toContain('21,580')
  })

  it('renders a static 0 and never observes when value <= 0', () => {
    const observe = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
      },
    )
    render(<CountUp value={0} />)
    expect(screen.getByText('0')).toBeTruthy()
    expect(observe).not.toHaveBeenCalled()
  })

  it('forwards className and inline style', () => {
    vi.stubGlobal('IntersectionObserver', ImmediateIO)
    render(<CountUp value={5} className="font-bold tabular-nums" style={{ color: 'red' }} />)
    const el = screen.getByText('5')
    expect(el.className).toContain('tabular-nums')
    expect(el.getAttribute('style')).toContain('color: red')
  })

  it('counts from 0 up to the value once in view', () => {
    vi.stubGlobal('IntersectionObserver', ImmediateIO)

    const rafCbs: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCbs.push(cb)
      return rafCbs.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    render(<CountUp value={1000} durationMs={1000} delayMs={0} />)

    const step = (t: number) => {
      now = t
      const cb = rafCbs.shift()
      expect(cb).toBeTypeOf('function')
      act(() => cb!(now))
    }

    // t = 1000 -> progress 0 -> easeOutCubic(0) = 0 -> display 0
    step(1000)
    expect(screen.getByText('0')).toBeTruthy()

    // t = 1500 -> progress 0.5 -> 1 - 0.5^3 = 0.875 -> display 875
    step(1500)
    expect(screen.getByText('875')).toBeTruthy()

    // t = 2000 -> progress 1 -> display 1,000 (final, with locale separator)
    step(2000)
    expect(screen.getByText('1,000')).toBeTruthy()
  })

  it('respects delayMs before starting the count', () => {
    vi.stubGlobal('IntersectionObserver', ImmediateIO)
    const rafCbs: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCbs.push(cb)
      return rafCbs.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    render(<CountUp value={100} durationMs={500} delayMs={1000} />)

    const step = (t: number) => {
      now = t
      const cb = rafCbs.shift()
      act(() => cb?.(now))
    }

    // Still inside the delay window -> value untouched (initial formatted value).
    step(500)
    expect(screen.getByText('100')).toBeTruthy()

    // Delay elapsed, half the duration in -> 1 - 0.5^3 = 0.875 -> 88 (rounded).
    step(1250)
    expect(screen.getByText('88')).toBeTruthy()

    // Done.
    step(1500)
    expect(screen.getByText('100')).toBeTruthy()
  })
})
