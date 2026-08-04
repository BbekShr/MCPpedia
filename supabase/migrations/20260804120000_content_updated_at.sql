-- `content_updated_at` — a lastmod the sitemap can honestly publish.
--
-- The sitemap used `servers.updated_at` for every URL's <lastmod>. That column
-- moves whenever ANY bot writes the row — the stars/downloads refresh alone
-- touches most of the catalog daily — so every one of the ~36k URLs claimed to
-- have changed every day. Search Console's response was to stop trusting the
-- file entirely ("last read Apr 26, 0 discovered pages"): a sitemap where
-- everything is always fresh carries the same information as one where nothing
-- is, and Google discounts it accordingly.
--
-- This column advances ONLY when something a reader would notice changes:
-- description, tagline, the tool inventory, categories, a score crossing a
-- letter-grade boundary, or a new security advisory. A stars bump, a downloads
-- refresh, a re-scan that lands on the same numbers — none of those move it.

alter table servers
  add column if not exists content_updated_at timestamptz;

-- Backfill from the existing timestamp: it is the best evidence we have of when
-- each row last changed, and it stops every URL from publishing a null lastmod
-- on the first sitemap render after this ships.
update servers
  set content_updated_at = coalesce(updated_at, created_at, now())
  where content_updated_at is null;

alter table servers
  alter column content_updated_at set default now();

-- `has_description` — a 1-byte encoding of the one `isServerIndexable`
-- (lib/seo.tsx) clause that would otherwise force the sitemap to download the
-- `description` text of every candidate row just to ask whether it is blank.
-- At ~13.5k indexable servers that is megabytes of egress per sitemap render on
-- a 5 GB/month plan, for a question that fits in a bit.
--
-- `btrim(...) <> ''` is exactly the predicate's own trim semantics, so the
-- column cannot disagree with the gate — it encodes the clause, it does not
-- re-decide it. GENERATED ... STORED, so Postgres maintains it with no trigger
-- and no bot change.
alter table servers
  add column if not exists has_description boolean
  generated always as (btrim(coalesce(description, '')) <> '') stored;

-- Letter grade, not the raw score. The score itself drifts by a point or two on
-- every recompute and that is not a content change; crossing 60 into a B is.
-- Mirrors the grade thresholds in app/s/[slug]/page.tsx.
create or replace function mcppedia_score_grade(score integer)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when coalesce(score, 0) >= 80 then 'A'
    when coalesce(score, 0) >= 60 then 'B'
    when coalesce(score, 0) >= 40 then 'C'
    when coalesce(score, 0) >= 20 then 'D'
    else 'F'
  end
$$;

create or replace function servers_touch_content_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.description is distinct from old.description
     or new.tagline is distinct from old.tagline
     or new.tools is distinct from old.tools
     or new.categories is distinct from old.categories
     or new.is_archived is distinct from old.is_archived
     or mcppedia_score_grade(new.score_total) is distinct from mcppedia_score_grade(old.score_total)
  then
    new.content_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists servers_content_updated_at on servers;
create trigger servers_content_updated_at
  before update on servers
  for each row
  execute function servers_touch_content_updated_at();

-- A new advisory changes what the page says about the server, but lives in
-- another table, so the row trigger above cannot see it.
create or replace function security_advisories_touch_server_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update servers
    set content_updated_at = now()
    where id = new.server_id;
  return new;
end;
$$;

drop trigger if exists security_advisories_touch_server on security_advisories;
create trigger security_advisories_touch_server
  after insert on security_advisories
  for each row
  execute function security_advisories_touch_server_content();

-- Partial index backing the sitemap's indexable-server query.
--
-- The sitemap now emits only servers that pass `isServerIndexable()`
-- (lib/seo.tsx), which stays the single source of truth — this predicate is a
-- planner hint that mirrors it, not a second authority. If the two ever drift
-- the query still returns correct rows; it just loses the index and gets slow.
--
-- Without it, counting the indexable set is a sequential scan of 66k rows
-- (measured: 12s cold, 2s warm) — exactly the shape of exact-count query that
-- has taken the catalog down twice (S20/S28). The included ordering columns are
-- the sitemap's own (score_total desc, slug), so the shard walk rides it too.
create index if not exists servers_sitemap_indexable_idx
  on servers (score_total desc, slug)
  where is_archived = false
    and (
      has_description
      or (tool_count > 0 and score_total >= 40)
      or score_total >= 60
      or review_count > 0
      or community_verified
    );
