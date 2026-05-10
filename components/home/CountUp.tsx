'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Counts from 0 up to `value` once the element scrolls into view (once).
 * Renders the final value on the server / before JS so crawlers and no-JS
 * users see the real number; the count-up only kicks in after mount.
 */
export default function CountUp({
  value,
  durationMs = 1600,
  delayMs = 0,
  className,
  style,
}: {
  value: number
  durationMs?: number
  delayMs?: number
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const node = ref.current
    if (!node || value <= 0) return

    let raf = 0
    let cancelled = false

    const run = () => {
      const start = performance.now() + delayMs
      const frame = (now: number) => {
        if (cancelled) return
        if (now < start) {
          raf = requestAnimationFrame(frame)
          return
        }
        const t = Math.min(1, (now - start) / durationMs)
        const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
        setDisplay(value * eased)
        if (t < 1) raf = requestAnimationFrame(frame)
        else setDisplay(value)
      }
      raf = requestAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect()
          run()
        }
      },
      { threshold: 0.4 },
    )
    observer.observe(node)

    return () => {
      cancelled = true
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value, durationMs, delayMs])

  return (
    <span ref={ref} className={className} style={style}>
      {Math.round(display).toLocaleString()}
    </span>
  )
}
