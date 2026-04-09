import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

// Extend default schema to allow common README elements
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'details', 'summary', 'picture', 'source',
  ],
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img || []), 'width', 'height', 'align'],
    source: ['srcset', 'media', 'type'],
    details: ['open'],
    '*': [...(defaultSchema.attributes?.['*'] || []), 'align'],
  },
}

export default async function ServerReadme({ githubUrl }: { githubUrl: string | null }) {
  if (!githubUrl) return null

  // Extract owner/repo from github URL
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (!match) return null
  const [, owner, repo] = match

  let readme: string | null = null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { 'Accept': 'application/vnd.github.v3.raw' },
      signal: controller.signal,
      next: { revalidate: 86400 }, // cache for 24h
    })
    clearTimeout(timeout)
    if (res.ok) {
      readme = await res.text()
      // Truncate to first 4000 chars to keep pages fast
      if (readme.length > 4000) readme = readme.slice(0, 4000) + `\n\n... [View full README on GitHub](${githubUrl}#readme)`
    }
  } catch {
    // Silently fail — README is enhancement, not critical
  }

  if (!readme) return null

  // Resolve relative image URLs to GitHub raw URLs
  const baseRawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD`
  const processedReadme = readme
    // Markdown-style images: ![alt](relative/path)
    .replace(
      /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g,
      (_, alt, src) => `![${alt}](${baseRawUrl}/${src})`
    )
    // HTML <img> tags with relative src
    .replace(
      /(<img\s[^>]*src=["'])(?!https?:\/\/)([^"']+)(["'])/gi,
      (_, before, src, after) => `${before}${baseRawUrl}/${src}${after}`
    )

  return (
    <section id="readme" className="pt-8 border-t border-border">
      <details open>
        <summary className="text-lg font-semibold text-text-primary mb-4 cursor-pointer hover:text-accent transition-colors">
          README
        </summary>
        <div className="bg-bg-secondary border border-border rounded-md p-5 max-h-[500px] overflow-y-auto prose prose-sm max-w-none
          text-text-primary
          prose-headings:text-text-primary prose-headings:font-semibold
          prose-h1:text-lg prose-h1:border-b prose-h1:border-border prose-h1:pb-2 prose-h1:mb-4
          prose-h2:text-base prose-h2:mt-6 prose-h2:mb-3
          prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-2
          prose-p:text-sm prose-p:leading-relaxed prose-p:mb-3
          prose-a:text-accent prose-a:no-underline hover:prose-a:underline
          prose-code:text-sm prose-code:text-text-primary prose-code:bg-code-bg prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono
          prose-pre:bg-code-bg prose-pre:text-text-primary prose-pre:border prose-pre:border-border prose-pre:rounded-md prose-pre:text-sm
          prose-li:text-sm prose-li:leading-relaxed
          prose-img:max-w-full prose-img:rounded-md
          prose-strong:text-text-primary
          prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-4 prose-blockquote:text-text-muted prose-blockquote:not-italic
          prose-table:text-sm prose-table:w-full prose-table:border-collapse prose-table:border prose-table:border-border prose-table:rounded-md prose-table:overflow-hidden
          prose-thead:bg-bg-tertiary
          prose-th:text-left prose-th:font-semibold prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2
          prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2
          prose-tr:even:bg-bg-tertiary/50
        ">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}>{processedReadme}</Markdown>
        </div>
      </details>
    </section>
  )
}
