-- Karma / contribution points.
--
-- Every point-awarding action inserts a row into karma_events so the full
-- history is auditable (who did what, when, for how many points, against which
-- subject). profiles.karma is a running sum maintained by a trigger on the
-- events table so reading a profile page doesn't require summing thousands of
-- rows.
--
-- Point values (mirror app/profile/[username]/page.tsx and docs):
--   submit_server:      +15  refunded on delete
--   edit_approved:       +5  refunded when an approved edit is reverted
--   edit_proposed:       +1  refunded on reject
--   discussion_post:     +2
--   verification:        +1  refunded when the user un-verifies

-- ============================================================================
-- Events table
-- ============================================================================

create table karma_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in (
    'submit_server',
    'edit_proposed',
    'edit_approved',
    'discussion_post',
    'verification',
    'edit_rejected_refund',
    'edit_unapproved_refund',
    'submit_server_refund',
    'verification_refund'
  )),
  points integer not null,
  server_id uuid references servers(id) on delete set null,
  edit_id uuid references edits(id) on delete set null,
  discussion_id uuid references discussions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index karma_events_user_idx on karma_events(user_id, created_at desc);
create index karma_events_server_idx on karma_events(server_id);

alter table karma_events enable row level security;

create policy "Karma events are viewable by everyone"
  on karma_events for select using (true);

-- No insert/update/delete policies: the service role (via triggers) is the
-- only writer.

-- ============================================================================
-- profiles.karma column, kept in sync by a trigger on karma_events
-- ============================================================================

alter table profiles
  add column if not exists karma integer not null default 0;

create or replace function apply_karma_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update profiles set karma = karma + new.points where id = new.user_id;
  elsif tg_op = 'DELETE' then
    update profiles set karma = karma - old.points where id = old.user_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_apply_karma_event on karma_events;
create trigger trg_apply_karma_event
  after insert or delete on karma_events
  for each row execute function apply_karma_event();

-- ============================================================================
-- Award karma on action
-- ============================================================================

-- Server submission: award when a community-submitted server is created.
-- Bots (source != 'manual', submitted_by null) don't mint karma.
create or replace function award_server_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.submitted_by is not null and new.source = 'manual' then
      insert into karma_events (user_id, action, points, server_id)
      values (new.submitted_by, 'submit_server', 15, new.id);
    end if;
  elsif tg_op = 'DELETE' then
    if old.submitted_by is not null and old.source = 'manual' then
      insert into karma_events (user_id, action, points, server_id)
      values (old.submitted_by, 'submit_server_refund', -15, old.id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_award_server_submission on servers;
create trigger trg_award_server_submission
  after insert or delete on servers
  for each row execute function award_server_submission();

-- Edit proposals: +1 on submit, +5 on approval (in addition to the +1).
-- Refund the +1 if rejected, and refund +5 if an approved edit is unapproved.
create or replace function award_edit_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null then
      insert into karma_events (user_id, action, points, server_id, edit_id)
      values (new.user_id, 'edit_proposed', 1, new.server_id, new.id);
      if new.status = 'approved' then
        insert into karma_events (user_id, action, points, server_id, edit_id)
        values (new.user_id, 'edit_approved', 5, new.server_id, new.id);
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.user_id is not null and old.status <> new.status then
      if old.status <> 'approved' and new.status = 'approved' then
        insert into karma_events (user_id, action, points, server_id, edit_id)
        values (new.user_id, 'edit_approved', 5, new.server_id, new.id);
      elsif old.status = 'approved' and new.status <> 'approved' then
        insert into karma_events (user_id, action, points, server_id, edit_id)
        values (new.user_id, 'edit_unapproved_refund', -5, new.server_id, new.id);
      end if;

      if old.status = 'pending' and new.status = 'rejected' then
        insert into karma_events (user_id, action, points, server_id, edit_id)
        values (new.user_id, 'edit_rejected_refund', -1, new.server_id, new.id);
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_award_edit_events on edits;
create trigger trg_award_edit_events
  after insert or update of status on edits
  for each row execute function award_edit_events();

-- Discussion posts: +2 on first insert. No refunds on soft-delete.
create or replace function award_discussion_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    insert into karma_events (user_id, action, points, server_id, discussion_id)
    values (new.user_id, 'discussion_post', 2, new.server_id, new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_award_discussion_post on discussions;
create trigger trg_award_discussion_post
  after insert on discussions
  for each row execute function award_discussion_post();

-- Community verifications: +1 on add, refund on remove so users can't farm
-- karma by toggling.
create or replace function award_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into karma_events (user_id, action, points, server_id)
    values (new.user_id, 'verification', 1, new.server_id);
  elsif tg_op = 'DELETE' then
    insert into karma_events (user_id, action, points, server_id)
    values (old.user_id, 'verification_refund', -1, old.server_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_award_verification on community_verifications;
create trigger trg_award_verification
  after insert or delete on community_verifications
  for each row execute function award_verification();

-- ============================================================================
-- Backfill from existing data. Runs once, in order, so counts are correct for
-- anyone who contributed before this migration.
-- ============================================================================

insert into karma_events (user_id, action, points, server_id, created_at)
select submitted_by, 'submit_server', 15, id, coalesce(created_at, now())
from servers
where submitted_by is not null and source = 'manual';

-- +1 for every proposed edit (pending/approved/rejected)
insert into karma_events (user_id, action, points, server_id, edit_id, created_at)
select user_id, 'edit_proposed', 1, server_id, id, coalesce(created_at, now())
from edits
where user_id is not null;

-- +5 bonus for approved edits
insert into karma_events (user_id, action, points, server_id, edit_id, created_at)
select user_id, 'edit_approved', 5, server_id, id, coalesce(reviewed_at, created_at, now())
from edits
where user_id is not null and status = 'approved';

-- -1 refund for rejected edits (cancels the +1 proposed above)
insert into karma_events (user_id, action, points, server_id, edit_id, created_at)
select user_id, 'edit_rejected_refund', -1, server_id, id, coalesce(reviewed_at, created_at, now())
from edits
where user_id is not null and status = 'rejected';

insert into karma_events (user_id, action, points, server_id, discussion_id, created_at)
select user_id, 'discussion_post', 2, server_id, id, coalesce(created_at, now())
from discussions
where user_id is not null;

insert into karma_events (user_id, action, points, server_id, created_at)
select user_id, 'verification', 1, server_id, coalesce(created_at, now())
from community_verifications
where user_id is not null;
