import { describe, it, expect } from 'vitest'
import { claudeDesktopUsesConnector } from '@/components/server/InstallMatrix'

// Claude Desktop's claude_desktop_config.json is for local servers; a hosted
// remote server is added as a custom connector (issue #176).
describe('claudeDesktopUsesConnector', () => {
  const remote = {
    npm_package: null as string | null,
    pip_package: null as string | null,
    remote_url: 'https://mcp.example.com/mcp' as string | null,
    transport: ['http'] as string[],
    install_configs: {} as Record<string, unknown>,
  }

  it('is true for a remote-only server with no stored Desktop config', () => {
    expect(claudeDesktopUsesConnector(remote)).toBe(true)
  })

  it('is false when the server ships a package to run locally', () => {
    expect(claudeDesktopUsesConnector({ ...remote, npm_package: 'example-mcp' })).toBe(false)
  })

  it('is false for a local stdio server', () => {
    expect(claudeDesktopUsesConnector({ ...remote, remote_url: null, transport: ['stdio'] })).toBe(false)
  })

  it('is false when a real Desktop config is already stored', () => {
    const install_configs = { 'claude-desktop': { mcpServers: { x: { command: 'npx' } } } }
    expect(claudeDesktopUsesConnector({ ...remote, install_configs })).toBe(false)
  })

  it('is false without a URL to give the user', () => {
    expect(claudeDesktopUsesConnector({ ...remote, remote_url: null })).toBe(false)
  })
})
