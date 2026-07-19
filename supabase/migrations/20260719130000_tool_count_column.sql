-- Denormalize the per-server tool count into a stored generated column.
--
-- Listing/card views (homepage, /servers, /category, /best, similar-servers,
-- the search API, and the detail page's generateMetadata/OG image) previously
-- shipped the full `tools` JSONB — the heaviest column in the table — solely to
-- render `tools.length`. That is the largest egress line on the shared Supabase
-- pool and a repeat cause of build-time statement timeouts (see S8/S12).
--
-- `tool_count` is GENERATED ALWAYS ... STORED, so Postgres maintains it on every
-- write to `tools` with no trigger and no bot change. The CASE guards against any
-- row whose `tools` is not a JSON array (jsonb_array_length would otherwise error).

alter table servers
  add column if not exists tool_count integer
  generated always as (
    coalesce(
      jsonb_array_length(
        case when jsonb_typeof(tools) = 'array' then tools else '[]'::jsonb end
      ),
      0
    )
  ) stored;
