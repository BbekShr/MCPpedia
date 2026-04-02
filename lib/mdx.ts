import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const guidesDir = path.join(process.cwd(), 'content', 'guides')

export interface GuideMeta {
  slug: string
  title: string
  description: string
  author: string
  date: string
  tags: string[]
}

export function getAllGuides(): GuideMeta[] {
  if (!fs.existsSync(guidesDir)) return []

  const files = fs.readdirSync(guidesDir).filter(f => f.endsWith('.mdx'))

  return files
    .map(file => {
      const slug = file.replace(/\.mdx$/, '')
      const content = fs.readFileSync(path.join(guidesDir, file), 'utf-8')
      const { data } = matter(content)

      return {
        slug,
        title: data.title || slug,
        description: data.description || '',
        author: data.author || 'MCPpedia',
        date: data.date || '',
        tags: data.tags || [],
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getGuide(slug: string): { meta: GuideMeta; content: string } | null {
  const filePath = path.join(guidesDir, `${slug}.mdx`)

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
