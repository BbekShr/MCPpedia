import { describe, it, expect } from 'vitest'
import {
  buildLinkedRowRefresh,
  type LinkedRowCurrent,
  type LinkedRowParsed,
} from '../lib/sync-registry-refresh'

/** A row with nothing worth gap-filling, so a test can override just the field under test. */
function currentRow(overrides: Partial<LinkedRowCurrent> = {}): LinkedRowCurrent {
  return {
    transport: ['stdio'],
    npm_package: 'existing-pkg',
    pip_package: null,
    description: 'Existing description',
    // Matches `parsedEntry()`'s default description, so the "nothing to
    // refresh" baseline test is genuinely a no-op on both columns.
    tagline: 'Existing description',
    description_source: 'bot',
    github_url: 'https://github.com/acme/widget',
    ...overrides,
  }
}

/** A registry entry that matches `currentRow()` exactly, so a test only has to vary what differs. */
function parsedEntry(overrides: Partial<LinkedRowParsed> = {}): LinkedRowParsed {
  return {
    transports: ['stdio'],
    npmPackage: 'existing-pkg',
    pipPackage: null,
    description: 'Existing description',
    githubUrl: 'https://github.com/acme/widget',
    ...overrides,
  }
}

describe('buildLinkedRowRefresh — transport', () => {
  it('refreshes a [null] drift-shape transport from the registry', () => {
    const { update, changedFields } = buildLinkedRowRefresh(
      currentRow({ transport: [null] }),
      parsedEntry({ transports: ['http'] }),
      new Set()
    )
    expect(update.transport).toEqual(['http'])
    expect(changedFields).toContain('transport')
  })

  it('refreshes an empty or NULL-literal transport array the same way', () => {
    for (const drift of [[], ['NULL'], null]) {
      const { update } = buildLinkedRowRefresh(
        currentRow({ transport: drift as LinkedRowCurrent['transport'] }),
        parsedEntry({ transports: ['sse'] }),
        new Set()
      )
      expect(update.transport).toEqual(['sse'])
    }
  })

  it('never overwrites a real transport value, even when the registry disagrees', () => {
    const { update, changedFields } = buildLinkedRowRefresh(
      currentRow({ transport: ['stdio'] }),
      parsedEntry({ transports: ['http'] }),
      new Set()
    )
    expect(update.transport).toBeUndefined()
    expect(changedFields).not.toContain('transport')
  })
})

describe('buildLinkedRowRefresh — description/tagline', () => {
  it('never overwrites a human-authored description or tagline', () => {
    const { update, changedFields } = buildLinkedRowRefresh(
      currentRow({ description_source: 'human', description: 'Human text', tagline: 'Human tagline' }),
      parsedEntry({ description: 'Registry text' }),
      new Set()
    )
    expect(update.description).toBeUndefined()
    expect(update.tagline).toBeUndefined()
    expect(changedFields).not.toContain('description')
    expect(changedFields).not.toContain('tagline')
  })

  it('refreshes description and tagline from the registry when the source is not human', () => {
    const { update, changedFields } = buildLinkedRowRefresh(
      currentRow({ description_source: 'bot', description: 'Stale text', tagline: 'Stale tagline' }),
      parsedEntry({ description: 'Fresh registry text' }),
      new Set()
    )
    expect(update.description).toBe('Fresh registry text')
    expect(update.tagline).toBe('Fresh registry text')
    expect(changedFields).toEqual(expect.arrayContaining(['description', 'tagline']))
  })

  it('treats a null description_source the same as bot (never human)', () => {
    const { update } = buildLinkedRowRefresh(
      currentRow({ description_source: null, description: 'Stale text', tagline: 'Stale tagline' }),
      parsedEntry({ description: 'Fresh registry text' }),
      new Set()
    )
    expect(update.description).toBe('Fresh registry text')
  })

  it('writes nothing when the registry description already matches (no-op update)', () => {
    const { update, changedFields } = buildLinkedRowRefresh(
      currentRow({ description_source: 'bot', description: 'Same text', tagline: 'Same text' }),
      parsedEntry({ description: 'Same text' }),
      new Set()
    )
    expect(update).toEqual({})
    expect(changedFields).toEqual([])
  })

  it('does not clear an existing description when the registry has none', () => {
    const { update } = buildLinkedRowRefresh(
      currentRow({ description_source: 'bot', description: 'Keep me' }),
      parsedEntry({ description: null }),
      new Set()
    )
    expect(update.description).toBeUndefined()
  })
})

describe('buildLinkedRowRefresh — npm/pip package gap-fill', () => {
  it('fills npm_package only when the current value is null', () => {
    const filled = buildLinkedRowRefresh(
      currentRow({ npm_package: null }),
      parsedEntry({ npmPackage: 'new-pkg' }),
      new Set()
    )
    expect(filled.update.npm_package).toBe('new-pkg')

    const untouched = buildLinkedRowRefresh(
      currentRow({ npm_package: 'already-set' }),
      parsedEntry({ npmPackage: 'new-pkg' }),
      new Set()
    )
    expect(untouched.update.npm_package).toBeUndefined()
  })

  it('fills pip_package only when the current value is null', () => {
    const filled = buildLinkedRowRefresh(
      currentRow({ pip_package: null }),
      parsedEntry({ pipPackage: 'new-pip-pkg' }),
      new Set()
    )
    expect(filled.update.pip_package).toBe('new-pip-pkg')

    const untouched = buildLinkedRowRefresh(
      currentRow({ pip_package: 'already-set' }),
      parsedEntry({ pipPackage: 'new-pip-pkg' }),
      new Set()
    )
    expect(untouched.update.pip_package).toBeUndefined()
  })

  it('does not fill a gap when the registry has nothing to offer either', () => {
    const { update } = buildLinkedRowRefresh(
      currentRow({ npm_package: null, pip_package: null }),
      parsedEntry({ npmPackage: null, pipPackage: null }),
      new Set()
    )
    expect(update.npm_package).toBeUndefined()
    expect(update.pip_package).toBeUndefined()
  })
})

describe('buildLinkedRowRefresh — repo-transfer detection', () => {
  it('applies the transfer when the new URL is free', () => {
    const { update, changedFields, transferSkippedCollision } = buildLinkedRowRefresh(
      currentRow({ github_url: 'https://github.com/palisadeemail/dns-auditor' }),
      parsedEntry({ githubUrl: 'https://github.com/palisadeemail/palisade-mcp' }),
      new Set(['https://github.com/someone-else/unrelated'])
    )
    expect(update.github_url).toBe('https://github.com/palisadeemail/palisade-mcp')
    expect(changedFields).toContain('github_url')
    expect(transferSkippedCollision).toBe(false)
  })

  it('skips the transfer when the new URL already belongs to another row', () => {
    const { update, changedFields, transferSkippedCollision } = buildLinkedRowRefresh(
      currentRow({ github_url: 'https://github.com/palisadeemail/dns-auditor' }),
      parsedEntry({ githubUrl: 'https://github.com/palisadeemail/palisade-mcp' }),
      new Set(['https://github.com/palisadeemail/palisade-mcp'])
    )
    expect(update.github_url).toBeUndefined()
    expect(changedFields).not.toContain('github_url')
    expect(transferSkippedCollision).toBe(true)
  })

  it('does nothing when the URL has not changed', () => {
    const { update, changedFields } = buildLinkedRowRefresh(
      currentRow({ github_url: 'https://github.com/acme/widget' }),
      parsedEntry({ githubUrl: 'https://github.com/acme/widget' }),
      new Set()
    )
    expect(update.github_url).toBeUndefined()
    expect(changedFields).not.toContain('github_url')
  })

  it('never detects a transfer when checkGithubTransfer is false (the URL-link branch)', () => {
    const { update, changedFields, transferSkippedCollision } = buildLinkedRowRefresh(
      currentRow({ github_url: 'https://github.com/acme/widget-old-form' }),
      parsedEntry({ githubUrl: 'https://github.com/acme/widget' }),
      new Set(),
      false
    )
    expect(update.github_url).toBeUndefined()
    expect(changedFields).not.toContain('github_url')
    expect(transferSkippedCollision).toBe(false)
  })
})

describe('buildLinkedRowRefresh — combined', () => {
  it('only touches the stamp when nothing needs to change', () => {
    const { update, changedFields, transferSkippedCollision } = buildLinkedRowRefresh(
      currentRow(),
      parsedEntry(),
      new Set()
    )
    expect(update).toEqual({})
    expect(changedFields).toEqual([])
    expect(transferSkippedCollision).toBe(false)
  })

  it('refreshes every eligible field in one pass', () => {
    const { update, changedFields } = buildLinkedRowRefresh(
      currentRow({
        transport: [null],
        npm_package: null,
        pip_package: null,
        description_source: 'bot',
        description: 'Stale',
        tagline: 'Stale',
        github_url: 'https://github.com/acme/widget-old',
      }),
      parsedEntry({
        transports: ['http'],
        npmPackage: 'pkg',
        pipPackage: 'pip-pkg',
        description: 'Fresh',
        githubUrl: 'https://github.com/acme/widget-new',
      }),
      new Set()
    )
    expect(update).toEqual({
      transport: ['http'],
      npm_package: 'pkg',
      pip_package: 'pip-pkg',
      description: 'Fresh',
      tagline: 'Fresh',
      github_url: 'https://github.com/acme/widget-new',
    })
    expect(changedFields.sort()).toEqual(
      ['description', 'github_url', 'npm_package', 'pip_package', 'tagline', 'transport'].sort()
    )
  })
})
