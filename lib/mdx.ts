import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import guidesIndex from '@/data/guides-index.json'

const guidesDir = path.join(process.cwd(), 'content', 'guides')

export interface GuideMeta {
  slug: string
  title: string
  description: string
  author: string
  date: string
  tags: string[]
}

// Build-time index, not the filesystem — /llms-full.txt and /sitemap.xml call
// this at request time and Cloudflare Workers have no fs. See lib/blog.ts.
export function getAllGuides(): GuideMeta[] {
  return guidesIndex as GuideMeta[]
}

// Reads the guide BODY off disk, so it is build-time only — /guides/[slug] sets
// `dynamicParams = false` to keep it out of the Worker.
export function getGuide(slug: string): { meta: GuideMeta; content: string } | null {
  // Prevent path traversal — only allow alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return null

  const filePath = path.join(guidesDir, `${slug}.mdx`)

  // Verify the resolved path is still within the guides directory
  if (!filePath.startsWith(guidesDir)) return null

  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)

  return {
    meta: {
      slug,
      title: data.title || slug,
      description: data.description || '',
      author: data.author || 'MCPpedia',
      date: data.date || '',
      tags: data.tags || [],
    },
    content,
  }
}
