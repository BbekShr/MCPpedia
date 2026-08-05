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
--
-- ── Lock budget ────────────────────────────────────────────────────────────
-- Nothing here takes ACCESS EXCLUSIVE for longer than a catalog update.
--
-- Both columns are added nullable with no default, which in PostgreSQL 11+ is a
-- catalog-only change: instant, no table rewrite. `has_description` is
-- deliberately NOT `GENERATED ... STORED` for exactly this reason — a stored
-- generated column rewrites the whole table under ACCESS EXCLUSIVE, and
-- `servers` is 66k rows carrying the `tools` JSONB and full descriptions. Every
-- page on the site reads this table, so that rewrite is site-wide downtime for
-- however long it takes. A trigger maintains the column instead: slightly more
-- machinery, no rewrite, no downtime.
--
-- The backfill is a plain UPDATE. It takes row locks, not a table lock, so
-- reads continue throughout and only a bot writing the same row waits.
--
-- CREATE INDEX takes SHARE, which blocks writes but not reads, for a few
-- seconds on this row count. Not CONCURRENTLY, because `supabase db push` runs
-- each migration inside a transaction and CONCURRENTLY cannot.

alter table servers
  add column if not exists content_updated_at timestamptz;

-- A 1-byte encoding of the one `isServerIndexable` (lib/seo.tsx) clause that
-- would otherwise force the sitemap to download the `description` text of every
-- candidate row just to ask whether it is blank. At ~13.5k indexable servers
-- that is megabytes of egress per sitemap render on a 5 GB/month plan, for a
-- question that fits in a bit.
--
-- `btrim(...) <> ''` below is exactly the predicate's own trim semantics, so the
-- column cannot disagree with the gate — it encodes the clause, it does not
-- re-decide it.
alter table servers
  add column if not exists has_description boolean;

alter table servers
  alter column content_updated_at set default now();

-- Letter grade, not the raw score. The score itself drifts by a point or two on
-- every recompute and that is not a content change; crossing 60 into a B is.
-- Mirrors the grade thresholds in lib/seo.tsx.
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

-- Maintains both columns on every write. Runs BEFORE INSERT OR UPDATE, so it
-- must branch on TG_OP: `old` does not exist on an INSERT.
create or replace function servers_touch_content_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Always derived, never trusted from the caller — this is what keeps the
  -- column in lockstep with `description` and therefore with isServerIndexable.
  new.has_description := btrim(coalesce(new.description, '')) <> '';

  if tg_op = 'INSERT' then
    new.content_updated_at := coalesce(new.content_updated_at, now());
    return new;
  end if;

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
  before insert or update on servers
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

-- Backfill, AFTER the trigger exists so there is no window in which a concurrent
-- write lands with a null `has_description`.
--
-- `content_updated_at` is seeded from the existing timestamp — the best evidence
-- we have of when each row last changed, and it stops every URL from publishing
-- a null lastmod on the first sitemap render after this ships. `has_description`
-- needs no assignment here: the trigger derives it on every row this UPDATE
-- touches, which is all of them.
--
-- The trigger will NOT stomp the value being set: this UPDATE changes no
-- content column, so its content-change branch does not fire.
update servers
  set content_updated_at = coalesce(content_updated_at, updated_at, created_at, now());

-- Partial index backing the sitemap's indexable-server query.
--
-- The sitemap now emits only servers that pass `isServerIndexable()`
-- (lib/seo.tsx), which stays the single source of truth — this predicate is a
-- planner hint that mirrors it, not a second authority. If the two ever drift
-- the query still returns correct rows; it just loses the index and gets slow.
--
-- The ordering columns are the sitemap's own — (score_total desc, slug) — so
-- both halves of the shard render use it: the one-row seek that finds where
-- each shard begins, and the keyset walk that fills it. Without it those
-- queries sort the whole 66k-row table on every shard.
--
-- (Sizing the shard set is a seek, not a count, for the same reason: an exact
-- count over this predicate hits the anon statement timeout outright and is a
-- 66k-row sequential scan on the service role — 12s cold, 2s warm — which is
-- the query shape that took the catalog down in S20/S28.)
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
