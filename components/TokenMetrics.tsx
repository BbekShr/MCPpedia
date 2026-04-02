import type { Server } from '@/lib/types'

export default function TokenMetrics({ server }: { server: Server }) {
  const toolCount = server.tools?.length || 0
  // Rough estimate: ~150 tokens per tool definition (name + description + schema)
  const estimatedTokens = toolCount * 150
  const grade = server.token_efficiency_grade !== 'unknown'
    ? server.token_efficiency_grade
    : estimatedTokens <= 750 ? 'A'
    : estimatedTokens <= 1500 ? 'B'
    : estimatedTokens <= 3000 ? 'C'
    : estimatedTokens <= 6000 ? 'D'
    : 'F'

  const gradeColor = grade === 'A' || grade === 'B' ? 'text-green'
    : grade === 'C' ? 'text-yellow'
    : 'text-red'

  const pctOf200k = ((estimatedTokens / 200000) * 100).toFixed(1)

  return (
    <div className="border border-border rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-text-primary">Token Efficiency</h3>
        <span className={`text-2xl font-bold ${gradeColor}`}>{grade}</span>
      </div>

      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-text-muted">Tools loaded</dt>
          <dd className="text-text-primary">{toolCount}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-muted">Est. context cost</dt>
          <dd className="text-text-primary">~{estimatedTokens.toLocaleString()} tokens</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-muted">% of 200K context</dt>
          <dd className={parseFloat(pctOf200k) > 10 ? 'text-red font-medium' : 'text-text-primary'}>
            {pctOf200k}%
          </dd>
        </div>
      </dl>

      {parseFloat(pctOf200k) > 10 && (
        <p className="text-xs text-yellow mt-3 border-t border-border pt-2">
          This server loads {toolCount} tools into context. Consider using selective tool loading if your client supports it.
        </p>
      )}
    </div>
  )
}
