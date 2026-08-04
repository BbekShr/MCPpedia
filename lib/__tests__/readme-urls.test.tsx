import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Markdown from 'react-markdown'
import { readmeRemarkPlugins, readmeRehypePlugins } from '../readme-pipeline'
import { classifyUrl, resolveRelative } from '../rehype-github-urls'

// Renders through the EXACT plugin chain components/ServerReadme.tsx uses, so a
// change to the chain that reintroduces the relative-link bug fails here.
function render(markdown: string, owner = 'acme', repo = 'widget') {
  return renderToStaticMarkup(
    <Markdown remarkPlugins={readmeRemarkPlugins} rehypePlugins={readmeRehypePlugins(owner, repo)}>
      {markdown}
    </Markdown>,
  )
}

describe('README link rewriting', () => {
  it('rewrites a relative markdown link to the GitHub file browser', () => {
    // The exact shape behind all 272 Search Console 404s: this used to render
    // as href="docs/tools.md", i.e. mcppedia.org/s/<slug>/docs/tools.md.
    const html = render('[docs](docs/tools.md)')
    expect(html).toContain('href="https://github.com/acme/widget/blob/HEAD/docs/tools.md"')
    expect(html).not.toContain('href="docs/tools.md"')
  })

  it('rewrites a bare directory link, the /s/io-github-ryudi84-api case', () => {
    expect(render('[forge](api-forge-mcp/)')).toContain(
      'href="https://github.com/acme/widget/blob/HEAD/api-forge-mcp/"',
    )
  })

  it('rewrites a relative image to the raw CDN, not the file browser', () => {
    const html = render('![logo](assets/logo.png)')
    expect(html).toContain('src="https://raw.githubusercontent.com/acme/widget/HEAD/assets/logo.png"')
  })

  it('rewrites a relative <img> in raw HTML too', () => {
    const html = render('<img src="assets/logo.png" alt="logo">')
    expect(html).toContain('src="https://raw.githubusercontent.com/acme/widget/HEAD/assets/logo.png"')
  })

  it('leaves an absolute link alone but still marks it untrusted', () => {
    const html = render('[home](https://example.com/x)')
    expect(html).toContain('href="https://example.com/x"')
    expect(html).toContain('rel="nofollow ugc noopener"')
    expect(html).toContain('target="_blank"')
  })

  it('leaves anchor-only links relative and unmarked', () => {
    const html = render('[jump](#install)')
    expect(html).toContain('href="#install"')
    expect(html).not.toContain('github.com/acme/widget/blob/HEAD/#install')
    expect(html).not.toContain('target="_blank"')
  })

  it('treats a protocol-relative link as external, not as a repo path', () => {
    const html = render('[cdn](//cdn.example.com/x.js)')
    expect(html).toContain('href="//cdn.example.com/x.js"')
    expect(html).not.toContain('blob/HEAD//cdn.example.com')
    expect(html).toContain('rel="nofollow ugc noopener"')
  })

  it('resolves a nested path containing ..', () => {
    const html = render('[up](docs/../src/index.ts)')
    expect(html).toContain('href="https://github.com/acme/widget/blob/HEAD/src/index.ts"')
  })

  it('treats a leading slash as repo-root, not host-root', () => {
    const html = render('[root](/docs/a.md)')
    expect(html).toContain('href="https://github.com/acme/widget/blob/HEAD/docs/a.md"')
  })

  it('leaves mailto: intact rather than treating it as a repo path', () => {
    const html = render('[mail](mailto:a@b.com)')
    expect(html).toContain('href="mailto:a@b.com"')
    expect(html).not.toContain('blob/HEAD/mailto')
  })

  it('leaves an href-less link alone (rehype-sanitize drops tel: before us)', () => {
    // `tel:` is not in rehype-sanitize's default protocol allow-list, so the
    // href is already gone by the time this plugin runs. It must not then
    // invent a rel/target on an anchor that links nowhere.
    expect(render('[call](tel:+15551234)')).toBe('<p><a>call</a></p>')
  })

  it('marks every outbound README link nofollow — we link out from ~36k pages', () => {
    const html = render('[a](https://a.example) and [b](other/page.md)')
    expect(html.match(/rel="nofollow ugc noopener"/g)).toHaveLength(2)
  })

  it('does not rewrite paths inside code fences', () => {
    const html = render('```\n[docs](docs/tools.md)\n```')
    expect(html).toContain('[docs](docs/tools.md)')
    expect(html).not.toContain('github.com/acme/widget')
  })
})

describe('classifyUrl', () => {
  it.each([
    ['', 'anchor'],
    ['#install', 'anchor'],
    ['//cdn.example.com/x', 'absolute'],
    ['https://example.com', 'absolute'],
    ['mailto:a@b.com', 'absolute'],
    ['tel:+1555', 'absolute'],
    ['docs/a.md', 'relative'],
    ['./docs/a.md', 'relative'],
    ['../a.md', 'relative'],
    ['/docs/a.md', 'relative'],
  ])('classifies %s as %s', (url, kind) => {
    expect(classifyUrl(url)).toBe(kind)
  })
})

describe('resolveRelative', () => {
  const base = 'https://github.com/acme/widget/blob/HEAD/'

  it('strips leading slashes so the repo, not the host, is the root', () => {
    expect(resolveRelative('/a.md', base)).toBe(`${base}a.md`)
  })

  it('collapses ./ and ../ segments', () => {
    expect(resolveRelative('./a.md', base)).toBe(`${base}a.md`)
    expect(resolveRelative('docs/../a.md', base)).toBe(`${base}a.md`)
  })
})
