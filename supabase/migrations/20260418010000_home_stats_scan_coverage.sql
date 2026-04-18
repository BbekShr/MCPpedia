-- Add `scanned_servers` to home_stats() — the denominator for AI-specific
-- flag prevalence. These flags (has_tool_poisoning, has_injection_risk,
-- has_code_execution) are only computable when a tool manifest was
-- successfully extracted; every other server defaults to false because
-- there's no data to analyze.
--
-- Without this field, consumers divide the flag counts by `total_servers`
-- (18,855) and report ~0.1–1% prevalence. The real denominator is ~1,561
-- scannable servers, so actual prevalence is ~1–12%. The previous blog
-- post framed code-execution as "Small as a percentage" using 0.97% — the
-- corrected rate is 11.7%, a meaningfully different headline.

CREATE OR REPLACE FUNCTION home_stats() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_servers',       (SELECT count(*) FROM servers WHERE is_archived = false),
    'official_count',      (SELECT count(*) FROM servers WHERE author_type = 'official' AND is_archived = false),
    'new_last_7d',         (SELECT count(*) FROM servers WHERE is_archived = false AND created_at >= NOW() - INTERVAL '7 days'),
    'with_cves',           (SELECT count(*) FROM servers WHERE cve_count > 0 AND is_archived = false),
    'open_cves',           (SELECT count(*) FROM security_advisories WHERE status = 'open'),
    'fixed_cves',          (SELECT count(*) FROM security_advisories WHERE status = 'fixed'),
    'total_cves',          (SELECT count(*) FROM security_advisories),
    'cves_critical_open',  (SELECT count(*) FROM security_advisories WHERE status = 'open' AND severity = 'critical'),
    'cves_high_open',      (SELECT count(*) FROM security_advisories WHERE status = 'open' AND severity = 'high'),
    'cves_medium_open',    (SELECT count(*) FROM security_advisories WHERE status = 'open' AND severity = 'medium'),
    'cves_low_open',       (SELECT count(*) FROM security_advisories WHERE status = 'open' AND severity = 'low'),
    'cves_unscored_open',  (SELECT count(*) FROM security_advisories WHERE status = 'open' AND severity NOT IN ('critical','high','medium','low')),
    'servers_with_open_cves', (SELECT count(DISTINCT server_id) FROM security_advisories WHERE status = 'open'),
    'tool_poisoning_count',(SELECT count(*) FROM servers WHERE has_tool_poisoning = true AND is_archived = false),
    'injection_risk_count',(SELECT count(*) FROM servers WHERE has_injection_risk = true AND is_archived = false),
    'code_execution_count',(SELECT count(*) FROM servers WHERE has_code_execution = true AND is_archived = false),
    'scanned_servers',     (SELECT count(*) FROM servers WHERE is_archived = false AND tools IS NOT NULL AND jsonb_typeof(tools) = 'array' AND jsonb_array_length(tools) > 0),
    'last_security_scan',  (SELECT max(last_security_scan) FROM servers WHERE last_security_scan IS NOT NULL)
  )
$$;

REVOKE ALL ON FUNCTION home_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION home_stats() TO anon, authenticated;
