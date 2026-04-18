-- Expand home_stats() into the single source of truth for every site-wide
-- aggregate. Previously the RPC only carried 4 fields for the homepage;
-- /security and blog posts computed their own counts separately, which
-- drifted (archived servers were included in some places, excluded in
-- others, producing different totals on different pages).
--
-- After this migration, every public aggregate should come from this RPC.
-- Rules embedded in the implementation:
--   - `total_servers` and every `servers`-derived count EXCLUDES archived.
--     Archived rows (~300) are hidden from public listings; including them
--     in stats created homepage/blog mismatches.
--   - Security-advisory counts are not filtered by archive status (they're
--     about the advisory itself, not the hosting server).

CREATE OR REPLACE FUNCTION home_stats() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    -- Catalog size (always archive-filtered)
    'total_servers',       (SELECT count(*) FROM servers WHERE is_archived = false),
    'official_count',      (SELECT count(*) FROM servers WHERE author_type = 'official' AND is_archived = false),
    'new_last_7d',         (SELECT count(*) FROM servers WHERE is_archived = false AND created_at >= NOW() - INTERVAL '7 days'),

    -- CVE state (servers)
    'with_cves',           (SELECT count(*) FROM servers WHERE cve_count > 0 AND is_archived = false),

    -- CVE state (advisories)
    'open_cves',           (SELECT count(*) FROM security_advisories WHERE status = 'open'),
    'fixed_cves',          (SELECT count(*) FROM security_advisories WHERE status = 'fixed'),
    'total_cves',          (SELECT count(*) FROM security_advisories),
    'cves_critical_open',  (SELECT count(*) FROM security_advisories WHERE status = 'open' AND severity = 'critical'),
    'cves_high_open',      (SELECT count(*) FROM security_advisories WHERE status = 'open' AND severity = 'high'),
    'cves_medium_open',    (SELECT count(*) FROM security_advisories WHERE status = 'open' AND severity = 'medium'),
    'cves_low_open',       (SELECT count(*) FROM security_advisories WHERE status = 'open' AND severity = 'low'),
    'cves_unscored_open',  (SELECT count(*) FROM security_advisories WHERE status = 'open' AND severity NOT IN ('critical','high','medium','low')),
    'servers_with_open_cves', (SELECT count(DISTINCT server_id) FROM security_advisories WHERE status = 'open'),

    -- AI-specific risk flags (always archive-filtered)
    'tool_poisoning_count',(SELECT count(*) FROM servers WHERE has_tool_poisoning = true AND is_archived = false),
    'injection_risk_count',(SELECT count(*) FROM servers WHERE has_injection_risk = true AND is_archived = false),
    'code_execution_count',(SELECT count(*) FROM servers WHERE has_code_execution = true AND is_archived = false),

    -- Freshness signal
    'last_security_scan',  (SELECT max(last_security_scan) FROM servers WHERE last_security_scan IS NOT NULL)
  )
$$;

REVOKE ALL ON FUNCTION home_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION home_stats() TO anon, authenticated;
