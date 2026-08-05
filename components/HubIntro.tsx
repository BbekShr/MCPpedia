import Link from 'next/link'

// The intro block that sits above every hub list: data-derived prose, the
// sibling links that let a crawler walk between hubs, and a visible "Last
// updated" date. Freshness is a ranking input for AI answers, and a date the
// reader can see is worth more than one buried in JSON-LD.
export default function HubIntro({
  paragraphs,
  updatedAt,
  siblings,
  siblingsLabel = 'Related',
}: {
  paragraphs: string[]
  updatedAt: Date
  siblings?: { label: string; href: string }[]
  siblingsLabel?: string
}) {
  if (!paragraphs.length && !siblings?.length) return null

  return (
    <div className="mb-8 max-w-[760px]">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-[15px] leading-[1.65] text-text-primary mb-3">
          {p}
        </p>
      ))}

      {siblings && siblings.length > 0 && (
        <p className="text-sm text-text-muted mb-3">
          {siblingsLabel}:{' '}
          {siblings.map((s, i) => (
            <span key={s.href}>
              {i > 0 && <span className="text-text-muted/60">, </span>}
              <Link href={s.href} className="text-accent hover:text-accent-hover">
                {s.label}
              </Link>
            </span>
          ))}
        </p>
      )}

      <p className="text-xs text-text-muted m-0">
        Last updated{' '}
        <time dateTime={updatedAt.toISOString()}>
          {updatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </time>
      </p>
    </div>
  )
}
