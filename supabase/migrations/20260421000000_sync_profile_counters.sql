-- Keep profiles.servers_submitted and profiles.edits_approved in sync with
-- actual rows in `servers` and `edits`. These columns shipped in the initial
-- schema with default 0 but no triggers, so the admin panel and profile pages
-- showed stale zeros for every contributor.
--
-- discussions_count is maintained by the /api/discuss route handler and left
-- alone here.

-- ============================================================================
-- servers_submitted: count of servers where submitted_by = profile.id
-- ============================================================================

create or replace function sync_servers_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.submitted_by is not null then
      update profiles
      set servers_submitted = servers_submitted + 1
      where id = new.submitted_by;
    end if;
  elsif tg_op = 'DELETE' then
    if old.submitted_by is not null then
      update profiles
      set servers_submitted = greatest(servers_submitted - 1, 0)
      where id = old.submitted_by;
    end if;
  elsif tg_op = 'UPDATE' then
    if coalesce(new.submitted_by::text, '') <> coalesce(old.submitted_by::text, '') then
      if old.submitted_by is not null then
        update profiles
        set servers_submitted = greatest(servers_submitted - 1, 0)
        where id = old.submitted_by;
      end if;
      if new.submitted_by is not null then
        update profiles
        set servers_submitted = servers_submitted + 1
        where id = new.submitted_by;
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_servers_submitted on servers;
create trigger trg_sync_servers_submitted
  after insert or update of submitted_by or delete on servers
  for each row execute function sync_servers_submitted();

-- ============================================================================
-- edits_approved: count of edits where status='approved' and user_id=profile.id
-- ============================================================================

create or replace function sync_edits_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' and new.user_id is not null then
      update profiles
      set edits_approved = edits_approved + 1
      where id = new.user_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'approved' and old.user_id is not null then
      update profiles
      set edits_approved = greatest(edits_approved - 1, 0)
      where id = old.user_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status <> 'approved' and new.status = 'approved' and new.user_id is not null then
      update profiles
      set edits_approved = edits_approved + 1
      where id = new.user_id;
    elsif old.status = 'approved' and new.status <> 'approved' and old.user_id is not null then
      update profiles
      set edits_approved = greatest(edits_approved - 1, 0)
      where id = old.user_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_edits_approved on edits;
create trigger trg_sync_edits_approved
  after insert or update of status or delete on edits
  for each row execute function sync_edits_approved();

-- ============================================================================
-- Backfill existing rows so current contributors see correct counts
-- ============================================================================

update profiles p
set servers_submitted = coalesce(sub.c, 0)
from (
  select submitted_by as id, count(*)::int as c
  from servers
  where submitted_by is not null
  group by submitted_by
) sub
where p.id = sub.id;

update profiles p
set edits_approved = coalesce(sub.c, 0)
from (
  select user_id as id, count(*)::int as c
  from edits
  where status = 'approved' and user_id is not null
  group by user_id
) sub
where p.id = sub.id;
