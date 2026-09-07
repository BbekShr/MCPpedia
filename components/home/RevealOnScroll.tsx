import type { ReactNode } from 'react'

/**
 * Wraps a homepage section in the scroll-linked entrance defined by `.reveal`
 * in globals.css.
 *
 * This used to be a Framer Motion client component with
 * `initial={{ opacity: 0, filter: 'blur(12px)' }}`. React serialises `initial`
 * into the server-rendered HTML, so every section it wrapped shipped as
 * `opacity:0;filter:blur(12px)` and stayed invisible until hydration ran — a
 * blank homepage for anything that does not execute rAF, and a deferred LCP for
 * everyone else. It also ignored `prefers-reduced-motion` entirely.
 *
 * The CSS version has the opposite default: the section is visible, and the
 * animation is additive on top. It needs no JavaScript, so this is a server
 * component now, and browsers without `animation-timeline: view()` simply
 * render the section static.
 */
export default function RevealOnScroll({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={className ? `reveal ${className}` : 'reveal'}>{children}</div>
}
