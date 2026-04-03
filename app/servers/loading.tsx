export default function ServersLoading() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <div className="h-9 bg-bg-tertiary rounded w-full mb-6 animate-pulse" />
      <div className="h-9 bg-bg-tertiary rounded w-full mb-6 animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 bg-bg-tertiary rounded animate-pulse" style={{ animationDelay: `${i * 0.05}s` }} />
        ))}
      </div>
    </div>
  )
}
