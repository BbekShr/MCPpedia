-- Homepage counter aggregation. The previous homepage fired three `count`
-- queries + one advisories count in parallel (four round-trips). Consolidating
-- into a single RPC drops cold TTFB by ~100ms.

CREATE OR REPLACE FUNCTION home_stats() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_servers', (SELECT count(*) FROM servers WHERE is_archived = false),
    'with_cves',     (SELECT count(*) FROM servers WHERE cve_count > 0 AND is_archived = false),
    'official_count',(SELECT count(*) FROM servers WHERE author_type = 'official' AND is_archived = false),
    'open_cves',     (SELECT count(*) FROM security_advisories WHERE status = 'open')
  )
$$;

REVOKE ALL ON FUNCTION home_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION home_stats() TO anon, authenticated;
