-- Restore compute_server_score to match lib/scoring.ts weights (30/25/20/15/10).
-- The function was overwritten in the DB with an old 5×25=125 formula after
-- migration 20260402010000 ran, causing score_efficiency to show values up to 25
-- and the analytics page to display "avg efficiency 24/20".
CREATE OR REPLACE FUNCTION compute_server_score(p_server_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  s record;
  sec_score    integer := 0;
  maint_score  integer := 0;
  doc_score    integer := 0;
  compat_score integer := 0;
  eff_score    integer := 0;
  total        integer := 0;
BEGIN
  SELECT * INTO s FROM servers WHERE id = p_server_id;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;

  -- SECURITY (0-30)
  sec_score := 30;
  IF s.cve_count > 0 THEN sec_score := sec_score - LEAST(s.cve_count * 10, 30); END IF;
  IF NOT COALESCE(s.has_authentication, false) THEN sec_score := sec_score - 4; END IF;
  IF s.license IS NULL OR s.license = '' OR s.license = 'NOASSERTION' THEN sec_score := sec_score - 3; END IF;
  IF COALESCE(s.is_archived, false) THEN sec_score := sec_score - 8; END IF;
  IF COALESCE(s.security_verified, false) THEN sec_score := sec_score + 5; END IF;
  sec_score := GREATEST(0, LEAST(sec_score, 30));

  -- MAINTENANCE (0-25)
  IF s.github_last_commit IS NOT NULL THEN
    IF    s.github_last_commit > NOW() - INTERVAL '7 days'   THEN maint_score := maint_score + 12;
    ELSIF s.github_last_commit > NOW() - INTERVAL '30 days'  THEN maint_score := maint_score + 10;
    ELSIF s.github_last_commit > NOW() - INTERVAL '90 days'  THEN maint_score := maint_score + 7;
    ELSIF s.github_last_commit > NOW() - INTERVAL '180 days' THEN maint_score := maint_score + 4;
    ELSIF s.github_last_commit > NOW() - INTERVAL '365 days' THEN maint_score := maint_score + 2;
    END IF;
  END IF;
  IF    s.github_stars >= 5000 THEN maint_score := maint_score + 5;
  ELSIF s.github_stars >= 1000 THEN maint_score := maint_score + 4;
  ELSIF s.github_stars >= 100  THEN maint_score := maint_score + 3;
  ELSIF s.github_stars >= 10   THEN maint_score := maint_score + 1;
  END IF;
  IF    s.npm_weekly_downloads >= 10000 THEN maint_score := maint_score + 5;
  ELSIF s.npm_weekly_downloads >= 1000  THEN maint_score := maint_score + 4;
  ELSIF s.npm_weekly_downloads >= 100   THEN maint_score := maint_score + 2;
  END IF;
  IF COALESCE(s.is_archived, false) THEN maint_score := maint_score - 10; END IF;
  IF s.github_open_issues > 100 THEN maint_score := maint_score - 2;
  ELSIF s.github_open_issues > 50 THEN maint_score := maint_score - 1;
  END IF;
  IF COALESCE(s.verified, false) THEN maint_score := maint_score + 3; END IF;
  maint_score := GREATEST(0, LEAST(maint_score, 25));

  -- DOCUMENTATION (0-15)
  IF s.description IS NOT NULL AND LENGTH(s.description) > 50 THEN doc_score := doc_score + 2; END IF;
  IF s.tagline IS NOT NULL AND s.tagline != '' THEN doc_score := doc_score + 1; END IF;
  IF s.github_url IS NOT NULL THEN doc_score := doc_score + 1; END IF;
  IF s.homepage_url IS NOT NULL THEN doc_score := doc_score + 1; END IF;
  IF s.api_name IS NOT NULL THEN doc_score := doc_score + 1; END IF;
  IF s.tools IS NOT NULL AND jsonb_array_length(s.tools) > 0 THEN doc_score := doc_score + 3; END IF;
  IF s.install_configs IS NOT NULL AND s.install_configs != '{}'::jsonb THEN doc_score := doc_score + 3; END IF;
  doc_score := LEAST(doc_score, 15);

  -- COMPATIBILITY (0-10)
  IF 'stdio' = ANY(s.transport) THEN compat_score := compat_score + 4; END IF;
  IF 'http' = ANY(s.transport) OR 'sse' = ANY(s.transport) THEN compat_score := compat_score + 4; END IF;
  IF ARRAY_LENGTH(s.transport, 1) > 1 THEN compat_score := compat_score + 2; END IF;
  compat_score := compat_score + LEAST(COALESCE(ARRAY_LENGTH(s.compatible_clients, 1), 0) * 2, 6);
  IF COALESCE(ARRAY_LENGTH(s.compatible_clients, 1), 0) = 0
     AND s.tools IS NOT NULL AND jsonb_array_length(s.tools) > 0
     AND 'stdio' = ANY(s.transport) THEN
    compat_score := compat_score + 3;
  END IF;
  compat_score := LEAST(compat_score, 10);

  -- EFFICIENCY (0-20)
  -- Servers with no tool data stay at 0 (not yet scanned by compute-scores bot)
  IF s.total_tool_tokens IS NOT NULL AND s.total_tool_tokens > 0 THEN
    IF    s.total_tool_tokens <= 500  THEN eff_score := 20;
    ELSIF s.total_tool_tokens <= 1500 THEN eff_score := 16;
    ELSIF s.total_tool_tokens <= 4000 THEN eff_score := 12;
    ELSIF s.total_tool_tokens <= 8000 THEN eff_score := 6;
    ELSE  eff_score := 2;
    END IF;
  ELSIF s.tools IS NOT NULL AND jsonb_array_length(s.tools) > 0 THEN
    DECLARE tool_count integer := jsonb_array_length(s.tools);
    BEGIN
      IF    tool_count <= 3  THEN eff_score := 20;
      ELSIF tool_count <= 8  THEN eff_score := 16;
      ELSIF tool_count <= 15 THEN eff_score := 12;
      ELSIF tool_count <= 30 THEN eff_score := 6;
      ELSE  eff_score := 2;
      END IF;
    END;
  END IF;

  total := LEAST(sec_score + maint_score + doc_score + compat_score + eff_score, 100);

  UPDATE servers SET
    score_total         = total,
    score_security      = sec_score,
    score_maintenance   = maint_score,
    score_documentation = doc_score,
    score_compatibility = compat_score,
    score_efficiency    = eff_score,
    score_computed_at   = NOW()
  WHERE id = p_server_id;

  RETURN jsonb_build_object(
    'total', total, 'security', sec_score, 'maintenance', maint_score,
    'documentation', doc_score, 'compatibility', compat_score, 'efficiency', eff_score
  );
END;
$$;

-- Bulk recompute all server scores in a single pass using the corrected formula
WITH computed AS (
  SELECT
    id,
    GREATEST(0, LEAST(30,
      30
      - CASE WHEN cve_count > 0 THEN LEAST(cve_count * 10, 30) ELSE 0 END
      - CASE WHEN NOT COALESCE(has_authentication, false) THEN 4 ELSE 0 END
      - CASE WHEN license IS NULL OR license = '' OR license = 'NOASSERTION' THEN 3 ELSE 0 END
      - CASE WHEN COALESCE(is_archived, false) THEN 8 ELSE 0 END
      + CASE WHEN COALESCE(security_verified, false) THEN 5 ELSE 0 END
    )) AS sec,
    GREATEST(0, LEAST(25,
      CASE
        WHEN github_last_commit > NOW() - INTERVAL '7 days'   THEN 12
        WHEN github_last_commit > NOW() - INTERVAL '30 days'  THEN 10
        WHEN github_last_commit > NOW() - INTERVAL '90 days'  THEN 7
        WHEN github_last_commit > NOW() - INTERVAL '180 days' THEN 4
        WHEN github_last_commit > NOW() - INTERVAL '365 days' THEN 2
        ELSE 0
      END
      + CASE WHEN github_stars >= 5000 THEN 5 WHEN github_stars >= 1000 THEN 4 WHEN github_stars >= 100 THEN 3 WHEN github_stars >= 10 THEN 1 ELSE 0 END
      + CASE WHEN npm_weekly_downloads >= 10000 THEN 5 WHEN npm_weekly_downloads >= 1000 THEN 4 WHEN npm_weekly_downloads >= 100 THEN 2 ELSE 0 END
      - CASE WHEN COALESCE(is_archived, false) THEN 10 ELSE 0 END
      - CASE WHEN github_open_issues > 100 THEN 2 WHEN github_open_issues > 50 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(verified, false) THEN 3 ELSE 0 END
    )) AS maint,
    LEAST(15,
      CASE WHEN description IS NOT NULL AND LENGTH(description) > 50 THEN 2 ELSE 0 END
      + CASE WHEN tagline IS NOT NULL AND tagline != '' THEN 1 ELSE 0 END
      + CASE WHEN github_url IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN homepage_url IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN api_name IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN tools IS NOT NULL AND jsonb_array_length(tools) > 0 THEN 3 ELSE 0 END
      + CASE WHEN install_configs IS NOT NULL AND install_configs != '{}'::jsonb THEN 3 ELSE 0 END
    ) AS docs,
    LEAST(10,
      CASE WHEN 'stdio' = ANY(transport) THEN 4 ELSE 0 END
      + CASE WHEN 'http' = ANY(transport) OR 'sse' = ANY(transport) THEN 4 ELSE 0 END
      + CASE WHEN ARRAY_LENGTH(transport, 1) > 1 THEN 2 ELSE 0 END
      + LEAST(COALESCE(ARRAY_LENGTH(compatible_clients, 1), 0) * 2, 6)
      + CASE WHEN COALESCE(ARRAY_LENGTH(compatible_clients, 1), 0) = 0
                  AND tools IS NOT NULL AND jsonb_array_length(tools) > 0
                  AND 'stdio' = ANY(transport) THEN 3 ELSE 0 END
    ) AS compat,
    CASE
      WHEN total_tool_tokens IS NOT NULL AND total_tool_tokens > 0 THEN
        CASE
          WHEN total_tool_tokens <= 500  THEN 20
          WHEN total_tool_tokens <= 1500 THEN 16
          WHEN total_tool_tokens <= 4000 THEN 12
          WHEN total_tool_tokens <= 8000 THEN 6
          ELSE 2
        END
      WHEN tools IS NOT NULL AND jsonb_array_length(tools) > 0 THEN
        CASE
          WHEN jsonb_array_length(tools) <= 3  THEN 20
          WHEN jsonb_array_length(tools) <= 8  THEN 16
          WHEN jsonb_array_length(tools) <= 15 THEN 12
          WHEN jsonb_array_length(tools) <= 30 THEN 6
          ELSE 2
        END
      ELSE 0
    END AS eff
  FROM servers
)
UPDATE servers s SET
  score_security      = c.sec,
  score_maintenance   = c.maint,
  score_documentation = c.docs,
  score_compatibility = c.compat,
  score_efficiency    = c.eff,
  score_total         = LEAST(100, c.sec + c.maint + c.docs + c.compat + c.eff),
  score_computed_at   = NOW()
FROM computed c
WHERE s.id = c.id;
