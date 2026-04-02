'use client'

import { useState } from 'react'
import Link from 'next/link'

type Client = 'claude-desktop' | 'cursor' | 'claude-code' | 'vscode'

const CLIENTS: { id: Client; name: string; icon: string }[] = [
  { id: 'claude-desktop', name: 'Claude Desktop', icon: '🖥️' },
  { id: 'cursor', name: 'Cursor', icon: '⌨️' },
  { id: 'claude-code', name: 'Claude Code', icon: '💻' },
  { id: 'vscode', name: 'VS Code + Copilot', icon: '🔧' },
]

interface Step {
  title: string
  description: string
  gifPlaceholder: string // description of what the GIF should show
  code?: string
  tip?: string
}

const STEPS: Record<Client, Step[]> = {
  'claude-desktop': [
    {
      title: 'Open Claude Desktop settings',
      description: 'Click your profile icon in the bottom-left corner, then click "Settings".',
      gifPlaceholder: 'GIF: Clicking profile icon → Settings in Claude Desktop',
      tip: 'If you don\'t see Settings, make sure you\'re on the latest version of Claude Desktop.',
    },
    {
      title: 'Go to the Developer tab',
      description: 'In the Settings window, click "Developer" in the left sidebar.',
      gifPlaceholder: 'GIF: Navigating to Developer tab in Claude Desktop Settings',
    },
    {
      title: 'Click "Edit Config"',
      description: 'This opens your config file in your default text editor. The file is a JSON file that tells Claude Desktop which MCP servers to load.',
      gifPlaceholder: 'GIF: Clicking Edit Config button → config file opening in editor',
      code: `// Your config file is located at:

// macOS:
~/Library/Application Support/Claude/claude_desktop_config.json

// Windows:
%APPDATA%\\Claude\\claude_desktop_config.json`,
    },
    {
      title: 'Paste the server config',
      description: 'Go to any server page on MCPpedia, copy the install config, and paste it into your config file. If you already have other servers, merge the "mcpServers" section.',
      gifPlaceholder: 'GIF: Copying config from MCPpedia → pasting into config file',
      code: `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/folder"]
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-api-key"
      }
    }
  }
}`,
      tip: 'You can add multiple servers — just add more entries inside "mcpServers". Make sure the JSON is valid (no trailing commas).',
    },
    {
      title: 'Restart Claude Desktop',
      description: 'Close and reopen Claude Desktop. You should see a small hammer icon (🔨) in the chat input area — this means MCP servers are connected.',
      gifPlaceholder: 'GIF: Restarting Claude Desktop → seeing the hammer/tools icon appear',
      tip: 'If the hammer icon doesn\'t appear, check your config file for JSON syntax errors.',
    },
    {
      title: 'Test it!',
      description: 'Try asking Claude something that uses your server. For example, if you installed the Filesystem server, ask "List the files in my Documents folder."',
      gifPlaceholder: 'GIF: Asking Claude to use an MCP tool → seeing the result',
    },
  ],
  'cursor': [
    {
      title: 'Open Cursor settings',
      description: 'Press ⌘+, (Mac) or Ctrl+, (Windows/Linux) to open Settings.',
      gifPlaceholder: 'GIF: Opening Cursor settings with keyboard shortcut',
    },
    {
      title: 'Navigate to MCP settings',
      description: 'In the Settings search bar, type "MCP". Click on "Model Context Protocol" in the results.',
      gifPlaceholder: 'GIF: Searching for MCP in Cursor settings',
    },
    {
      title: 'Add a new MCP server',
      description: 'Click "Add new MCP server". Enter the server name and paste the config from MCPpedia.',
      gifPlaceholder: 'GIF: Adding new MCP server in Cursor → pasting config',
      code: `{
  "mcpServers": {
    "your-server": {
      "command": "npx",
      "args": ["-y", "package-name"]
    }
  }
}`,
    },
    {
      title: 'Restart Cursor',
      description: 'Restart Cursor to load the new server. The MCP tools should now be available in the AI chat.',
      gifPlaceholder: 'GIF: Restarting Cursor → using MCP tools',
    },
  ],
  'claude-code': [
    {
      title: 'Create a .mcp.json file',
      description: 'In the root of your project, create a file called .mcp.json. Claude Code automatically detects this file.',
      gifPlaceholder: 'GIF: Creating .mcp.json in terminal or editor',
      code: `# In your terminal:
touch .mcp.json`,
    },
    {
      title: 'Paste the server config',
      description: 'Copy the config from any MCPpedia server page and paste it into your .mcp.json file.',
      gifPlaceholder: 'GIF: Pasting config into .mcp.json',
      code: `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}`,
    },
    {
      title: 'Start Claude Code',
      description: 'Run claude in your terminal. It will automatically detect the .mcp.json and connect to the servers.',
      gifPlaceholder: 'GIF: Running claude in terminal → servers connecting',
      code: `# In your terminal:
claude`,
      tip: 'You can also add servers globally by editing ~/.claude/settings.json',
    },
  ],
  'vscode': [
    {
      title: 'Install GitHub Copilot',
      description: 'Open VS Code Extensions (⌘+Shift+X), search "GitHub Copilot", and install it. Sign in with your GitHub account.',
      gifPlaceholder: 'GIF: Installing GitHub Copilot extension in VS Code',
    },
    {
      title: 'Open MCP settings',
      description: 'Open Settings (⌘+,), search "MCP". Under GitHub Copilot, find the MCP configuration section.',
      gifPlaceholder: 'GIF: Finding MCP settings in VS Code',
    },
    {
      title: 'Add server configuration',
      description: 'Add the MCP server config. You may need to edit settings.json directly.',
      gifPlaceholder: 'GIF: Adding MCP server in VS Code settings.json',
      code: `// In settings.json:
{
  "github.copilot.chat.mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}`,
    },
    {
      title: 'Reload VS Code',
      description: 'Press ⌘+Shift+P → "Reload Window". The MCP server should now be available in Copilot Chat.',
      gifPlaceholder: 'GIF: Reloading VS Code → using MCP in Copilot Chat',
    },
  ],
}

function StepCard({ step, index, total }: { step: Step; index: number; total: number }) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Step header */}
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
        {/* GIF placeholder */}
        <div className="bg-bg-tertiary border border-border border-dashed rounded-md aspect-video flex items-center justify-center">
          <div className="text-center p-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted mx-auto mb-2">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
              <line x1="7" y1="2" x2="7" y2="22"/>
              <line x1="17" y1="2" x2="17" y2="22"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <line x1="2" y1="7" x2="7" y2="7"/>
              <line x1="2" y1="17" x2="7" y2="17"/>
              <line x1="17" y1="7" x2="22" y2="7"/>
              <line x1="17" y1="17" x2="22" y2="17"/>
            </svg>
            <p className="text-xs text-text-muted">{step.gifPlaceholder}</p>
            <p className="text-[10px] text-text-muted mt-1 italic">Coming soon — visual walkthrough</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-text-primary">{step.description}</p>

        {/* Code block */}
        {step.code && (
          <pre className="bg-code-bg border border-border rounded-md p-3 overflow-x-auto text-xs font-mono text-text-primary">
            {step.code}
          </pre>
        )}

        {/* Tip */}
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
  const steps = STEPS[client]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary mb-2">How to Set Up MCP Servers</h1>
      <p className="text-text-muted mb-8">
        A step-by-step visual guide. Works for any MCP server on MCPpedia.
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
          <StepCard key={i} step={step} index={i} total={steps.length} />
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
            <div className="px-4 py-3 border-t border-border text-text-muted">
              <ul className="list-disc list-inside space-y-1">
                <li>Check your config file for JSON syntax errors (missing commas, extra commas)</li>
                <li>Make sure Node.js is installed: run <code className="bg-code-bg px-1 rounded">node --version</code></li>
                <li>Try running the server command manually in your terminal to see error messages</li>
                <li>Check that the package name is correct on the MCPpedia server page</li>
              </ul>
            </div>
          </details>
          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary">
              &quot;Command not found: npx&quot;
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted">
              <p>You need Node.js installed. Download it from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">nodejs.org</a> (LTS version recommended). After installing, restart your terminal and try again.</p>
            </div>
          </details>
          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary">
              &quot;API key required&quot; or authentication errors
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted">
              <p>Some servers connect to external services (Slack, GitHub, Brave, etc.) that require API keys. Check the server page on MCPpedia for details on which keys you need and where to get them.</p>
            </div>
          </details>
          <details className="border border-border rounded-md">
            <summary className="px-4 py-3 cursor-pointer text-text-primary hover:bg-bg-tertiary">
              How do I add multiple servers?
            </summary>
            <div className="px-4 py-3 border-t border-border text-text-muted">
              <p>Add more entries inside the <code className="bg-code-bg px-1 rounded">&quot;mcpServers&quot;</code> object. Each server gets its own key:</p>
              <pre className="bg-code-bg border border-border rounded-md p-2 mt-2 text-xs font-mono overflow-x-auto">{`{
  "mcpServers": {
    "server-one": { "command": "npx", "args": [...] },
    "server-two": { "command": "npx", "args": [...] }
  }
}`}</pre>
            </div>
          </details>
        </div>
      </div>

      {/* Next steps */}
      <div className="mt-8 p-4 rounded-md bg-accent-subtle">
        <p className="text-sm font-medium text-text-primary mb-2">Ready to install a server?</p>
        <div className="flex gap-3">
          <Link href="/servers" className="text-sm text-accent hover:text-accent-hover">
            Browse all servers &rarr;
          </Link>
          <Link href="/best-for/developers" className="text-sm text-accent hover:text-accent-hover">
            Best for developers &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}
