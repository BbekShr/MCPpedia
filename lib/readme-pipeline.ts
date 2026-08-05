import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeGithubUrls from './rehype-github-urls'
import type { PluggableList } from 'unified'

// The markdown pipeline for third-party README content, in one place so the
// component and its tests cannot render through different plugin chains.

// Extend default schema to allow common README elements.
export const readmeSanitizeSchema = {
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

export const readmeRemarkPlugins: PluggableList = [remarkGfm]

// Order matters. rehypeRaw parses the embedded HTML, rehypeSanitize drops
// everything unsafe in it, and rehypeGithubUrls runs LAST — it adds `rel` and
// `target`, which the sanitizer would strip if it ran afterwards, and by that
// point every surviving href/src is already one of the safe shapes.
export function readmeRehypePlugins(owner: string, repo: string): PluggableList {
  return [rehypeRaw, [rehypeSanitize, readmeSanitizeSchema], [rehypeGithubUrls, { owner, repo }]]
}
