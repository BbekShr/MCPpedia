const DEFAULT_BASE_URL = "https://mcppedia.org";

function getConfig(): { baseUrl: string } {
  const baseUrl = (process.env.MCPPEDIA_API_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    ""
  );
  return { baseUrl };
}

// ─── Response cache with ETag support ───────────────────────
// Short TTL, plus If-None-Match revalidation so stable resources survive
// beyond TTL without a full payload refetch.

const TTL: Record<string, number> = {
  search: 120_000,
  trending: 120_000,
  details: 300_000,
  security: 300_000,
  compare: 120_000,
  install: 600_000,
  categories: 3_600_000, // categories barely change — 1h
  changes: 60_000,       // deltas refresh fast
};

type CacheEntry = { data: unknown; etag?: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function getCached(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  return entry;
}

function setCache(
  key: string,
  data: unknown,
  action: string,
  etag?: string
): void {
  const ttl = TTL[action] || 120_000;
  cache.set(key, { data, etag, expiresAt: Date.now() + ttl });

  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt < now) cache.delete(k);
    }
    if (cache.size > 200) {
      const keys = [...cache.keys()];
      for (let i = 0; i < keys.length / 2; i++) cache.delete(keys[i]);
    }
  }
}

// ─── Telemetry hook ─────────────────────────────────────────
// Set MCPPEDIA_TELEMETRY=1 to emit stderr logs of tool + latency. Safe for
// stdio transport because stdio uses stdout for MCP framing, not stderr.

const telemetryEnabled = process.env.MCPPEDIA_TELEMETRY === "1";

export function logTelemetry(event: Record<string, unknown>): void {
  if (!telemetryEnabled) return;
  try {
    console.error(JSON.stringify({ ts: Date.now(), ...event }));
  } catch {
    /* swallow */
  }
}

// ─── API client ─────────────────────────────────────────────

export async function mcpApiCall(
  action: string,
  params: Record<string, unknown>
): Promise<{ data?: unknown; error?: string }> {
  const cacheKey = `${action}:${JSON.stringify(params)}`;
  const cached = getCached(cacheKey);

  // Still-fresh cache hit — no network
  if (cached && Date.now() <= cached.expiresAt) {
    logTelemetry({ event: "cache_hit", action });
    return { data: cached.data };
  }

  const { baseUrl } = getConfig();
  const url = `${baseUrl}/api/mcp`;
  const started = Date.now();

  let res: Response;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cached?.etag) headers["If-None-Match"] = cached.etag;

    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ action, params }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logTelemetry({ event: "fetch_error", action, error: msg });
    return { error: `MCPpedia API unreachable: ${msg}` };
  }

  const latency = Date.now() - started;

  // 304: server confirmed cache is still good — extend TTL
  if (res.status === 304 && cached) {
    cache.set(cacheKey, {
      data: cached.data,
      etag: cached.etag,
      expiresAt: Date.now() + (TTL[action] || 120_000),
    });
    logTelemetry({ event: "etag_revalidate", action, latency });
    return { data: cached.data };
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After") || "60";
    return { error: `Rate limited. Try again in ${retryAfter} seconds.` };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return {
      error: (body as Record<string, string>).error || `API error: ${res.status}`,
    };
  }

  const body = await res.json().catch(() => ({}));
  const data = (body as Record<string, unknown>).data;
  const etag = res.headers.get("ETag") || undefined;

  if (data !== undefined) setCache(cacheKey, data, action, etag);

  logTelemetry({ event: "fetch_ok", action, latency, cached: false });
  return { data };
}
