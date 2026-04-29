-- Single RPC backing the homepage "Browse by use case" tiles. Replaces
-- 12 separate supabase-js queries (6 count + 6 top-3) with one Postgres
-- call. The previous fan-out fired ~50 concurrent fetches per home render
-- and intermittently came back with `count: null` / `data: null` for the
-- larger categories (developer-tools, ai-ml, data, productivity), which
-- the `?? 0` fallback rendered as empty tiles.
--
-- The use-case → category mapping is duplicated in HOMEPAGE_USECASES on
-- the client (titles/colors live there); update both together if either
-- changes.

CREATE OR REPLACE FUNCTION home_use_cases() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH usecases (id, cats) AS (
    VALUES
      ('developers',           ARRAY['developer-tools']),
      ('data-engineering',     ARRAY['data','analytics']),
      ('productivity',         ARRAY['productivity','communication']),
      ('ai-agents',            ARRAY['ai-ml']),
      ('cloud-infrastructure', ARRAY['cloud','devops']),
      ('security',             ARRAY['security'])
  ),
  per_uc AS (
    SELECT
      u.id,
      (
        SELECT count(*)
        FROM servers s
        WHERE s.is_archived = false AND s.categories && u.cats
      ) AS n,
      (
        SELECT COALESCE(jsonb_agg(
                 jsonb_build_object(
                   'slug',          t.slug,
                   'name',          t.name,
                   'homepage_url',  t.homepage_url,
                   'author_github', t.author_github
                 )
                 ORDER BY t.score_total DESC NULLS LAST
               ), '[]'::jsonb)
        FROM (
          SELECT s.slug, s.name, s.homepage_url, s.author_github, s.score_total
          FROM servers s
          WHERE s.is_archived = false AND s.categories && u.cats
          ORDER BY s.score_total DESC NULLS LAST
          LIMIT 3
        ) t
      ) AS top3
    FROM usecases u
  )
  SELECT COALESCE(
           jsonb_object_agg(id, jsonb_build_object('count', n, 'top', top3)),
           '{}'::jsonb
         )
  FROM per_uc;
$$;

REVOKE ALL ON FUNCTION home_use_cases() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION home_use_cases() TO anon, authenticated;
