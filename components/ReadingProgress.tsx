/**
 * Reading-progress bar for long article pages.
 *
 * Driven entirely by `animation-timeline: scroll()` (see `.reading-progress` in
 * globals.css) rather than a scroll listener that set React state on every
 * frame. That makes this a server component with no client JS at all, and the
 * sitewide reduced-motion block applies to it for free.
 *
 * Where the timeline is unsupported the fill stays at `scaleX(0)` and the bar
 * simply does not appear, which is the right fallback for a decorative
 * indicator.
 */
export default function ReadingProgress() {
  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[60] h-[3px] bg-transparent pointer-events-none"
    >
      <div className="reading-progress h-full bg-gradient-to-r from-accent to-green" />
    </div>
  )
}
