export async function fetchNpmDownloads(packageName: string): Promise<number> {
  const res = await fetch(
    `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`
  )
  if (!res.ok) return 0
  const data = await res.json()
  return data.downloads || 0
}
