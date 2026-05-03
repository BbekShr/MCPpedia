-- In-app notifications for edit approvals/rejections.
-- Inserted by the approve-edit route (run as an editor/maintainer/admin)
-- and read by the proposer via the bell in the nav.
create table public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('edit_approved', 'edit_rejected')),
  edit_id uuid references public.edits(id) on delete cascade,
  server_id uuid references public.servers(id) on delete cascade,
  field_name text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_unread
  on public.notifications(user_id, created_at desc)
  where read_at is null;

create index idx_notifications_user_recent
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "users read own notifications"
  on public.notifications
  for select
  using (auth.uid() = user_id);

create policy "users update own notifications"
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Editors and above can insert notifications targeted at any user. The
-- approve-edit route is the only writer today; this policy mirrors the role
-- check that route already enforces.
create policy "editors insert notifications"
  on public.notifications
  for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('editor', 'maintainer', 'admin')
    )
  );
