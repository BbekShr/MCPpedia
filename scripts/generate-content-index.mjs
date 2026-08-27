/**
 * Generate the build-time content indexes consumed at request time.
 *
 * Cloudflare Workers have no filesystem: `fs.readFileSync` throws at runtime
 * ("[unenv] fs.readFileSync is not implemented yet!"). Several request-time
 * routes only need blog/guide FRONTMATTER — /sitemap.xml (force-dynamic),
 * /llms.txt and /llms-full.txt (ISR), /blog. Those now read the JSON indexes
 * written here instead of walking content/ at request time.
 *
 * Full post/guide BODIES are still read with fs by getBlogPost()/getGuide(),
 * which only run while prerendering (`dynamicParams = false` pins those
 * segments to build time), so they never execute in the Worker.
 *
 * Runs from `prebuild`; the output is committed so a bare `npx tsc --noEmit`
 * and `npm test` work on a clean checkout. Regenerate after adding content:
 *   npm run content:index
 */
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

const root = process.cwd()

function estimateReadingTime(content) {
  const words = content.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 238))
}

function readFrontmatter(dir) {
  const abs = path.join(root, dir)
  if (!fs.existsSync(abs)) return []
  return fs
    .readdirSync(abs)
    .filter(f => f.endsWith('.mdx'))
    .map(file => {
      const slug = file.replace(/\.mdx$/, '')
      const { data, content } = matter(fs.readFileSync(path.join(abs, file), 'utf-8'))
      return { slug, data, content }
    })
}

const blog = readFrontmatter('content/blog')
  .map(({ slug, data, content }) => ({
    slug,
    title: data.title || slug,
    description: data.description || '',
    hook: data.hook || data.description || '',
    date: data.date || '',
    ...(data.updated ? { updated: data.updated } : {}),
    tags: data.tags || [],
    category: data.category || 'weekly-roundup',
    featuredServers: data.featuredServers || [],
    readingTime: estimateReadingTime(content),
  }))
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

const guides = readFrontmatter('content/guides')
  .map(({ slug, data }) => ({
    slug,
    title: data.title || slug,
    description: data.description || '',
    author: data.author || 'MCPpedia',
    date: data.date || '',
    tags: data.tags || [],
  }))
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

function write(file, value) {
  const target = path.join(root, file)
  const next = JSON.stringify(value, null, 2) + '\n'
  const prev = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : null
  if (prev === next) return false
  fs.writeFileSync(target, next)
  return true
}

const blogChanged = write('data/blog-index.json', blog)
const guidesChanged = write('data/guides-index.json', guides)

console.log(
  `content index: ${blog.length} blog post(s)${blogChanged ? ' (updated)' : ''}, ` +
    `${guides.length} guide(s)${guidesChanged ? ' (updated)' : ''}`
)
