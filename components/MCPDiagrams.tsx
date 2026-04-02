/**
 * Visual CSS diagrams explaining how MCP works.
 * No images — pure HTML/CSS rendered as visual explanations.
 */

export function HowMCPWorksDiagram() {
  return (
    <div className="border border-border rounded-lg p-5 bg-bg-secondary">
      <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
        {/* You */}
        <div className="text-center shrink-0">
          <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-2">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div className="text-xs font-medium text-text-primary">You</div>
          <div className="text-[10px] text-text-muted">&quot;Search my Slack&quot;</div>
        </div>

        {/* Arrow */}
        <div className="hidden md:block text-text-muted">
          <svg width="40" height="20" viewBox="0 0 40 20">
            <line x1="0" y1="10" x2="32" y2="10" stroke="var(--border)" strokeWidth="2"/>
            <polygon points="32,5 40,10 32,15" fill="var(--accent)"/>
          </svg>
        </div>
        <div className="md:hidden text-text-muted">
          <svg width="20" height="30" viewBox="0 0 20 30">
            <line x1="10" y1="0" x2="10" y2="22" stroke="var(--border)" strokeWidth="2"/>
            <polygon points="5,22 10,30 15,22" fill="var(--accent)"/>
          </svg>
        </div>

        {/* AI App */}
        <div className="text-center shrink-0">
          <div className="w-14 h-14 rounded-xl bg-bg border-2 border-accent flex items-center justify-center mx-auto mb-2 shadow-[var(--shadow-md)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div className="text-xs font-medium text-text-primary">AI App</div>
          <div className="text-[10px] text-text-muted">Claude, Cursor, etc.</div>
        </div>

        {/* Arrow */}
        <div className="hidden md:block text-text-muted">
          <svg width="40" height="20" viewBox="0 0 40 20">
            <line x1="0" y1="10" x2="32" y2="10" stroke="var(--border)" strokeWidth="2" strokeDasharray="4"/>
            <polygon points="32,5 40,10 32,15" fill="var(--green)"/>
          </svg>
          <div className="text-[9px] text-text-muted text-center -mt-0.5">MCP</div>
        </div>
        <div className="md:hidden text-text-muted text-center">
          <svg width="20" height="30" viewBox="0 0 20 30">
            <line x1="10" y1="0" x2="10" y2="22" stroke="var(--border)" strokeWidth="2" strokeDasharray="4"/>
            <polygon points="5,22 10,30 15,22" fill="var(--green)"/>
          </svg>
          <div className="text-[9px] text-text-muted -mt-1">MCP</div>
        </div>

        {/* MCP Server */}
        <div className="text-center shrink-0">
          <div className="w-14 h-14 rounded-xl bg-green/10 border-2 border-green flex items-center justify-center mx-auto mb-2">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5">
              <rect x="2" y="2" width="20" height="8" rx="2"/>
              <rect x="2" y="14" width="20" height="8" rx="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6"/>
              <line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
          </div>
          <div className="text-xs font-medium text-text-primary">MCP Server</div>
          <div className="text-[10px] text-text-muted">Runs on your machine</div>
        </div>

        {/* Arrow */}
        <div className="hidden md:block text-text-muted">
          <svg width="40" height="20" viewBox="0 0 40 20">
            <line x1="0" y1="10" x2="32" y2="10" stroke="var(--border)" strokeWidth="2"/>
            <polygon points="32,5 40,10 32,15" fill="var(--yellow)"/>
          </svg>
        </div>
        <div className="md:hidden text-text-muted">
          <svg width="20" height="30" viewBox="0 0 20 30">
            <line x1="10" y1="0" x2="10" y2="22" stroke="var(--border)" strokeWidth="2"/>
            <polygon points="5,22 10,30 15,22" fill="var(--yellow)"/>
          </svg>
        </div>

        {/* External Service */}
        <div className="text-center shrink-0">
          <div className="w-14 h-14 rounded-xl bg-yellow/10 border-2 border-yellow flex items-center justify-center mx-auto mb-2">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="1.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div className="text-xs font-medium text-text-primary">Slack, GitHub, etc.</div>
          <div className="text-[10px] text-text-muted">External service</div>
        </div>
      </div>
    </div>
  )
}

export function BeforeAfterDiagram() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Before */}
      <div className="border border-red/30 rounded-lg p-4 bg-red/5">
        <div className="text-xs font-semibold text-red mb-3 uppercase tracking-wide">Without MCP</div>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-lg bg-bg border border-border flex items-center justify-center shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <div className="text-xs">
              <div className="font-medium text-text-primary">You ask Claude:</div>
              <div className="text-text-muted italic">&quot;What did my team discuss on Slack today?&quot;</div>
            </div>
          </div>
          <div className="flex items-start gap-2 pl-2">
            <div className="text-red text-sm mt-0.5">&#10007;</div>
            <div className="text-xs text-text-muted">
              Claude says: &quot;I don&apos;t have access to your Slack. You&apos;ll need to copy-paste the messages here.&quot;
            </div>
          </div>
        </div>
      </div>

      {/* After */}
      <div className="border border-green/30 rounded-lg p-4 bg-green/5">
        <div className="text-xs font-semibold text-green mb-3 uppercase tracking-wide">With MCP</div>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-lg bg-bg border border-border flex items-center justify-center shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <div className="text-xs">
              <div className="font-medium text-text-primary">You ask Claude:</div>
              <div className="text-text-muted italic">&quot;What did my team discuss on Slack today?&quot;</div>
            </div>
          </div>
          <div className="flex items-start gap-2 pl-2">
            <div className="text-green text-sm mt-0.5">&#10003;</div>
            <div className="text-xs text-text-muted">
              Claude uses <strong className="text-text-primary">Slack MCP Server</strong> → searches messages → summarizes the discussions for you.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WhatYouCanDoDiagram() {
  const examples = [
    { icon: '💬', tool: 'Slack MCP', ask: '"Search Slack for launch updates"', result: 'Finds and summarizes relevant messages' },
    { icon: '📁', tool: 'Filesystem MCP', ask: '"Organize my Downloads folder"', result: 'Reads, moves, and renames your files' },
    { icon: '🐙', tool: 'GitHub MCP', ask: '"Create a PR for my changes"', result: 'Creates the pull request on GitHub' },
    { icon: '🔍', tool: 'Brave Search MCP', ask: '"Find the latest React docs"', result: 'Searches the web and returns results' },
    { icon: '🗄️', tool: 'Postgres MCP', ask: '"Show me users who signed up today"', result: 'Queries your database directly' },
  ]

  return (
    <div className="space-y-2">
      {examples.map((ex, i) => (
        <div key={i} className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-bg-secondary transition-colors">
          <span className="text-xl shrink-0">{ex.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">{ex.tool}</span>
            </div>
            <div className="text-xs text-text-primary italic truncate">{ex.ask}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" className="shrink-0">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
          <div className="text-xs text-green font-medium shrink-0 hidden sm:block max-w-[180px] truncate">{ex.result}</div>
        </div>
      ))}
    </div>
  )
}

export function SecurityDiagram() {
  return (
    <div className="border border-border rounded-lg p-4 bg-bg-secondary">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-green/10 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div>
          <div className="text-sm font-medium text-text-primary">You&apos;re always in control</div>
          <div className="text-xs text-text-muted">MCP servers only do what you allow</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded bg-bg border border-border text-center">
          <div className="text-lg mb-1">🏠</div>
          <div className="text-[10px] font-medium text-text-primary">Runs locally</div>
          <div className="text-[9px] text-text-muted">On your computer</div>
        </div>
        <div className="p-2 rounded bg-bg border border-border text-center">
          <div className="text-lg mb-1">🔒</div>
          <div className="text-[10px] font-medium text-text-primary">You approve</div>
          <div className="text-[9px] text-text-muted">Every tool use</div>
        </div>
        <div className="p-2 rounded bg-bg border border-border text-center">
          <div className="text-lg mb-1">👁️</div>
          <div className="text-[10px] font-medium text-text-primary">Open source</div>
          <div className="text-[9px] text-text-muted">See all the code</div>
        </div>
      </div>
    </div>
  )
}
