import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

// Lightweight markdown renderer for short, user-authored prose
// (server `description`, tool/resource/prompt descriptions).
//
// Deliberately omits `rehype-raw` — these fields are typed by users on
// /s/[slug]/edit, so raw HTML is not allowed. Markdown only. The README
// renderer uses a separate, more permissive pipeline.
export default function InlineMarkdown({
  children,
  className = '',
}: {
  children: string
  className?: string
}) {
  return (
    <div
      className={
        'prose prose-sm max-w-none ' +
        'text-text-primary ' +
        'prose-p:my-0 prose-p:leading-[1.65] ' +
        'prose-a:text-accent prose-a:no-underline hover:prose-a:underline ' +
        'prose-strong:text-text-primary ' +
        'prose-code:text-text-primary prose-code:bg-code-bg prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-[0.9em] prose-code:before:content-none prose-code:after:content-none ' +
        'prose-pre:bg-code-bg prose-pre:text-text-primary prose-pre:border prose-pre:border-border prose-pre:rounded-md ' +
        'prose-ul:my-1 prose-ol:my-1 prose-li:my-0 ' +
        'prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-4 prose-blockquote:text-text-muted prose-blockquote:not-italic ' +
        '[&_p+p]:mt-3 ' +
        className
      }
    >
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children}
      </Markdown>
    </div>
  )
}
