const DEFAULT_BASE_URL = "https://mcppedia.org";

function getConfig(): { baseUrl: string } {
  const baseUrl = (process.env.MCPPEDIA_API_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    ""
  );
  return { baseUrl };
}

// ─── Response cache ─────────────────────────────────────────
// Short TTL cache to avoid hitting the API for repeated queries.
// Trending/search results cached 2 min, detail/security 5 min.

const TTL: Record<string, number> = {
  search: 120_000,
  trending: 120_000,
  details: 300_000,
  security: 300_000,
  compare: 120_000,
  install: 600_000,
};

const cache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache(key: string, data: unknown, action: string): void {
  const ttl = TTL[action] || 120_000;
  cache.set(key, { data, expiresAt: Date.now() + ttl });

  // Evict old entries if cache grows too large (max 200 entries)
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt < now) cache.delete(k);
    }
    // If still too large, drop oldest half
    if (cache.size > 200) {
      const keys = [...cache.keys()];
      for (let i = 0; i < keys.length / 2; i++) {
        cache.delete(keys[i]);
      }
    }
  }
}

// ─── API client ─────────────────────────────────────────────

export async function mcpApiCall(
  action: string,
  params: Record<string, unknown>
): Promise<{ data?: unknown; error?: string }> {
  const cacheKey = `${action}:${JSON.stringify(params)}`;

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached !== undefined) {
    return { data: cached };
  }

  const { baseUrl } = getConfig();
  const url = `${baseUrl}/api/mcp`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, params }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `MCPpedia API unreachable: ${msg}` };
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After") || "60";
    return { error: `Rate limited. Try again in ${retryAfter} seconds.` };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return {
      error:
        (body as Record<string, string>).error || `API error: ${res.status}`,
    };
  }

  const body = await res.json().catch(() => ({}));
  const data = (body as Record<string, unknown>).data;

  // Cache successful responses
  if (data) {
    setCache(cacheKey, data, action);
  }

  return { data };
}
