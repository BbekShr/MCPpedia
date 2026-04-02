import { z } from 'zod'
import { CATEGORIES, TRANSPORTS, API_PRICING_OPTIONS } from './constants'

export const submitServerSchema = z.object({
  github_url: z.string().url().regex(/github\.com\/[\w.-]+\/[\w.-]+/, 'Must be a valid GitHub URL'),
  name: z.string().min(1).max(200),
  tagline: z.string().max(500).optional(),
  license: z.string().max(100).optional(),
  author_name: z.string().max(200).optional(),
  author_github: z.string().max(100).optional(),
  npm_package: z.string().max(200).optional(),
  pip_package: z.string().max(200).optional(),
  transport: z.array(z.enum(TRANSPORTS)).default(['stdio']),
  categories: z.array(z.enum(CATEGORIES)).default([]),
  api_pricing: z.enum(API_PRICING_OPTIONS).default('unknown'),
  requires_api_key: z.boolean().default(false),
})

export const editProposalSchema = z.object({
  server_id: z.string().uuid(),
  field_name: z.string().min(1),
  old_value: z.unknown(),
  new_value: z.unknown(),
  edit_reason: z.string().min(1, 'A reason is required').max(1000),
})

export const discussionSchema = z.object({
  server_id: z.string().uuid(),
  parent_id: z.string().uuid().optional(),
  body: z.string().min(1, 'Cannot be empty').max(10000),
})

export const voteSchema = z.object({
  discussion_id: z.string().uuid(),
  value: z.union([z.literal(1), z.literal(-1)]),
})

export const flagSchema = z.object({
  target_type: z.enum(['server', 'discussion', 'edit']),
  target_id: z.string().uuid(),
  reason: z.string().min(1).max(1000),
})
