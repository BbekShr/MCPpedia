-- home_stats() at ~5.7s cold under buffer pressure overshoots the anon role's
-- 3s statement_timeout. Even sub-3s warm renders are gambling against pg's
-- buffer pool when 1,914 ISR pages are prerendering at the same time.
--
-- Switch the function to read from a single-row snapshot table. Refresh
-- happens out-of-band via refresh_home_stats_cache() (called by the daily
-- compute-scores GitHub Action) using authenticator's 8s timeout — plenty
-- of headroom for the 5.7s cold scan.
--
-- Reads become a one-row select (~ms). The data is at most 24h stale, which
-- matches the homepage/security page's existing 24h unstable_cache windows.

CREATE TABLE IF NOT EXISTS home_stats_cache (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  data jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE home_stats_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_stats_cache readable by everyone" ON home_stats_cache;
CREATE POLICY "home_stats_cache readable by everyone"
  ON home_stats_cache FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION refresh_home_stats_cache() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  computed jsonb;
BEGIN
  WITH
    s AS (
      SELECT
        count(*) FILTER (WHERE is_archived = false) AS total_servers,
        count(*) FILTER (WHERE author_type = 'official' AND is_archived = false) AS official_count,
        count(*) FILTER (WHERE is_archived = false AND created_at >= NOW() - INTERVAL '7 days') AS new_last_7d,
        count(*) FILTER (WHERE cve_count > 0 AND is_archived = false) AS with_cves,
        count(*) FILTER (WHERE has_tool_poisoning = true AND is_archived = false) AS tool_poisoning_count,
        count(*) FILTER (WHERE has_injection_risk = true AND is_archived = false) AS injection_risk_count,
        count(*) FILTER (WHERE has_code_execution = true AND is_archived = false) AS code_execution_count,
        count(*) FILTER (
          WHERE is_archived = false
            AND tools IS NOT NULL
            AND jsonb_typeof(tools) = 'array'
            AND jsonb_array_length(tools) > 0
        ) AS scanned_servers,
        max(last_security_scan) AS last_security_scan
      FROM servers
    ),
    a AS (
      SELECT
        count(*) FILTER (WHERE status = 'open') AS open_cves,
        count(*) FILTER (WHERE status = 'fixed') AS fixed_cves,
        count(*) AS total_cves,
        count(*) FILTER (WHERE status = 'open' AND severity = 'critical') AS cves_critical_open,
        count(*) FILTER (WHERE status = 'open' AND severity = 'high') AS cves_high_open,
        count(*) FILTER (WHERE status = 'open' AND severity = 'medium') AS cves_medium_open,
        count(*) FILTER (WHERE status = 'open' AND severity = 'low') AS cves_low_open,
        count(*) FILTER (
          WHERE status = 'open'
            AND severity NOT IN ('critical','high','medium','low')
        ) AS cves_unscored_open,
        count(DISTINCT server_id) FILTER (WHERE status = 'open') AS servers_with_open_cves
      FROM security_advisories
    )
  SELECT jsonb_build_object(
    'total_servers',          s.total_servers,
    'official_count',         s.official_count,
    'new_last_7d',            s.new_last_7d,
    'with_cves',              s.with_cves,
    'open_cves',              a.open_cves,
    'fixed_cves',             a.fixed_cves,
    'total_cves',             a.total_cves,
    'cves_critical_open',     a.cves_critical_open,
    'cves_high_open',         a.cves_high_open,
    'cves_medium_open',       a.cves_medium_open,
    'cves_low_open',          a.cves_low_open,
    'cves_unscored_open',     a.cves_unscored_open,
    'servers_with_open_cves', a.servers_with_open_cves,
    'tool_poisoning_count',   s.tool_poisoning_count,
    'injection_risk_count',   s.injection_risk_count,
    'code_execution_count',   s.code_execution_count,
    'scanned_servers',        s.scanned_servers,
    'last_security_scan',     s.last_security_scan
  ) INTO computed
  FROM s, a;

  INSERT INTO home_stats_cache (id, data, refreshed_at)
  VALUES (true, computed, now())
  ON CONFLICT (id) DO UPDATE
    SET data = EXCLUDED.data, refreshed_at = EXCLUDED.refreshed_at;

  RETURN computed;
END;
$$;

REVOKE ALL ON FUNCTION refresh_home_stats_cache() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_home_stats_cache() TO service_role;

-- Switch home_stats() to read from the cache. Sub-ms one-row read.
CREATE OR REPLACE FUNCTION home_stats() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT data FROM home_stats_cache WHERE id = true;
$$;

REVOKE ALL ON FUNCTION home_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION home_stats() TO anon, authenticated;

-- Seed the cache so the very first read after deploy succeeds.
SELECT refresh_home_stats_cache();
