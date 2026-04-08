-- MCP API usage tracking — daily counts per action, no user data
CREATE TABLE mcp_api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_date date NOT NULL,
  action text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  UNIQUE (usage_date, action)
);

CREATE INDEX mcp_api_usage_date_idx ON mcp_api_usage(usage_date DESC);

ALTER TABLE mcp_api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read usage" ON mcp_api_usage FOR SELECT USING (true);

-- Atomic increment function (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION increment_mcp_usage(p_date date, p_action text)
RETURNS void AS $$
BEGIN
  INSERT INTO mcp_api_usage (usage_date, action, count)
  VALUES (p_date, p_action, 1)
  ON CONFLICT (usage_date, action)
  DO UPDATE SET count = mcp_api_usage.count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
