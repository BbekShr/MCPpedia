import { describe, it, expect } from 'vitest'
import { extractNpmPackage, extractToolsWithRegex } from '@/bots/lib/readme-extract'

describe('extractNpmPackage', () => {
  it('reads a plain and a scoped npx package', () => {
    expect(extractNpmPackage('Run `npx -y my-mcp-server`')).toBe('my-mcp-server')
    expect(extractNpmPackage('npx @acme/mcp-widget')).toBe('@acme/mcp-widget')
  })

  it('does not take the scheme of a github: install spec as the package (#186)', () => {
    // caption-checker's README runs straight from GitHub; the bare `github`
    // used to be stored and pulled in the unrelated `github` package's
    // 57.8k weekly downloads and OSV results.
    expect(extractNpmPackage('npx -y github:markksantos/caption-checker --mcp')).toBeNull()
    expect(extractNpmPackage('npm install github:acme/widget')).toBeNull()
  })

  it('keeps looking past a github: spec for a real package later in the README', () => {
    const readme = 'npx -y github:acme/widget\n\nOr from npm:\n\nnpx -y acme-widget-mcp'
    expect(extractNpmPackage(readme)).toBe('acme-widget-mcp')
  })

  it('still skips denylisted toolchain packages', () => {
    expect(extractNpmPackage('npm install -g pnpm')).toBeNull()
  })
})

describe('extractToolsWithRegex', () => {
  it('does not turn README section headings into tools (#176, #186)', () => {
    const readme = [
      '## Study',
      '',
      '[`study/`](study) holds the code and data behind the study.',
      '',
      '## License',
      '',
      'MIT © [Mark Studios](https://www.markstudios.com), a studio.',
      '',
      '### Connect',
      '',
      'Point your client at the endpoint below.',
    ].join('\n')
    expect(extractToolsWithRegex(readme).tools).toEqual([])
  })

  it('does not take a bold Title Case label as a tool', () => {
    expect(extractToolsWithRegex('**Gates** - every write needs approval').tools).toEqual([])
  })

  it('still extracts identifier-shaped tools from lists and server.tool() calls', () => {
    const readme = [
      '- `arcmira_describe` - Describe the account and its monitors',
      '- **searchRepos**: Search repositories by keyword',
      "server.tool('get_issue', 'Fetch one issue by number')",
    ].join('\n')
    expect(extractToolsWithRegex(readme).tools.map(t => t.name)).toEqual([
      'arcmira_describe',
      'searchRepos',
      'get_issue',
    ])
  })
})
