import { describe, it, expect } from 'vitest'
import { submitServerSchema, editProposalSchema, discussionSchema } from '@/lib/validators'

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
