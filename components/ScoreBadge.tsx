/**
 * ScoreBadge — color-coded score + grade badge used across the site.
 *
 * Colors match the grading system:
 *   A (80–100): green
 *   B (60–79):  accent/blue
 *   C (40–59):  yellow
 *   D (20–39):  red
 *   F (0–19):   red
 */

function scoreGrade(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

function badgeStyles(score: number): string {
  if (score >= 80) return 'bg-green/10 text-green border-green/20'
  if (score >= 60) return 'bg-accent/10 text-accent border-accent/20'
  if (score >= 40) return 'bg-yellow/10 text-yellow border-yellow/20'
  return 'bg-red/10 text-red border-red/20'
}

interface Props {
  score: number
  /** "sm" for card badges, "md" for detail pages */
  size?: 'sm' | 'md'
  /** Show the grade letter alongside the number */
  showGrade?: boolean
}

export default function ScoreBadge({ score, size = 'sm', showGrade = true }: Props) {
  const grade = scoreGrade(score)
  const styles = badgeStyles(score)

  const sizeClasses = size === 'md'
    ? 'text-sm px-2.5 py-1 gap-1.5'
    : 'text-xs px-1.5 py-0.5 gap-1'

  return (
    <span
      className={`inline-flex items-center font-bold rounded border ${styles} ${sizeClasses}`}
      title={`MCPpedia Score: ${score}/100 (Grade ${grade}) — based on security, maintenance, docs, efficiency, and compatibility`}
      role="img"
      aria-label={`Score ${score} out of 100, grade ${grade}`}
    >
      {score}
      {showGrade && (
        <span className="font-semibold opacity-70">{grade}</span>
      )}
    </span>
  )
}
