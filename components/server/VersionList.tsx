import type { Changelog } from '@/lib/types'

export default function VersionList({ changelogs }: { changelogs: Changelog[] }) {
  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      {changelogs.map((cl, i) => (
        <div
          key={cl.id}
          className="grid items-center gap-3 px-3.5 py-2.5 text-[13px]"
          style={{
            gridTemplateColumns: '110px 110px 1fr auto',
            borderTop: i > 0 ? '1px solid var(--border-muted)' : 'none',
          }}
        >
          <code className="font-mono font-semibold">{cl.version || 'unknown'}</code>
          <span className="text-text-muted text-xs">
            {new Date(cl.detected_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
          <span className="truncate">{cl.changes_summary || '—'}</span>
          {cl.github_release_url ? (
            <a
              href={cl.github_release_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:text-accent-hover"
            >
              Release →
            </a>
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  )
}
