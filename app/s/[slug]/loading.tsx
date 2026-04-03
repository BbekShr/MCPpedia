export default function ServerDetailLoading() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <div className="animate-pulse space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-bg-tertiary rounded-md" />
          <div className="h-7 bg-bg-tertiary rounded w-48" />
        </div>
        <div className="h-4 bg-bg-tertiary rounded w-96" />
        <div className="flex gap-2">
          <div className="h-5 bg-bg-tertiary rounded w-16" />
          <div className="h-5 bg-bg-tertiary rounded w-20" />
          <div className="h-5 bg-bg-tertiary rounded w-24" />
        </div>

        {/* Score card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 bg-bg-tertiary rounded" />
          <div className="space-y-4">
            <div className="h-28 bg-bg-tertiary rounded" />
            <div className="h-16 bg-bg-tertiary rounded" />
          </div>
        </div>

        {/* Content sections */}
        <div className="h-40 bg-bg-tertiary rounded" />
        <div className="h-32 bg-bg-tertiary rounded" />
        <div className="h-64 bg-bg-tertiary rounded" />
      </div>
    </div>
  )
}
