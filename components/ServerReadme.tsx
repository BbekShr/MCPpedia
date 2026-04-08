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
      // Truncate to first 3000 chars to keep pages fast
      if (readme.length > 3000) readme = readme.slice(0, 3000) + '\n\n... [View full README on GitHub]'
    }
  } catch {
    // Silently fail — README is enhancement, not critical
  }

  if (!readme) return null

  return (
    <section id="readme" className="pt-8 border-t border-border">
      <details open>
        <summary className="text-lg font-semibold text-text-primary mb-4 cursor-pointer hover:text-accent transition-colors">
          README
        </summary>
        <div className="bg-bg-secondary border border-border rounded-md p-4 max-h-[400px] overflow-y-auto">
          <pre className="text-sm text-text-primary whitespace-pre-wrap break-words font-mono leading-relaxed">{readme}</pre>
        </div>
      </details>
    </section>
  )
}
