import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The root layout declares `title.template = '%s - MCPpedia'`, which Next.js
 * appends to every child segment's `title` unless that title is declared as
 * `{ absolute: ... }`. A page that spells the brand into its own title string
 * therefore ships it twice:
 *
 *   'Best Data MCP Servers — MCPpedia'  ->  '... — MCPpedia - MCPpedia'
 *
 * That burned 24 characters of the highest-weighted on-page element across the
 * hub pages, and pushed /faq past the SERP truncation point at 85 chars. The
 * server pages already used `absolute`; the hubs had drifted.
 *
 * This scans source rather than rendered output because the offending titles
 * are inline literals spread across static `metadata` exports and dynamic
 * `generateMetadata` returns — there is no shared helper to unit-test.
 */

const APP_DIR = join(__dirname, '..', '..', 'app')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry) ? [path] : []
  })
}

/**
 * `openGraph` and `twitter` carry their own independent titles that the
 * template never touches, so their brand usage is legitimate. Strip those
 * blocks (brace-matched, so nested objects inside them go too) before
 * scanning, leaving only titles the template actually applies to.
 */
function stripSocialBlocks(source: string): string {
  let out = source
  for (const key of ['openGraph', 'twitter']) {
    for (;;) {
      const start = out.indexOf(`${key}: {`)
      if (start === -1) break
      let depth = 0
      let i = out.indexOf('{', start)
      for (; i < out.length; i++) {
        if (out[i] === '{') depth++
        else if (out[i] === '}' && --depth === 0) break
      }
      out = out.slice(0, start) + out.slice(i + 1)
    }
  }
  return out
}

// A `title:` whose value is a bare string literal — not `{ absolute: ... }`.
const BARE_TITLE = /\btitle:\s*(['"`])((?:[^\\]|\\.)*?)\1/g

describe('page titles vs the root title template', () => {
  const offenders: string[] = []

  for (const file of sourceFiles(APP_DIR)) {
    const stripped = stripSocialBlocks(readFileSync(file, 'utf8'))
    for (const [, , value] of stripped.matchAll(BARE_TITLE)) {
      if (value.includes('MCPpedia') || value.includes('${SITE_NAME}')) {
        offenders.push(`${file.slice(APP_DIR.length + 1)}: ${value}`)
      }
    }
  }

  it('never names the brand in a title the template will append to', () => {
    expect(offenders).toEqual([])
  })
})
