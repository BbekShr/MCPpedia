/**
 * Simulated app window mockups for setup guides.
 * Pure CSS — no images or screenshots needed.
 */

export function MockWindow({ title, children, dark = false }: {
  title: string
  children: React.ReactNode
  dark?: boolean
}) {
  return (
    <div className={`rounded-lg border overflow-hidden text-xs ${dark ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-[#d0d7de]'}`}>
      {/* Title bar */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${dark ? 'bg-[#2d2d2d] border-[#333]' : 'bg-[#f6f8fa] border-[#d0d7de]'}`}>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <span className={`text-[11px] mx-auto ${dark ? 'text-[#999]' : 'text-[#656d76]'}`}>{title}</span>
      </div>
      {/* Content */}
      <div className="p-3">
        {children}
      </div>
    </div>
  )
}

export function MockSidebar({ items, active }: { items: string[]; active: string }) {
  return (
    <div className="w-32 border-r border-[#d0d7de] pr-2 space-y-0.5">
      {items.map(item => (
        <div
          key={item}
          className={`px-2 py-1 rounded text-[11px] ${
            item === active ? 'bg-[#0969da] text-white font-medium' : 'text-[#656d76]'
          }`}
        >
          {item}
        </div>
      ))}
    </div>
  )
}

export function MockButton({ children, primary = false }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <span className={`inline-block px-3 py-1 rounded text-[11px] font-medium border ${
      primary ? 'bg-[#0969da] text-white border-[#0550ae]' : 'bg-[#f6f8fa] text-[#24292f] border-[#d0d7de]'
    }`}>
      {children}
    </span>
  )
}

export function MockInput({ value, placeholder }: { value?: string; placeholder?: string }) {
  return (
    <span className="inline-block px-2 py-1 rounded border border-[#d0d7de] bg-white text-[11px] text-[#24292f] min-w-[120px]">
      {value || <span className="text-[#999]">{placeholder}</span>}
    </span>
  )
}

export function MockCode({ children, dark = false }: { children: string; dark?: boolean }) {
  return (
    <pre className={`p-2 rounded text-[10px] font-mono leading-relaxed overflow-x-auto ${
      dark ? 'bg-[#1e1e1e] text-[#d4d4d4]' : 'bg-[#f6f8fa] text-[#24292f]'
    }`}>
      {children}
    </pre>
  )
}

export function MockToolbar({ items }: { items: string[] }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-[#f6f8fa] border-b border-[#d0d7de] text-[11px] text-[#656d76]">
      {items.map((item, i) => (
        <span key={i}>{item}</span>
      ))}
    </div>
  )
}

// Specific mockups for each client

export function ClaudeDesktopSettingsMock({ step }: { step: 'profile' | 'developer' | 'config' }) {
  if (step === 'profile') {
    return (
      <MockWindow title="Claude">
        <div className="flex gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[#f0f2f5] rounded w-3/4" />
            <div className="h-3 bg-[#f0f2f5] rounded w-full" />
            <div className="h-3 bg-[#f0f2f5] rounded w-5/6" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-[#d0d7de] pt-3">
          <div className="w-7 h-7 rounded-full bg-[#0969da] flex items-center justify-center text-white text-[10px] font-bold">B</div>
          <div className="text-[11px]">
            <div className="text-[#24292f] font-medium">Your Name</div>
          </div>
          <div className="ml-auto">
            <div className="px-2 py-0.5 rounded bg-[#ddf4ff] text-[#0969da] text-[10px] font-medium ring-2 ring-[#0969da] ring-offset-1">
              ← Click here
            </div>
          </div>
        </div>
      </MockWindow>
    )
  }

  if (step === 'developer') {
    return (
      <MockWindow title="Settings">
        <div className="flex gap-3">
          <MockSidebar items={['General', 'Appearance', 'Developer']} active="Developer" />
          <div className="flex-1 space-y-3">
            <div className="text-[12px] font-medium text-[#24292f]">Developer Settings</div>
            <div className="space-y-2">
              <div className="text-[11px] text-[#656d76]">MCP Server Configuration</div>
              <div className="flex items-center gap-2">
                <MockButton primary>Edit Config</MockButton>
                <span className="text-[10px] text-[#0969da] ring-2 ring-[#0969da] ring-offset-1 px-1 rounded">← Click this</span>
              </div>
            </div>
          </div>
        </div>
      </MockWindow>
    )
  }

  // config
  return (
    <MockWindow title="claude_desktop_config.json" dark>
      <MockCode dark>{`{
  "mcpServers": {
    "your-server": {
      "command": "npx",
      "args": ["-y", "@package/name"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}`}</MockCode>
      <div className="mt-2 text-[10px] text-[#999] flex items-center gap-1">
        <span className="text-[#0969da]">↑</span> Paste the config from MCPpedia here
      </div>
    </MockWindow>
  )
}

export function ClaudeDesktopToolsMock() {
  return (
    <MockWindow title="Settings">
      <div className="flex gap-3">
        <MockSidebar items={['General', 'Appearance', 'Connectors']} active="Connectors" />
        <div className="flex-1 space-y-3">
          <div className="text-[12px] font-medium text-[#24292f]">Connectors</div>
          <div className="border border-[#d0d7de] rounded p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#28c840]" />
                <span className="text-[11px] font-medium text-[#24292f]">your-server</span>
              </div>
              <span className="text-[10px] text-[#28c840]">Connected</span>
            </div>
          </div>
          <span className="text-[10px] text-[#0969da] ring-2 ring-[#0969da] ring-offset-1 px-1 rounded">↑ Green dot = connected!</span>
        </div>
      </div>
    </MockWindow>
  )
}

export function CursorSettingsMock({ step }: { step: 'settings' | 'mcp' }) {
  if (step === 'settings') {
    return (
      <MockWindow title="Cursor Settings" dark>
        <div className="flex gap-3">
          <div className="w-28 border-r border-[#333] pr-2 space-y-1">
            {['General', 'Models', 'Features', 'MCP'].map(item => (
              <div key={item} className={`px-2 py-1 rounded text-[11px] ${item === 'MCP' ? 'bg-[#0969da] text-white' : 'text-[#999]'}`}>
                {item}
              </div>
            ))}
          </div>
          <div className="flex-1 text-[#d4d4d4]">
            <div className="text-[12px] font-medium mb-2">MCP Servers</div>
            <div className="border border-[#333] rounded p-2 text-[10px] text-[#999]">
              No servers configured
            </div>
            <div className="mt-2">
              <span className="px-2 py-1 bg-[#0969da] text-white text-[10px] rounded ring-2 ring-[#58a6ff] ring-offset-1 ring-offset-[#1e1e1e]">
                + Add MCP Server ← Click
              </span>
            </div>
          </div>
        </div>
      </MockWindow>
    )
  }

  return (
    <MockWindow title="Add MCP Server" dark>
      <div className="space-y-2 text-[#d4d4d4]">
        <div>
          <div className="text-[10px] text-[#999] mb-1">Server Name</div>
          <div className="px-2 py-1 bg-[#2d2d2d] border border-[#444] rounded text-[11px]">my-server</div>
        </div>
        <div>
          <div className="text-[10px] text-[#999] mb-1">Configuration (JSON)</div>
          <MockCode dark>{`{
  "command": "npx",
  "args": ["-y", "@package/name"]
}`}</MockCode>
        </div>
        <div className="text-[10px] text-[#58a6ff]">↑ Paste from MCPpedia server page</div>
      </div>
    </MockWindow>
  )
}

export function TerminalMock({ lines }: { lines: Array<{ prompt?: boolean; text: string; color?: string }> }) {
  return (
    <MockWindow title="Terminal" dark>
      <div className="space-y-0.5 font-mono">
        {lines.map((line, i) => (
          <div key={i} className="text-[11px]">
            {line.prompt && <span className="text-[#28c840]">$ </span>}
            <span style={{ color: line.color || '#d4d4d4' }}>{line.text}</span>
          </div>
        ))}
      </div>
    </MockWindow>
  )
}

export function VSCodeSettingsMock() {
  return (
    <MockWindow title="VS Code — Settings" dark>
      <div className="flex gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-[#2d2d2d] border border-[#444] rounded">
            <span className="text-[10px] text-[#999]">🔍</span>
            <span className="text-[11px] text-[#d4d4d4]">MCP</span>
          </div>
          <div className="border border-[#333] rounded p-2">
            <div className="text-[10px] text-[#999] mb-1">GitHub Copilot &gt; Chat: MCP Servers</div>
            <div className="text-[10px] text-[#58a6ff] underline cursor-pointer">Edit in settings.json</div>
          </div>
        </div>
      </div>
    </MockWindow>
  )
}
