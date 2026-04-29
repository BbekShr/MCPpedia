export function normalizeGithubUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim().toLowerCase()
  if (!trimmed) return null
  return trimmed
    .replace(/^http:\/\//, 'https://')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
}

export function normalizePackageName(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim().toLowerCase()
  return trimmed || null
}
