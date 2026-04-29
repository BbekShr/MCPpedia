import HeroSearch from './HeroSearch'

interface HeroStats {
  total_servers: number
  official_count: number
  open_cves: number
  servers_with_open_advisories: number
}

function HeroBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.4 }}
    >
      <defs>
        <pattern id="home-gridpat" width={48} height={48} patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="var(--border)" strokeWidth={0.5} />
        </pattern>
        <radialGradient id="home-gridfade" cx="50%" cy="0%" r="70%">
          <stop offset="0%" stopColor="white" stopOpacity={0} />
          <stop offset="100%" stopColor="var(--bg)" stopOpacity={1} />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#home-gridpat)" />
      <rect width="100%" height="100%" fill="url(#home-gridfade)" />
    </svg>
  )
}

function TrustTicker({ stats }: { stats: HeroStats }) {
  const items = [
    { label: 'Servers indexed', value: stats.total_servers.toLocaleString() },
    { label: 'Open CVEs', value: stats.open_cves.toLocaleString(), alert: stats.open_cves > 0 },
    { label: 'Official publishers', value: stats.official_count.toLocaleString() },
    {
      label: 'Servers with open advisories',
      value: stats.servers_with_open_advisories.toLocaleString(),
      alert: stats.servers_with_open_advisories > 0,
    },
  ]
  return (
    <div
      className="backdrop-blur"
      style={{
        borderTop: '1px solid var(--border-muted)',
        background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
      }}
    >
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-3 grid grid-cols-2 md:grid-cols-4 gap-y-3">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={`flex flex-col gap-0.5 px-3 min-w-0 ${
              i % 2 !== 0 ? 'border-l border-border-muted' : ''
            }${i === 2 ? ' md:border-l md:border-border-muted' : ''}`}
          >
            <div
              className="text-xl md:text-2xl font-bold tabular-nums"
              style={{ color: it.alert ? 'var(--red)' : 'var(--text)' }}
            >
              {it.value}
            </div>
            <div className="text-xs text-text-muted leading-tight">{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Hero({ stats }: { stats: HeroStats }) {
  return (
    <section
      className="relative"
      style={{ background: 'var(--hero-gradient)' }}
    >
      <HeroBackdrop />
      <div className="relative max-w-[960px] mx-auto px-4 md:px-6 pt-16 md:pt-[72px] pb-12 md:pb-14 text-center">
        <div
          className="inline-flex items-center gap-2 mb-4 px-2.5 py-1 rounded-full text-xs text-text-muted backdrop-blur"
          style={{
            background: 'color-mix(in srgb, var(--bg-secondary) 80%, transparent)',
            border: '1px solid var(--border-muted)',
          }}
        >
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              background: 'var(--green)',
              boxShadow: '0 0 0 3px color-mix(in srgb, var(--green) 22%, transparent)',
            }}
          />
          The open catalog for Model Context Protocol servers
        </div>

        <h1 className="m-0 text-4xl md:text-5xl font-bold text-text-primary tracking-tight leading-[1.1]">
          Find an MCP server
          <br />
          <span className="text-accent">you can actually trust.</span>
        </h1>

        <p className="mt-4 mx-auto max-w-[560px] text-base md:text-lg text-text-muted">
          Every server is scored on security, maintenance, token efficiency, documentation, and
          compatibility — so you can pick one and move on.
        </p>

        <HeroSearch totalServers={stats.total_servers} />
      </div>

      <TrustTicker stats={stats} />
    </section>
  )
}
