-- Fix: home_stats_cache stopped refreshing once the catalog roughly doubled
-- (~20k -> ~46k rows in a mid-2026-07 import). refresh_home_stats_cache() does
-- two full-table FILTER-aggregate scans over `servers` (a plain full count
-- alone is now ~5.3s) plus a scan over security_advisories, and the whole
-- thing now overshoots service_role's statement_timeout, so the daily
-- bots/compute-scores refresh returns 500 and the homepage hero + /security
-- freeze at the last successful snapshot.
--
-- Why not `SET statement_timeout` on the function itself:
--   Postgres arms the statement-timeout timer when the *top-level* statement
--   (`SELECT refresh_home_stats_cache()`) begins — before control enters the
--   function. A `SET` / `SET LOCAL` inside the SECURITY DEFINER body changes
--   the GUC only *after* the timer is already armed, so it is a no-op for the
--   function's own call. The timeout must be raised on the caller, and the
--   caller here is always service_role (the anon-facing home_stats() only ever
--   reads the sub-ms cached row, so anon/authenticated keep their short
--   timeouts and are untouched).
--
-- 120s gives generous headroom over the current ~6-15s refresh even as the
-- catalog keeps growing. This is server-only (service_role is never exposed to
-- the browser). Reversible: `ALTER ROLE service_role RESET statement_timeout;`.
--
-- Longer term, if the catalog grows large enough that even 120s is tight, the
-- refresh should be made cheaper (partial covering indexes for the per-filter
-- counts, or a reltuples estimate for total_servers) rather than raising the
-- ceiling again.
ALTER ROLE service_role SET statement_timeout = '120s';

-- Reload PostgREST so the new role setting takes effect without a restart.
NOTIFY pgrst, 'reload config';
