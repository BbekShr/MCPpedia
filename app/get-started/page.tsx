'use client'

import { useState } from 'react'
import Link from 'next/link'

type Step = 'what' | 'client' | 'usecase' | 'result'

const CLIENTS = [
  { id: 'claude-desktop', name: 'Claude Desktop', desc: 'Anthropic\'s desktop app', icon: '🖥️' },
  { id: 'cursor', name: 'Cursor', desc: 'AI-powered code editor', icon: '⌨️' },
  { id: 'claude-code', name: 'Claude Code', desc: 'CLI tool for developers', icon: '💻' },
  { id: 'vscode', name: 'VS Code + Copilot', desc: 'With GitHub Copilot extension', icon: '🔧' },
  { id: 'other', name: 'Something else', desc: 'I\'ll figure it out', icon: '🔍' },
]

const USE_CASES = [
  { id: 'code', name: 'Write & manage code', desc: 'GitHub, files, databases', icon: '👩‍💻', servers: ['github', 'filesystem', 'postgres'] },
  { id: 'research', name: 'Search & research', desc: 'Web search, reading docs', icon: '🔎', servers: ['brave-search', 'fetch'] },
  { id: 'communicate', name: 'Communication', desc: 'Slack, email, messaging', icon: '💬', servers: ['slack'] },
  { id: 'automate', name: 'Automate tasks', desc: 'Browser, workflows, APIs', icon: '🤖', servers: ['puppeteer', 'fetch'] },
  { id: 'remember', name: 'AI memory', desc: 'Let AI remember things', icon: '🧠', servers: ['memory', 'sequential-thinking'] },
  { id: 'data', name: 'Work with data', desc: 'Databases, analytics', icon: '📊', servers: ['postgres', 'supabase'] },
]

const SERVER_INFO: Record<string, { name: string; tagline: string; difficulty: string }> = {
  'github': { name: 'GitHub', tagline: 'Manage repos, issues, and PRs', difficulty: 'Easy' },
  'filesystem': { name: 'Filesystem', tagline: 'Read and write files on your computer', difficulty: 'Easy' },
  'postgres': { name: 'PostgreSQL', tagline: 'Query databases directly', difficulty: 'Medium' },
  'brave-search': { name: 'Brave Search', tagline: 'Search the web privately', difficulty: 'Easy' },
  'fetch': { name: 'Fetch', tagline: 'Read any webpage or API', difficulty: 'Easy' },
  'slack': { name: 'Slack', tagline: 'Search messages and post to channels', difficulty: 'Medium' },
  'puppeteer': { name: 'Puppeteer', tagline: 'Control a web browser', difficulty: 'Medium' },
  'memory': { name: 'Memory', tagline: 'Give your AI persistent memory', difficulty: 'Easy' },
  'sequential-thinking': { name: 'Sequential Thinking', tagline: 'Better problem solving', difficulty: 'Easy' },
  'supabase': { name: 'Supabase', tagline: 'Manage Supabase projects', difficulty: 'Medium' },
}

const CLIENT_CONFIGS: Record<string, { path: string; instructions: string[] }> = {
  'claude-desktop': {
    path: 'Claude Desktop > Settings > Developer > Edit Config',
    instructions: [
      'Open Claude Desktop',
      'Click your profile icon → Settings',
      'Go to the Developer tab',
      'Click "Edit Config"',
      'Paste the config shown on the server page',
      'Save and restart Claude Desktop',
    ],
  },
  'cursor': {
    path: 'Cursor > Settings > MCP',
    instructions: [
      'Open Cursor',
      'Go to Settings (⌘/Ctrl + ,)',
      'Search for "MCP"',
      'Click "Add MCP Server"',
      'Paste the config from the server page',
      'Restart Cursor',
    ],
  },
  'claude-code': {
    path: 'Create .mcp.json in your project',
    instructions: [
      'Open your terminal',
      'Navigate to your project folder',
      'Create a file called .mcp.json',
      'Paste the config from the server page',
      'Claude Code will detect it automatically',
    ],
  },
  'vscode': {
    path: 'VS Code > Settings > MCP',
    instructions: [
      'Open VS Code',
      'Install the GitHub Copilot extension',
      'Open Settings (⌘/Ctrl + ,)',
      'Search for "MCP"',
      'Add the server config',
      'Reload VS Code',
    ],
  },
  'other': {
    path: 'Check your client\'s documentation',
    instructions: [
      'Most MCP clients support stdio transport',
      'Look for "MCP" or "Tools" in your client\'s settings',
      'Copy the config from the server page on MCPpedia',
    ],
  },
}

export default function GetStartedPage() {
  const [step, setStep] = useState<Step>('what')
  const [selectedClient, setSelectedClient] = useState('')
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([])

  const recommendedServers = [...new Set(
    selectedUseCases.flatMap(uc => USE_CASES.find(u => u.id === uc)?.servers || [])
  )]

  function toggleUseCase(id: string) {
    setSelectedUseCases(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {['what', 'client', 'usecase', 'result'].map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s ? 'bg-accent text-white' :
              ['what', 'client', 'usecase', 'result'].indexOf(step) > i ? 'bg-green text-white' :
              'bg-bg-tertiary text-text-muted'
            }`}>
              {['what', 'client', 'usecase', 'result'].indexOf(step) > i ? '✓' : i + 1}
            </div>
            {i < 3 && <div className="flex-1 h-0.5 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: What is MCP? */}
      {step === 'what' && (
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-4">What is MCP?</h1>

          <div className="space-y-6 text-sm text-text-primary leading-relaxed">
            <div className="border border-border rounded-md p-4 bg-bg-secondary">
              <p className="font-medium mb-2">The short version:</p>
              <p className="text-text-muted">
                MCP lets your AI assistant (like Claude) <strong className="text-text-primary">use tools</strong> — search the web, read files, manage GitHub repos, post to Slack, query databases, and hundreds more.
              </p>
            </div>

            <div>
              <p className="font-medium mb-2">How it works (in plain English):</p>
              <div className="space-y-3 pl-4 border-l-2 border-accent">
                <div>
                  <p className="font-medium">1. You install an MCP server</p>
                  <p className="text-text-muted">It&apos;s just a small program that runs on your computer. Takes 30 seconds.</p>
                </div>
                <div>
                  <p className="font-medium">2. Your AI app connects to it</p>
                  <p className="text-text-muted">Claude Desktop, Cursor, or whatever you use — it detects the server automatically.</p>
                </div>
                <div>
                  <p className="font-medium">3. Your AI can now use those tools</p>
                  <p className="text-text-muted">Ask Claude &quot;search my Slack for messages about the launch&quot; and it actually does it.</p>
                </div>
              </div>
            </div>

            <div className="border border-border rounded-md p-4">
              <p className="font-medium mb-2">Think of it like this:</p>
              <p className="text-text-muted">
                Your AI is smart but can&apos;t do anything in the real world. MCP servers are like <strong className="text-text-primary">hands</strong> — they let your AI reach out and interact with your tools, files, and services.
              </p>
            </div>

            <div>
              <p className="font-medium mb-2">Common questions:</p>
              <dl className="space-y-2">
                <div>
                  <dt className="text-text-primary">Is it safe?</dt>
                  <dd className="text-text-muted">Yes. Servers run on your computer. Your AI asks permission before doing anything. You control what it can access.</dd>
                </div>
                <div>
                  <dt className="text-text-primary">Is it free?</dt>
                  <dd className="text-text-muted">Most MCP servers are free and open source. Some connect to paid APIs (like Slack or AWS) that have their own pricing.</dd>
                </div>
                <div>
                  <dt className="text-text-primary">Do I need to code?</dt>
                  <dd className="text-text-muted">No. You just copy-paste a config. MCPpedia gives you the exact config for your app.</dd>
                </div>
              </dl>
            </div>
          </div>

          <button
            onClick={() => setStep('client')}
            className="mt-8 w-full px-4 py-3 rounded-md bg-accent text-white font-medium hover:bg-accent-hover transition-colors"
          >
            Got it — let&apos;s set one up
          </button>
        </div>
      )}

      {/* Step 2: Which client? */}
      {step === 'client' && (
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-2">What app do you use?</h1>
          <p className="text-text-muted mb-6">Which AI app do you want to add MCP servers to?</p>

          <div className="space-y-2">
            {CLIENTS.map(client => (
              <button
                key={client.id}
                onClick={() => { setSelectedClient(client.id); setStep('usecase') }}
                className={`w-full text-left p-4 border rounded-md transition-colors ${
                  selectedClient === client.id ? 'border-accent bg-accent/5' : 'border-border hover:bg-bg-tertiary'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{client.icon}</span>
                  <div>
                    <div className="font-medium text-text-primary">{client.name}</div>
                    <div className="text-sm text-text-muted">{client.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <button onClick={() => setStep('what')} className="mt-4 text-sm text-text-muted hover:text-text-primary">
            ← Back
          </button>
        </div>
      )}

      {/* Step 3: What do you want to do? */}
      {step === 'usecase' && (
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-2">What do you want your AI to do?</h1>
          <p className="text-text-muted mb-6">Pick one or more. We&apos;ll recommend the right servers.</p>

          <div className="grid grid-cols-2 gap-2">
            {USE_CASES.map(uc => (
              <button
                key={uc.id}
                onClick={() => toggleUseCase(uc.id)}
                className={`text-left p-3 border rounded-md transition-colors ${
                  selectedUseCases.includes(uc.id) ? 'border-accent bg-accent/5' : 'border-border hover:bg-bg-tertiary'
                }`}
              >
                <span className="text-xl">{uc.icon}</span>
                <div className="font-medium text-sm text-text-primary mt-1">{uc.name}</div>
                <div className="text-xs text-text-muted">{uc.desc}</div>
              </button>
            ))}
          </div>

          <button
            onClick={() => setStep('result')}
            disabled={selectedUseCases.length === 0}
            className="mt-6 w-full px-4 py-3 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            Show me what to install ({recommendedServers.length} server{recommendedServers.length !== 1 ? 's' : ''})
          </button>

          <button onClick={() => setStep('client')} className="mt-2 w-full text-sm text-text-muted hover:text-text-primary">
            ← Back
          </button>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 'result' && (
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-2">Your recommended setup</h1>
          <p className="text-text-muted mb-6">
            Install these {recommendedServers.length} servers for{' '}
            <strong className="text-text-primary">{CLIENTS.find(c => c.id === selectedClient)?.name}</strong>
          </p>

          {/* How to install */}
          <div className="border border-border rounded-md p-4 mb-6 bg-bg-secondary">
            <h3 className="font-medium text-text-primary mb-2">How to install (once):</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-text-muted">
              {CLIENT_CONFIGS[selectedClient]?.instructions.map((inst, i) => (
                <li key={i}>{inst}</li>
              ))}
            </ol>
          </div>

          {/* Recommended servers */}
          <div className="space-y-3 mb-6">
            {recommendedServers.map((slug, i) => {
              const info = SERVER_INFO[slug]
              if (!info) return null
              return (
                <Link
                  key={slug}
                  href={`/s/${slug}`}
                  className="flex items-center gap-4 p-4 border border-border rounded-md hover:bg-bg-tertiary transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-text-primary">{info.name}</div>
                    <div className="text-sm text-text-muted">{info.tagline}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    info.difficulty === 'Easy' ? 'bg-green/10 text-green' : 'bg-yellow/10 text-yellow'
                  }`}>
                    {info.difficulty}
                  </span>
                </Link>
              )
            })}
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm text-text-muted mb-2">
              Click each server above to get the exact config to paste. Come back here anytime.
            </p>
            <div className="flex gap-3">
              <Link
                href="/servers"
                className="text-sm text-accent hover:text-accent-hover"
              >
                Browse all servers →
              </Link>
              <Link
                href="/guides/what-is-mcp"
                className="text-sm text-accent hover:text-accent-hover"
              >
                Read the full guide →
              </Link>
            </div>
          </div>

          <button onClick={() => setStep('usecase')} className="mt-4 text-sm text-text-muted hover:text-text-primary">
            ← Change my picks
          </button>
        </div>
      )}
    </div>
  )
}
