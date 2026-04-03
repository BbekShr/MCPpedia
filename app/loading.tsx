export default function Loading() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-12">
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-bg-tertiary rounded w-1/3" />
        <div className="h-4 bg-bg-tertiary rounded w-2/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
          <div className="h-32 bg-bg-tertiary rounded" />
          <div className="h-32 bg-bg-tertiary rounded" />
          <div className="h-32 bg-bg-tertiary rounded" />
          <div className="h-32 bg-bg-tertiary rounded" />
        </div>
      </div>
    </div>
  )
}
