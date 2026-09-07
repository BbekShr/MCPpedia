import type { Server } from '@/lib/types'
import { Icon } from '@/components/ui/icons'

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
                  <Icon name="external" size={12} />
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
