export interface PyPIPackageInfo {
  name: string
  description: string | null
  version: string
  homepage: string | null
}

export async function fetchPyPIPackage(packageName: string): Promise<PyPIPackageInfo | null> {
  const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`)
  if (!res.ok) return null

  const data = await res.json()
  return {
    name: data.info?.name || packageName,
    description: data.info?.summary || null,
    version: data.info?.version || 'unknown',
    homepage: data.info?.home_page || data.info?.project_urls?.Homepage || null,
  }
}

export async function searchPyPIPackages(query: string): Promise<string[]> {
  // PyPI doesn't have a search API — we use the simple index and match patterns
  // In practice, we'll search GitHub/npm and cross-reference
  // For now, return known MCP package patterns
  const knownPrefixes = ['mcp-server-', 'mcp_server_', 'mcp-']
  const results: string[] = []

  for (const prefix of knownPrefixes) {
    const name = `${prefix}${query}`
    const info = await fetchPyPIPackage(name)
    if (info) results.push(info.name)
  }

  return results
}
