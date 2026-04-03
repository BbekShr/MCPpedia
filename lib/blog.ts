import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const blogDir = path.join(process.cwd(), 'content', 'blog')

export type BlogCategory =
  | 'weekly-roundup'
  | 'server-spotlight'
  | 'security-alert'
  | 'trending'
  | 'category-deep-dive'

export interface BlogMeta {
  slug: string
  title: string
  description: string
  hook: string // punchy one-liner for social sharing
  date: string
  tags: string[]
  category: BlogCategory
  featuredServers: string[]
  readingTime: number // minutes
}

function estimateReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 238))
}

export function getAllBlogPosts(): BlogMeta[] {
  if (!fs.existsSync(blogDir)) return []

  const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.mdx'))

  return files
    .map(file => {
      const slug = file.replace(/\.mdx$/, '')
      const raw = fs.readFileSync(path.join(blogDir, file), 'utf-8')
      const { data, content } = matter(raw)

      return {
        slug,
        title: data.title || slug,
        description: data.description || '',
        hook: data.hook || data.description || '',
        date: data.date || '',
        tags: data.tags || [],
        category: data.category || 'weekly-roundup',
        featuredServers: data.featuredServers || [],
        readingTime: estimateReadingTime(content),
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getBlogPost(slug: string): { meta: BlogMeta; content: string } | null {
  // Prevent path traversal — only allow alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return null

  const filePath = path.join(blogDir, `${slug}.mdx`)

  // Verify the resolved path is still within the blog directory
  if (!filePath.startsWith(blogDir)) return null

  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)

  return {
    meta: {
      slug,
      title: data.title || slug,
      description: data.description || '',
      hook: data.hook || data.description || '',
      date: data.date || '',
      tags: data.tags || [],
      category: data.category || 'weekly-roundup',
      featuredServers: data.featuredServers || [],
      readingTime: estimateReadingTime(content),
    },
    content,
  }
}

export function getBlogPostsByCategory(category: BlogCategory): BlogMeta[] {
  return getAllBlogPosts().filter(p => p.category === category)
}
