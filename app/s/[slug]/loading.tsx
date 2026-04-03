export default function ServerDetailLoading() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      {/* Header skeleton */}
      <div className="animate-pulse mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-bg-tertiary" />
          <div className="h-7 w-48 bg-bg-tertiary rounded" />
        </div>
        <div className="h-4 w-80 bg-bg-tertiary rounded mb-3" />
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-bg-tertiary rounded" />
          <div className="h-5 w-16 bg-bg-tertiary rounded" />
          <div className="h-5 w-20 bg-bg-tertiary rounded" />
        </div>
      </div>

      {/* Two-column skeleton */}
      <div className="flex gap-8">
        <div className="flex-1 space-y-6 animate-pulse">
          <div className="h-40 bg-bg-tertiary rounded-md" />
          <div className="h-64 bg-bg-tertiary rounded-md" />
          <div className="h-32 bg-bg-tertiary rounded-md" />
        </div>
        <div className="hidden lg:block w-72 animate-pulse space-y-4">
          <div className="h-32 bg-bg-tertiary rounded-md" />
          <div className="h-48 bg-bg-tertiary rounded-md" />
          <div className="h-32 bg-bg-tertiary rounded-md" />
        </div>
      </div>
    </div>
  )
}
