'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ClaudeDesktopSettingsMock,
  ClaudeDesktopToolsMock,
  CursorSettingsMock,
  TerminalMock,
  VSCodeSettingsMock,
  MockWindow,
  MockCode,
} from '@/components/MockWindow'

type Client = 'claude-desktop' | 'cursor' | 'claude-code' | 'vscode'

const CLIENTS: { id: Client; name: string; icon: string }[] = [
  { id: 'claude-desktop', name: 'Claude Desktop', icon: '🖥️' },
  { id: 'cursor', name: 'Cursor', icon: '⌨️' },
  { id: 'claude-code', name: 'Claude Code', icon: '💻' },
  { id: 'vscode', name: 'VS Code', icon: '🔧' },
]

interface Step {
  title: string
  description: string
  visual: React.ReactNode
  code?: string
  tip?: string
}

function getSteps(client: Client): Step[] {
  if (client === 'claude-desktop') {
    return [
      {
        title: 'Open Settings',
        description: 'Click your profile icon in the bottom-left corner of Claude Desktop, then click Settings.',
        visual: <ClaudeDesktopSettingsMock step="profile" />,
      },
      {
        title: 'Go to Developer tab',
        description: 'In the Settings window, click "Developer" in the left sidebar, then click "Edit Config".',
        visual: <ClaudeDesktopSettingsMock step="developer" />,
        tip: 'If you don\'t see the Developer tab, update Claude Desktop to the latest version.',
      },
      {
        title: 'Paste the server config',
        description: 'Your config file opens in a text editor. Paste the config from any MCPpedia server page.',
        visual: <ClaudeDesktopSettingsMock step="config" />,
        code: `// Config file location:
// macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
// Windows: %APPDATA%\\Claude\\claude_desktop_config.json`,
        tip: 'You can add multiple servers — just add more entries inside "mcpServers". Make sure the JSON has no trailing commas.',
      },
      {
        title: 'Restart and verify',
        description: 'Close and reopen Claude Desktop. Look for the hammer icon (🔨) in the chat input — that means MCP tools are connected!',
        visual: <ClaudeDesktopToolsMock />,
        tip: 'If the 🔨 icon doesn\'t appear, there\'s likely a JSON syntax error in your config. Try pasting your config into jsonlint.com to check.',
      },
    ]
  }

  if (client === 'cursor') {
    return [
      {
        title: 'Open Cursor Settings',
        description: 'Press ⌘+, (Mac) or Ctrl+, (Windows). Navigate to the MCP section in the sidebar.',
        visual: <CursorSettingsMock step="settings" />,
      },
      {
        title: 'Add MCP Server',
        description: 'Click "Add MCP Server". Enter the server name and paste the config from MCPpedia.',
        visual: <CursorSettingsMock step="mcp" />,
        tip: 'The server name can be anything — it\'s just a label. Use something short like "github" or "slack".',
      },
      {
        title: 'Restart Cursor',
        description: 'Restart Cursor to load the new server. The MCP tools will be available in the AI chat panel.',
        visual: (
          <TerminalMock lines={[
            { text: 'MCP server "github" connected', color: '#28c840' },
            { text: '6 tools available', color: '#28c840' },
            { text: '' },
            { text: 'Ready to use!', color: '#58a6ff' },
          ]} />
        ),
      },
    ]
  }

  if (client === 'claude-code') {
    return [
      {
        title: 'Create .mcp.json in your project',
        description: 'In the root of your project directory, create a file called .mcp.json. Claude Code detects this automatically.',
        visual: (
          <TerminalMock lines={[
            { prompt: true, text: 'cd ~/my-project' },
            { prompt: true, text: 'touch .mcp.json' },
            { prompt: true, text: 'code .mcp.json  # or your editor' },
          ]} />
        ),
      },
      {
        title: 'Paste the server config',
        description: 'Copy the install config from any MCPpedia server page and paste it into .mcp.json.',
        visual: (
          <MockWindow title=".mcp.json" dark>
            <MockCode dark>{`{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}`}</MockCode>
          </MockWindow>
        ),
        tip: 'The "." at the end means the current directory. Change it to the folder path you want to give access to.',
      },
      {
        title: 'Start Claude Code',
        description: 'Run `claude` in your terminal. It will automatically detect .mcp.json and connect to the servers.',
        visual: (
          <TerminalMock lines={[
            { prompt: true, text: 'claude' },
            { text: '' },
            { text: '  Claude Code v4.2.0', color: '#58a6ff' },
            { text: '  MCP: filesystem connected (7 tools)', color: '#28c840' },
            { text: '' },
            { text: '  How can I help?', color: '#d4d4d4' },
            { prompt: true, text: 'List the files in this project' },
          ]} />
        ),
        tip: 'For global servers (not project-specific), add them to ~/.claude/settings.json instead.',
      },
    ]
  }

  // vscode
  return [
    {
      title: 'Install GitHub Copilot',
      description: 'Open Extensions (⌘+Shift+X), search "GitHub Copilot", install it, and sign in with your GitHub account.',
      visual: (
        <MockWindow title="VS Code — Extensions" dark>
          <div className="flex items-center gap-2 px-2 py-1 bg-[#2d2d2d] border border-[#444] rounded mb-2">
            <span className="text-[10px] text-[#999]">🔍</span>
            <span className="text-[11px] text-[#d4d4d4]">GitHub Copilot</span>
          </div>
          <div className="flex items-center gap-3 p-2 bg-[#2d2d2d] rounded">
            <div className="w-10 h-10 rounded bg-[#0969da] flex items-center justify-center text-white text-lg">✦</div>
            <div>
              <div className="text-[11px] text-[#d4d4d4] font-medium">GitHub Copilot</div>
              <div className="text-[10px] text-[#999]">GitHub</div>
            </div>
            <span className="ml-auto px-2 py-0.5 bg-[#0969da] text-white text-[10px] rounded">Install</span>
          </div>
        </MockWindow>
      ),
    },
    {
      title: 'Open MCP settings',
      description: 'Open Settings (⌘+,), search "MCP". Click "Edit in settings.json" under GitHub Copilot > Chat: MCP Servers.',
      visual: <VSCodeSettingsMock />,
    },
    {
      title: 'Add server configuration',
      description: 'Add the MCP server config to your settings.json file.',
      visual: (
        <MockWindow title="settings.json" dark>
          <MockCode dark>{`{
  "github.copilot.chat.mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."
      ]
    }
  }
}`}</MockCode>
          <div className="mt-1 text-[10px] text-[#58a6ff]">↑ Paste config from MCPpedia server page</div>
        </MockWindow>
      ),
    },
    {
      title: 'Reload and use',
      description: 'Press ⌘+Shift+P → "Reload Window". The MCP tools are now available in Copilot Chat.',
      visual: (
        <TerminalMock lines={[
          { text: '> Developer: Reload Window', color: '#58a6ff' },
          { text: '' },
          { text: 'MCP server "filesystem" connected', color: '#28c840' },
          { text: '7 tools available in Copilot Chat', color: '#28c840' },
        ]} />
      ),
    },
  ]
}

function StepCard({ step, index, total }: { step: Step; index: number; total: number }) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-bg-secondary px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <h3 className="font-medium text-text-primary text-sm">{step.title}</h3>
          <span className="text-xs text-text-muted ml-auto">Step {index + 1} of {total}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Visual mockup */}
        <div className="max-w-md">
          {step.visual}
        </div>

        <p className="text-sm text-text-primary">{step.description}</p>

        {step.code && (
          <pre className="bg-code-bg border border-border rounded-md p-3 overflow-x-auto text-xs font-mono text-text-primary">
            {step.code}
          </pre>
        )}

        {step.tip && (
          <div className="flex gap-2 p-3 rounded-md bg-accent-subtle text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <p className="text-text-muted text-xs">{step.tip}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SetupPage() {
  const [client, setClient] = useState<Client>('claude-desktop')
  const steps = getSteps(client)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary mb-2">How to Set Up MCP Servers</h1>
      <p className="text-text-muted mb-8">
        Visual step-by-step guide. Works for any MCP server on MCPpedia.
      </p>

      {/* Client picker */}
      <div className="mb-8">
        <label className="text-sm font-medium text-text-primary block mb-3">Which app are you using?</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {CLIENTS.map(c => (
            <button
              key={c.id}
              onClick={() => setClient(c.id)}
              className={`p-3 border rounded-md text-sm text-center transition-all ${
                client === c.id
                  ? 'border-accent bg-accent-subtle text-accent font-medium'
                  : 'border-border text-text-muted hover:border-accent/30 hover:bg-bg-tertiary'
              }`}
            >
              <span className="text-xl block mb-1">{c.icon}</span>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step, i) => (
          <StepCard key={`${client}-${i}`} step={step} index={i} total={steps.length} />
        ))}
      </div>

      {/* Troubleshooting */}
      <div className="mt-10 border-t border-border pt-8">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Troubleshooting</h2>
        <div className="space-y-3 text-sm">
          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary">
              Server not showing up after restart
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted space-y-1">
              <p>Check your config file for JSON syntax errors. Common issues:</p>
              <ul className="list-disc list-inside">
                <li>Trailing comma after the last entry</li>
                <li>Missing quotes around strings</li>
                <li>Wrong file — make sure you&apos;re editing the right config</li>
              </ul>
              <p className="mt-2">Try running the server manually to see errors:</p>
              <pre className="bg-code-bg p-2 rounded mt-1 text-xs font-mono">npx -y @modelcontextprotocol/server-filesystem /tmp</pre>
            </div>
          </details>
          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary">
              &quot;Command not found: npx&quot;
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted">
              <p>Install Node.js from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">nodejs.org</a> (LTS version). Then restart your terminal.</p>
            </div>
          </details>
          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary">
              API key / authentication errors
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted">
              <p>Some servers need API keys. Check the server page on MCPpedia — it shows which env vars you need and where to get the keys.</p>
            </div>
          </details>
          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary">
              How to add multiple servers
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted">
              <p>Add more entries inside <code className="bg-code-bg px-1 rounded">mcpServers</code>:</p>
              <pre className="bg-code-bg p-2 rounded mt-1 text-xs font-mono">{`{
  "mcpServers": {
    "server-one": { "command": "npx", "args": [...] },
    "server-two": { "command": "npx", "args": [...] }
  }
}`}</pre>
            </div>
          </details>
        </div>
      </div>

      <div className="mt-8 p-4 rounded-md bg-accent-subtle">
        <p className="text-sm font-medium text-text-primary mb-2">Ready to install a server?</p>
        <div className="flex gap-3">
          <Link href="/servers" className="text-sm text-accent hover:text-accent-hover">Browse all servers &rarr;</Link>
          <Link href="/best-for/developers" className="text-sm text-accent hover:text-accent-hover">Best for developers &rarr;</Link>
        </div>
      </div>
    </div>
  )
}
