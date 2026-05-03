import { diffWordsWithSpace } from 'diff'

// Inline word-level diff used by the moderator approval UI. Stringifies
// non-string values (objects/arrays/null) so the same component handles
// description text *and* JSON fields like install_configs.
function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2)
}

export default function DiffView({
  oldValue,
  newValue,
  className = '',
}: {
  oldValue: unknown
  newValue: unknown
  className?: string
}) {
  const parts = diffWordsWithSpace(asText(oldValue), asText(newValue))

  return (
    <pre
      className={
        'm-0 p-2 rounded border border-border bg-bg-secondary font-mono text-xs ' +
        'whitespace-pre-wrap break-words max-h-64 overflow-auto ' +
        className
      }
    >
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <span key={i} className="bg-green/15 text-green px-0.5 rounded-sm">
              {part.value}
            </span>
          )
        }
        if (part.removed) {
          return (
            <span key={i} className="bg-red/15 text-red line-through px-0.5 rounded-sm">
              {part.value}
            </span>
          )
        }
        return (
          <span key={i} className="text-text-muted">
            {part.value}
          </span>
        )
      })}
    </pre>
  )
}
