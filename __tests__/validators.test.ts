import { describe, it, expect } from 'vitest'
import { submitServerSchema, editProposalSchema, discussionSchema, sanitizeFilterValue } from '@/lib/validators'

describe('submitServerSchema', () => {
  it('accepts valid server submission', () => {
    const result = submitServerSchema.safeParse({
      name: 'My MCP Server',
      github_url: 'https://github.com/user/repo',
      transport: ['stdio'],
      categories: ['developer-tools'],
      api_pricing: 'free',
      requires_api_key: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = submitServerSchema.safeParse({
      name: '',
      github_url: 'https://github.com/user/repo',
      transport: ['stdio'],
      categories: ['developer-tools'],
      api_pricing: 'free',
      requires_api_key: false,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid github url', () => {
    const result = submitServerSchema.safeParse({
      name: 'Test',
      github_url: 'not-a-url',
      transport: ['stdio'],
      categories: ['developer-tools'],
      api_pricing: 'free',
      requires_api_key: false,
    })
    expect(result.success).toBe(false)
  })

  it('defaults empty categories to empty array', () => {
    const result = submitServerSchema.safeParse({
      name: 'Test',
      github_url: 'https://github.com/user/repo',
      transport: ['stdio'],
      api_pricing: 'free',
      requires_api_key: false,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.categories).toEqual([])
    }
  })
})

// S112: these fields become `.ilike` filters in POST /api/submit, so a bare
// `github.com/` or a wildcard-bearing package name must never parse.
describe('submitServerSchema — filter-bound field shapes (S112)', () => {
  const parse = (overrides: Record<string, unknown>) =>
    submitServerSchema.safeParse({ name: 'Test', github_url: 'https://github.com/owner/repo', ...overrides })

  it.each([
    ['https://github.com/'],
    ['https://github.com'],
    ['https://github.com/owner'],
    ['https://github.com/owner/'],
    ['https://github.com/%25/repo'],
  ])('rejects github_url %s', (github_url) => {
    expect(parse({ github_url }).success).toBe(false)
  })

  it.each([
    ['https://github.com/owner/repo'],
    ['https://github.com/owner/repo/'],
    ['https://github.com/owner/repo.git'],
    ['https://github.com/o/r/tree/main/pkg'],
  ])('accepts github_url %s', (github_url) => {
    expect(parse({ github_url }).success).toBe(true)
  })

  it.each([['foo*'], ['%'], ['a,b'], ['foo bar'], ['@scope/'], ['a(b)']])('rejects npm_package %s', (npm_package) => {
    expect(parse({ npm_package }).success).toBe(false)
  })

  it.each([['a,b'], ['foo*'], ['%'], ['-lead'], ['trail.']])('rejects pip_package %s', (pip_package) => {
    expect(parse({ pip_package }).success).toBe(false)
  })

  it('accepts real package names', () => {
    expect(parse({ npm_package: '@scope/name' }).success).toBe(true)
    expect(parse({ npm_package: 'my-server.js' }).success).toBe(true)
    expect(parse({ pip_package: 'my_pkg.x' }).success).toBe(true)
  })

  // The submit form omits blank fields, but a direct API caller may send ''.
  // Both were accepted before S112 and must stay accepted.
  it('accepts omitted, empty and whitespace-only package fields', () => {
    expect(parse({}).success).toBe(true)
    expect(parse({ npm_package: '', pip_package: '' }).success).toBe(true)
    expect(parse({ npm_package: '  ', pip_package: ' ' }).success).toBe(true)
  })
})

describe('sanitizeFilterValue', () => {
  it('strips filter delimiters, wildcards and whitespace', () => {
    expect(sanitizeFilterValue('a*b%c,d(e)f:g h\tI')).toBe('abcdefghI')
  })

  it('preserves scoped npm names and URL fragments', () => {
    expect(sanitizeFilterValue('@scope/name')).toBe('@scope/name')
    expect(sanitizeFilterValue('github.com/o/r')).toBe('github.com/o/r')
  })

  it('caps length at 200', () => {
    expect(sanitizeFilterValue('a'.repeat(300))).toHaveLength(200)
  })
})

describe('editProposalSchema', () => {
  it.each(['npm_package', 'pip_package'])('accepts clearing %s', (field_name) => {
    const result = editProposalSchema.safeParse({
      server_id: '123e4567-e89b-12d3-a456-426614174000',
      field_name,
      old_value: 'wrong-package',
      new_value: '',
      edit_reason: 'This server has no package',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.new_value).toBe('')
  })

  it.each([
    'name', 'tagline', 'description', 'api_name', 'api_pricing',
    'api_rate_limits', 'homepage_url',
  ])('still rejects clearing %s', (field_name) => {
    const result = editProposalSchema.safeParse({
      server_id: '123e4567-e89b-12d3-a456-426614174000',
      field_name,
      old_value: 'old',
      new_value: '',
      edit_reason: 'Remove value',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.flatten().fieldErrors.new_value).toBeDefined()
  })

  it.each([null, 0, 'x'.repeat(10001)])('rejects invalid package value %j', (new_value) => {
    expect(editProposalSchema.safeParse({
      server_id: '123e4567-e89b-12d3-a456-426614174000',
      field_name: 'npm_package',
      old_value: 'old',
      new_value,
      edit_reason: 'Correct package',
    }).success).toBe(false)
  })

  it('accepts valid edit proposal', () => {
    const result = editProposalSchema.safeParse({
      server_id: '123e4567-e89b-12d3-a456-426614174000',
      field_name: 'tagline',
      old_value: 'Old tagline',
      new_value: 'New tagline',
      edit_reason: 'Fixing typo',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing edit_reason', () => {
    const result = editProposalSchema.safeParse({
      server_id: '123e4567-e89b-12d3-a456-426614174000',
      field_name: 'tagline',
      old_value: 'Old',
      new_value: 'New',
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-editable field', () => {
    const result = editProposalSchema.safeParse({
      server_id: '123e4567-e89b-12d3-a456-426614174000',
      field_name: 'github_stars',
      old_value: '100',
      new_value: '999',
      edit_reason: 'Hacking stars',
    })
    expect(result.success).toBe(false)
  })
})

describe('discussionSchema', () => {
  it('accepts valid discussion', () => {
    const result = discussionSchema.safeParse({
      server_id: '123e4567-e89b-12d3-a456-426614174000',
      body: 'This is a great server!',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty body', () => {
    const result = discussionSchema.safeParse({
      server_id: '123e4567-e89b-12d3-a456-426614174000',
      body: '',
    })
    expect(result.success).toBe(false)
  })

  it('accepts reply with parent_id', () => {
    const result = discussionSchema.safeParse({
      server_id: '123e4567-e89b-12d3-a456-426614174000',
      body: 'I agree!',
      parent_id: '123e4567-e89b-12d3-a456-426614174001',
    })
    expect(result.success).toBe(true)
  })
})
