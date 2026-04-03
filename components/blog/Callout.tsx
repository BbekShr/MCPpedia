const icons: Record<string, string> = {
  info: '💡',
  warning: '⚠️',
  tip: '🎯',
  fire: '🔥',
}

const styles: Record<string, string> = {
  info: 'border-accent/30 bg-accent/5',
  warning: 'border-yellow/30 bg-yellow/5',
  tip: 'border-green/30 bg-green/5',
  fire: 'border-red/30 bg-red/5',
}

export default function Callout({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warning' | 'tip' | 'fire'
  children: React.ReactNode
}) {
  return (
    <div className={`not-prose my-8 rounded-xl border-l-4 ${styles[type]} px-6 py-5`}>
      <div className="flex gap-3 items-start">
        <span className="text-xl shrink-0 mt-0.5">{icons[type]}</span>
        <div className="text-[15px] leading-relaxed text-text-primary [&>p]:mb-2 [&>p:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  )
}
