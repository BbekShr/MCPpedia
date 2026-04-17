-- Indexes for the hottest read paths identified in the perf audit.
-- CONCURRENTLY variants aren't allowed inside a migration transaction, so these
-- create quick-lock indexes. Run on off-peak if the table is large.

-- 1) Trigram indexes for `ILIKE '%q%'` searches on name/tagline/description.
--    Hit by /servers (when falling back to direct query), /category/[c], and
--    /api/v1/servers when `q` is present.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS servers_name_trgm_idx
  ON servers USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS servers_tagline_trgm_idx
  ON servers USING gin (tagline gin_trgm_ops);

CREATE INDEX IF NOT EXISTS servers_description_trgm_idx
  ON servers USING gin (description gin_trgm_ops);

-- 2) Partial index for the default sort-by-score listing. Excludes archived
--    rows so the index is smaller and the planner skips them automatically.
--    Hit by homepage top-scored, /servers, /category/[c], /best/[c], /best-for/[u].
CREATE INDEX IF NOT EXISTS servers_score_active_idx
  ON servers (score_total DESC)
  WHERE is_archived = false;

-- 3) TrendingWidget: `score_total > 50 AND npm_weekly_downloads > 100 ORDER BY downloads DESC`.
CREATE INDEX IF NOT EXISTS servers_downloads_active_idx
  ON servers (npm_weekly_downloads DESC)
  WHERE is_archived = false AND npm_weekly_downloads > 0;

-- 4) Official servers listing on homepage and /servers?author=official.
CREATE INDEX IF NOT EXISTS servers_official_score_idx
  ON servers (score_total DESC)
  WHERE is_archived = false AND author_type = 'official';

-- 5) CVE listing (homepage "With CVEs" section, /security page).
CREATE INDEX IF NOT EXISTS servers_cves_active_idx
  ON servers (cve_count DESC)
  WHERE is_archived = false AND cve_count > 0;
