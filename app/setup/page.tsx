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

          <details className="border border-border rounded-md" open>
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary font-medium">
              Nothing happened after restart (most common)
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted space-y-3">
              <p className="font-medium text-text-primary">Check these in order:</p>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <span className="font-bold text-accent shrink-0">1.</span>
                  <div>
                    <p className="font-medium text-text-primary">Did you fully quit and reopen?</p>
                    <p>Closing the window is NOT enough. You must <strong>quit the app completely</strong> (Cmd+Q on Mac, or right-click tray icon → Quit) then reopen it.</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="font-bold text-accent shrink-0">2.</span>
                  <div>
                    <p className="font-medium text-text-primary">Is your JSON valid?</p>
                    <p>Paste your config into <a href="https://jsonlint.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">jsonlint.com</a> to check. The most common errors:</p>
                    <pre className="bg-code-bg p-2 rounded mt-1 text-xs font-mono">{`// ❌ WRONG — trailing comma
{
  "mcpServers": {
    "server-one": { ... },  ← this comma breaks it
  }
}

// ✅ CORRECT — no trailing comma
{
  "mcpServers": {
    "server-one": { ... }
  }
}`}</pre>
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="font-bold text-accent shrink-0">3.</span>
                  <div>
                    <p className="font-medium text-text-primary">Is the config file in the right place?</p>
                    <p>Open a terminal and run this to check if your file exists:</p>
                    <pre className="bg-code-bg p-2 rounded mt-1 text-xs font-mono">{`# macOS — Claude Desktop
cat ~/Library/Application\\ Support/Claude/claude_desktop_config.json

# Windows — Claude Desktop
type %APPDATA%\\Claude\\claude_desktop_config.json`}</pre>
                    <p className="mt-1">If it says &quot;No such file&quot;, you saved it in the wrong location.</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="font-bold text-accent shrink-0">4.</span>
                  <div>
                    <p className="font-medium text-text-primary">Did you merge correctly with existing config?</p>
                    <p>If you already had servers, you need to add inside the existing <code className="bg-code-bg px-1 rounded">mcpServers</code> object, not create a new one:</p>
                    <pre className="bg-code-bg p-2 rounded mt-1 text-xs font-mono">{`// ❌ WRONG — two mcpServers objects
{
  "mcpServers": { "old-server": { ... } },
  "mcpServers": { "new-server": { ... } }
}

// ✅ CORRECT — both in one mcpServers
{
  "mcpServers": {
    "old-server": { ... },
    "new-server": { ... }
  }
}`}</pre>
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="font-bold text-accent shrink-0">5.</span>
                  <div>
                    <p className="font-medium text-text-primary">Is Node.js installed?</p>
                    <p>Run <code className="bg-code-bg px-1 rounded">node --version</code> in your terminal. If it says &quot;command not found&quot;, install Node.js from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">nodejs.org</a> (LTS version).</p>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary font-medium">
              Remote MCP server won&apos;t connect
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted space-y-2">
              <p>Remote servers connect over the internet instead of running locally. Two ways to set them up:</p>
              <p className="font-medium text-text-primary">Option A: Native remote (if your client supports it)</p>
              <pre className="bg-code-bg p-2 rounded mt-1 text-xs font-mono">{`{
  "mcpServers": {
    "server-name": {
      "url": "https://the-server-url.com/mcp",
      "transport": "streamable-http"
    }
  }
}`}</pre>
              <p className="font-medium text-text-primary mt-2">Option B: Via mcp-remote proxy (works everywhere)</p>
              <pre className="bg-code-bg p-2 rounded mt-1 text-xs font-mono">{`{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["mcp-remote", "https://the-server-url.com/mcp"]
    }
  }
}`}</pre>
              <p>If Option A doesn&apos;t work, try Option B. If neither works, the server might be down — use the &quot;Test This Server&quot; button on its MCPpedia page.</p>
            </div>
          </details>

          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary font-medium">
              OAuth popup appeared but authentication failed
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted space-y-2">
              <p>Some remote servers use OAuth for authentication. If the auth popup fails:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Make sure you have an account with the service</li>
                <li>Clear stale auth: <code className="bg-code-bg px-1 rounded">rm -rf ~/.mcp-auth</code> then restart</li>
                <li>Check if your company has CORS/SAML restrictions that block the auth flow</li>
              </ul>
            </div>
          </details>

          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary font-medium">
              &quot;Command not found: npx&quot; or &quot;npm ERR&quot;
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted space-y-2">
              <p>Install Node.js from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">nodejs.org</a> (LTS version, v18 or higher). After installing:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Restart your terminal</strong> (close and reopen)</li>
                <li>Verify: <code className="bg-code-bg px-1 rounded">node --version</code> should show v18+</li>
                <li>Verify: <code className="bg-code-bg px-1 rounded">npx --version</code> should work</li>
                <li>Then restart Claude Desktop / Cursor</li>
              </ul>
            </div>
          </details>

          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary font-medium">
              How to add multiple servers
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted">
              <p>Add more entries inside <code className="bg-code-bg px-1 rounded">mcpServers</code> — each server gets its own key:</p>
              <pre className="bg-code-bg p-2 rounded mt-1 text-xs font-mono">{`{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-api-key"
      }
    },
    "remote-server": {
      "command": "npx",
      "args": ["mcp-remote", "https://example.com/mcp"]
    }
  }
}`}</pre>
            </div>
          </details>

          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary font-medium">
              Still not working?
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted space-y-2">
              <p>Try running the server manually in your terminal to see the actual error:</p>
              <pre className="bg-code-bg p-2 rounded mt-1 text-xs font-mono">{`# For npm servers:
npx -y @modelcontextprotocol/server-filesystem /tmp

# For remote servers:
npx mcp-remote https://example.com/mcp`}</pre>
              <p>If you see an error message, search for it on the server&apos;s GitHub issues page, or ask in the MCPpedia discussion on the server&apos;s page.</p>
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
