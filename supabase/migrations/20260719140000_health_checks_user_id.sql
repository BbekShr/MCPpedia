-- Attribute health-check reports to the reporting user so one account can't
-- swing a server's status.
--
-- `last_health_check_status` was a majority vote over the last 5 rows regardless
-- of who filed them, so 5 `fail` reports from a single account (within the
-- hourly rate limit) flipped a healthy server to `fail`. Adding `user_id` lets
-- the route dedup to one vote per distinct user before taking the majority.

alter table health_checks
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists health_checks_server_user_time_idx
  on health_checks (server_id, user_id, checked_at desc);
