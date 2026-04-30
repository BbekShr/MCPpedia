-- Rewrite home_stats() from 18 sequential count(*) subqueries (each a
-- separate scan, ~6s cold and frequently hitting the 8s statement timeout)
-- to two scans using FILTER aggregates: one over servers, one over
-- security_advisories. Same shape and field names — drop-in replacement.
--
-- Cold ~457ms, warm ~83ms (was 6075ms cold). Eliminates the timeouts that
-- were rendering /security and the homepage hero with all-zero stats.

CREATE OR REPLACE FUNCTION home_stats() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  )
  FROM s, a;
$$;

REVOKE ALL ON FUNCTION home_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION home_stats() TO anon, authenticated;
