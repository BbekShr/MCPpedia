export default function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose my-10 py-6 border-y border-border">
      <p className="text-xl md:text-2xl font-semibold text-text-primary text-center leading-snug max-w-xl mx-auto tracking-tight">
        {children}
      </p>
    </div>
  )
}
