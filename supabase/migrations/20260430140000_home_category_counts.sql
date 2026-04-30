-- Single RPC backing the homepage "Browse by category" grid. Replaces a
-- 22-query fan-out (one count(*) per category) that was overwhelming the
-- Supabase pooler during `next build` — when 3 prerender workers render
-- 1,914 pages in parallel, several of those concurrent count queries came
-- back with `error: { message: '' }` (connection-level failure), poisoning
-- the page-level ISR cache and now (after the throw guards) failing the
-- whole build.
--
-- One scan over `servers` + GROUP BY produces all counts in a single round
-- trip. Mirrors the home_use_cases() pattern.

CREATE OR REPLACE FUNCTION home_category_counts() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(cat, n), '{}'::jsonb)
  FROM (
    SELECT unnest(s.categories) AS cat, count(*) AS n
    FROM servers s
    WHERE s.is_archived = false
      AND s.categories IS NOT NULL
    GROUP BY 1
  ) t;
$$;

REVOKE ALL ON FUNCTION home_category_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION home_category_counts() TO anon, authenticated;
