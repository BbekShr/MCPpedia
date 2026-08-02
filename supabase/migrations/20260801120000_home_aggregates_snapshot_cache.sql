-- Incident, 2026-08-01: `/` served "The catalog is temporarily unavailable" to
-- every visitor. Cause: home_use_cases() and home_category_counts() are
-- aggregate scans over the ~46k-row catalog, executed on the REQUEST path as
-- the anon role, whose statement_timeout is 3s
-- (20260430160000_home_stats_snapshot_cache.sql:1-2). Measured against prod:
-- home_use_cases 1.83s alone / 3.29s when contended with its sibling,
-- home_category_counts 1.39s alone / 3.29s contended. Both are within noise of
-- the 3s ceiling and both returned 57014 on 10/10 calls during the incident.
-- Running them in Promise.all does NOT make them free — they roughly double
-- each other.
--
-- Fix: the same shape that already rescued home_stats() — move the computation
-- off the request path into a single-row snapshot table, refreshed out of band
-- by the daily compute-scores bot as service_role, whose statement_timeout is
-- 120s (20260718120000_home_stats_refresh_timeout.sql:27). Anon then pays one
-- sub-ms single-row read per RPC. Staleness is at most 24h, which already
-- matches the homepage's unstable_cache window.
--
-- ONE table for both aggregates: they are fetched in the same Promise.all by
-- the same page, refreshed by the same bot step, and share a staleness
-- contract. Two tables would double the round trips for no benefit.
--
-- Rejected alternatives:
--   (i)   Narrowing the top-3 lists in home_use_cases — snapshotting removes
--         the cost entirely, so trimming the payload buys nothing and would
--         change what the page renders.
--   (ii)  Indexing home_category_counts — its `unnest(categories) … GROUP BY`
--         (20260430140000_home_category_counts.sql:20-24) aggregates over an
--         expanded array, which is structurally un-indexable by a btree.
--   (iii) Growing home_stats_cache.data to hold these keys — home_stats() is
--         fetched by a SEPARATE round trip on the homepage and is also read by
--         /security, which needs none of this payload. Widening it would ship
--         the use-case top-3 lists to /security on every render.
--   (iv)  Raising the liveDataOrNull budget — app/page.tsx:296-301 is already
--         at 9s against a 10s platform function floor. There is no headroom.
--
-- Also in this migration: the two security_advisories indexes the homepage
-- advisory feed and /security both need (see the bottom of this file).

CREATE TABLE IF NOT EXISTS home_aggregates_cache (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  data jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE home_aggregates_cache ENABLE ROW LEVEL SECURITY;

-- DROP before CREATE is mandatory, not defensive: Postgres ORs permissive
-- policies, so a re-run that adds a second policy of the same intent would
-- leave the weaker one deciding (the S23 hazard).
DROP POLICY IF EXISTS "home_aggregates_cache readable by everyone" ON home_aggregates_cache;
CREATE POLICY "home_aggregates_cache readable by everyone"
  ON home_aggregates_cache FOR SELECT USING (true);

-- Out-of-band refresher. The two SELECT bodies below are lifted VERBATIM from
-- the previous home_use_cases() / home_category_counts() bodies so the reader
-- RPCs' return shapes are parity-by-construction — do not "clean them up".
--
-- No `SET statement_timeout` in this body: Postgres arms the timer when the
-- top-level statement begins, before control enters the function, so a SET
-- inside a SECURITY DEFINER body is a no-op for its own call
-- (20260718120000_home_stats_refresh_timeout.sql:9-17). service_role's 120s
-- role-level setting is what covers this.
CREATE OR REPLACE FUNCTION refresh_home_aggregates_cache() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  use_cases jsonb;
  category_counts jsonb;
  computed jsonb;
BEGIN
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
    INTO use_cases
  FROM per_uc;

  SELECT COALESCE(jsonb_object_agg(cat, n), '{}'::jsonb)
    INTO category_counts
  FROM (
    SELECT unnest(s.categories) AS cat, count(*) AS n
    FROM servers s
    WHERE s.is_archived = false
      AND s.categories IS NOT NULL
    GROUP BY 1
  ) t;

  computed := jsonb_build_object(
    'use_cases', use_cases,
    'category_counts', category_counts
  );

  INSERT INTO home_aggregates_cache (id, data, refreshed_at)
  VALUES (true, computed, now())
  ON CONFLICT (id) DO UPDATE
    SET data = EXCLUDED.data, refreshed_at = EXCLUDED.refreshed_at;

  RETURN computed;
END;
$$;

REVOKE ALL ON FUNCTION refresh_home_aggregates_cache() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_home_aggregates_cache() TO service_role;

-- Reader replacements. Same names, same arity, same RETURNS jsonb — the two
-- app/page.tsx call sites are unchanged.
--
-- LOAD-BEARING: these are deliberately NOT wrapped in COALESCE(…, '{}'::jsonb),
-- which is what BOTH old bodies returned. An unseeded snapshot table yields
-- zero rows and therefore SQL NULL, and NULL is the signal the page consumes to
-- OMIT the use-case and category sections. Coalescing to '{}' here would
-- instead render a full grid of literal zeros — a visible falsehood pinned in
-- the page cache for 24h. Removing the COALESCE is the fix, not an oversight.
CREATE OR REPLACE FUNCTION home_use_cases() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT data -> 'use_cases' FROM home_aggregates_cache WHERE id = true;
$$;

REVOKE ALL ON FUNCTION home_use_cases() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION home_use_cases() TO anon, authenticated;

CREATE OR REPLACE FUNCTION home_category_counts() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT data -> 'category_counts' FROM home_aggregates_cache WHERE id = true;
$$;

REVOKE ALL ON FUNCTION home_category_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION home_category_counts() TO anon, authenticated;

-- security_advisories (27,405 rows) has no index on published_at at all, so the
-- homepage advisory feed (app/page.tsx:144) and /security (app/security/page.tsx:108)
-- each pay a full sort. CONCURRENTLY is not usable inside a migration
-- transaction (20260417210424_hot_query_indexes.sql:2-3).
--
-- Plain `DESC`, never `DESC NULLS LAST`: Postgres DESC defaults to NULLS FIRST,
-- and postgrest-js emits a bare `ORDER BY … DESC` when `nullsFirst` is omitted,
-- which is exactly what both call sites now do. A NULLS LAST index would match
-- neither ordering (the S54 trap). Zero rows have a null published_at anyway.
CREATE INDEX IF NOT EXISTS security_advisories_published_at_idx
  ON security_advisories (published_at DESC);

-- /security filters to open advisories before ordering; the partial index keeps
-- that path off the full table.
CREATE INDEX IF NOT EXISTS security_advisories_open_published_at_idx
  ON security_advisories (published_at DESC) WHERE status = 'open';

-- Seed the snapshot so the first read after deploy succeeds instead of omitting
-- two sections until the next nightly compute-scores run.
--
-- `SET LOCAL` here IS effective, unlike the SECURITY DEFINER body case above:
-- this is a top-level SET on the migration's own transaction, applied before
-- the DO block's statement starts, so the timer for that statement is armed
-- with the raised value.
SET LOCAL statement_timeout = '120s';
DO $$
BEGIN
  PERFORM refresh_home_aggregates_cache();
EXCEPTION WHEN OTHERS THEN
  -- A statement timeout raises 57014 query_canceled, which plpgsql can trap, so
  -- the DO block rolls back to its implicit savepoint and the migration COMMITS
  -- with a warning rather than aborting the whole deploy on a slow scan.
  RAISE WARNING 'home_aggregates_cache seed failed (%) — the homepage will omit the use-case and category sections until the next compute-scores run', SQLERRM;
END;
$$;
