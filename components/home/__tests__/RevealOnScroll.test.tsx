// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import RevealOnScroll from '../RevealOnScroll'

class ImmediateIO {
  private cb: IntersectionObserverCallback
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
  }
  observe(el: Element) {
    this.cb(
      [
        {
          isIntersecting: true,
          intersectionRatio: 1,
          target: el,
        } as unknown as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    )
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [] as IntersectionObserverEntry[]
  }
}

describe('RevealOnScroll', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ImmediateIO)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders its children', () => {
    render(
      <RevealOnScroll>
        <section>
          <h2>Hello section</h2>
        </section>
      </RevealOnScroll>,
    )
    expect(screen.getByRole('heading', { name: 'Hello section' })).toBeTruthy()
  })

  it('applies the className to the wrapper', () => {
    const { container } = render(
      <RevealOnScroll className="my-wrapper">
        <div>content</div>
      </RevealOnScroll>,
    )
    expect(container.querySelector('.my-wrapper')).not.toBeNull()
    expect(screen.getByText('content')).toBeTruthy()
  })
})
