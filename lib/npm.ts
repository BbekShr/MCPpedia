export interface NpmPackageInfo {
  name: string
  description: string | null
  version: string
  weeklyDownloads: number
  repository: string | null
}

export async function searchNpmPackages(query: string): Promise<NpmPackageInfo[]> {
  const res = await fetch(
    `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=50`
  )
  if (!res.ok) return []

  const data = await res.json()
  return (data.objects || []).map((obj: { package: { name: string; description?: string; version: string; links?: { repository?: string } } }) => ({
    name: obj.package.name,
    description: obj.package.description || null,
    version: obj.package.version,
    weeklyDownloads: 0,
    repository: obj.package.links?.repository || null,
  }))
}

export async function fetchNpmDownloads(packageName: string): Promise<number> {
  const res = await fetch(
    `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`
  )
  if (!res.ok) return 0
  const data = await res.json()
  return data.downloads || 0
}

export async function fetchNpmVersion(packageName: string): Promise<string | null> {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`)
  if (!res.ok) return null
  const data = await res.json()
  return data.version || null
}
