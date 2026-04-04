import type { Server } from '@/lib/types'

function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

export default function EnvInstructions({ server }: { server: Server }) {
  const envVars = server.env_instructions || {}
  const entries = Object.entries(envVars)

  if (entries.length === 0) return null

  return (
    <div className="border border-border rounded-md p-4">
      <h3 className="font-semibold text-text-primary mb-3 text-sm">Required API Keys</h3>
      <div className="space-y-4">
        {entries.map(([varName, info]) => (
          <div key={varName}>
            <div className="flex items-center gap-2 mb-1.5">
              <code className="text-xs font-mono bg-code-bg px-1.5 py-0.5 rounded text-text-primary">{varName}</code>
              <span className="text-xs text-text-muted">{info.label}</span>
            </div>
            <div className="pl-3 border-l-2 border-accent/30">
              <pre className="text-xs text-text-muted whitespace-pre-wrap leading-relaxed">{info.steps}</pre>
              {info.url && safeUrl(info.url) && (
                <a
                  href={safeUrl(info.url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover mt-1.5"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Open {info.label} page
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
