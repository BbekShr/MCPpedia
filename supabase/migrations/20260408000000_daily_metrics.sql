-- Daily ecosystem metrics snapshots for historical tracking
CREATE TABLE daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date UNIQUE NOT NULL,

  -- Summary scalars
  total_servers integer NOT NULL,
  servers_added_today integer DEFAULT 0,
  avg_score_total integer,
  avg_score_security integer,
  avg_score_maintenance integer,
  avg_score_documentation integer,
  avg_score_compatibility integer,
  avg_score_efficiency integer,
  total_github_stars bigint,
  total_npm_weekly_downloads bigint,
  total_tools integer,
  servers_with_cves integer,
  servers_with_auth integer,

  -- CVE / security scalars
  open_cves integer,
  fixed_cves integer,
  total_cves integer,
  cves_critical integer,
  cves_high integer,
  cves_medium integer,
  cves_low integer,
  cves_unscored integer,
  tool_poisoning_count integer,
  injection_risk_count integer,

  -- Distribution data (JSONB for flexibility)
  score_buckets jsonb,
  categories jsonb,
  health_status jsonb,
  author_type jsonb,
  api_pricing jsonb,
  transport jsonb,
  compatible_clients jsonb,
  token_efficiency_grades jsonb,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX daily_metrics_date_idx ON daily_metrics(snapshot_date DESC);

ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read daily metrics"
  ON daily_metrics FOR SELECT USING (true);
