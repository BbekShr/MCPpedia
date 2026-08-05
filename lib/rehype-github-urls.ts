// Rewrite the relative URLs in a rendered GitHub README so they point at
// GitHub, and mark every outbound link as untrusted.
//
// Why this is not more regex on the markdown string: the previous version
// rewrote relative IMAGE paths (`![x](docs/a.png)`) and left relative LINK paths
// alone, so `[docs](docs/tools.md)` rendered as a link to
// mcppedia.org/docs/tools.md. Every one of those is a 404 on our own domain,
// crawled and reported — all 272 of Search Console's 404s trace to this, e.g.
// /s/io-github-ryudi84-api emitting api-forge-mcp/, base64-forge/, cron-forge/.
// A regex pass over markdown cannot see which `(...)` is a link, an image, a
// code fence or raw HTML; the parsed tree can, so the rewrite belongs there.
//
// Runs AFTER rehype-sanitize on purpose: the sanitizer would otherwise strip the
// `rel` and `target` this plugin adds, and by then it has already removed any
// javascript:/data: href, so every URL reaching us is one of href/src's
// allowed shapes.

interface HastElement {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastElement[]
}

export interface GithubUrlOptions {
  owner: string
  repo: string
}

// Links resolve against the repo's file browser, images against the raw CDN —
// linking an image at github.com/blob renders the HTML page, not the image.
const linkBase = (o: string, r: string) => `https://github.com/${o}/${r}/blob/HEAD/`
const imageBase = (o: string, r: string) => `https://raw.githubusercontent.com/${o}/${r}/HEAD/`

// `mailto:`, `tel:`, `https:`, and anything else with an explicit scheme.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

type UrlKind = 'anchor' | 'absolute' | 'relative'

export function classifyUrl(url: string): UrlKind {
  const trimmed = url.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return 'anchor'
  // Protocol-relative (`//host/path`) is absolute — it inherits our scheme and
  // leaves the site. Note this must be tested before the single-slash root case.
  if (trimmed.startsWith('//')) return 'absolute'
  if (HAS_SCHEME.test(trimmed)) return 'absolute'
  return 'relative'
}

export function resolveRelative(url: string, base: string): string {
  // A leading slash in a README means repo-root, not host-root: GitHub resolves
  // `/docs/a.md` inside the repo. Resolving it against the base URL would send
  // it to github.com/docs/a.md instead.
  const path = url.trim().replace(/^\/+/, '')
  try {
    return new URL(path, base).toString()
  } catch {
    return url
  }
}

// Everything a README links to is third-party content we neither wrote nor
// vouch for, republished across ~36k pages. `nofollow ugc` keeps us from
// passing that much authority to arbitrary repos, and `noopener` is required
// alongside `target="_blank"`.
const EXTERNAL_REL = 'nofollow ugc noopener'

export default function rehypeGithubUrls({ owner, repo }: GithubUrlOptions) {
  const links = linkBase(owner, repo)
  const images = imageBase(owner, repo)

  return (tree: HastElement) => {
    walk(tree, node => {
      if (node.type !== 'element' || !node.properties) return

      if (node.tagName === 'a') {
        const href = typeof node.properties.href === 'string' ? node.properties.href : null
        if (href === null) return
        const kind = classifyUrl(href)
        // Anchors stay in-page — rewriting them would break every "jump to
        // section" link in the README we just rendered.
        if (kind === 'anchor') return
        if (kind === 'relative') node.properties.href = resolveRelative(href, links)
        node.properties.rel = EXTERNAL_REL
        node.properties.target = '_blank'
        return
      }

      if (node.tagName === 'img' || node.tagName === 'source') {
        const key = node.tagName === 'img' ? 'src' : 'srcset'
        const value = typeof node.properties[key] === 'string' ? (node.properties[key] as string) : null
        if (value === null) return
        if (classifyUrl(value) === 'relative') node.properties[key] = resolveRelative(value, images)
      }
    })
  }
}

function walk(node: HastElement, visit: (n: HastElement) => void) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}
