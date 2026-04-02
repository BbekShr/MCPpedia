import type { Server } from '@/lib/types'
import { SCORE_WEIGHTS } from '@/lib/scoring'

function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = Math.round((score / max) * 100)
  const filled = Math.round((score / max) * 10)

  let color = 'bg-green'
  if (pct < 40) color = 'bg-red'
  else if (pct < 70) color = 'bg-yellow'

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-text-muted shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-sm ${i < filled ? color : 'bg-border'}`}
            />
          ))}
        </div>
        <span className="text-xs text-text-muted w-12 text-right">{score}/{max}</span>
      </div>
    </div>
  )
}

export default function ScoreCard({ server }: { server: Server }) {
  const total = server.score_total || 0
  const grade = total >= 80 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : total >= 20 ? 'D' : 'F'

  let gradeColor = 'text-green'
  if (grade === 'D' || grade === 'F') gradeColor = 'text-red'
  else if (grade === 'C') gradeColor = 'text-yellow'

  return (
    <div className="border border-border rounded-md p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text-primary">MCPpedia Score</h3>
        <div className="flex items-center gap-2">
          <span className={`text-3xl font-bold ${gradeColor}`}>{total}</span>
          <span className="text-sm text-text-muted">/100</span>
        </div>
      </div>

      <div className="space-y-2">
        <ScoreBar label="Security" score={server.score_security || 0} max={SCORE_WEIGHTS.security} />
        <ScoreBar label="Maintenance" score={server.score_maintenance || 0} max={SCORE_WEIGHTS.maintenance} />
        <ScoreBar label="Efficiency" score={server.score_efficiency || 0} max={SCORE_WEIGHTS.efficiency} />
        <ScoreBar label="Documentation" score={server.score_documentation || 0} max={SCORE_WEIGHTS.documentation} />
        <ScoreBar label="Compatibility" score={server.score_compatibility || 0} max={SCORE_WEIGHTS.compatibility} />
      </div>

      {server.score_computed_at && (
        <p className="text-xs text-text-muted mt-3">
          Scored {new Date(server.score_computed_at).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}
