-- The search RPC was missing an is_archived filter, so archived rows kept
-- showing up in /servers?q=... even though every other listing query hides
-- them. Surfaced after merging the ThoughtSpot duplicate.

create or replace function search_servers(
  search_query text,
  category_filter text default null,
  status_filter text default null,
  pricing_filter text default null,
  sort_by text default 'relevance',
  page_size integer default 20,
  page_offset integer default 0
)
returns setof servers
language plpgsql
as $$
begin
  return query
    select s.*
    from servers s
    where
      not coalesce(s.is_archived, false)
      and (search_query is null or search_query = '' or s.fts @@ plainto_tsquery('english', search_query))
      and (category_filter is null or category_filter = any(s.categories))
      and (status_filter is null or s.health_status = status_filter)
      and (pricing_filter is null or s.api_pricing = pricing_filter)
    order by
      case when sort_by = 'relevance' and search_query is not null and search_query != ''
           then ts_rank(s.fts, plainto_tsquery('english', search_query)) end desc nulls last,
      case when sort_by = 'stars' then s.github_stars end desc nulls last,
      case when sort_by = 'newest' then s.created_at end desc nulls last,
      case when sort_by = 'name' then s.name end asc nulls last,
      case when sort_by = 'downloads' then s.npm_weekly_downloads end desc nulls last,
      s.github_stars desc nulls last
    limit page_size
    offset page_offset;
end;
$$;
