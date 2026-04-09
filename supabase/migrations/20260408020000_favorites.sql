-- Favorites: users can save servers to their personal list
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  server_id uuid not null references servers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, server_id)
);

-- Index for fast user-level lookups
create index if not exists idx_favorites_user on favorites(user_id, created_at desc);

-- Index for counting how many users favorited a server
create index if not exists idx_favorites_server on favorites(server_id);

-- RLS: users can only see and manage their own favorites
alter table favorites enable row level security;

create policy "Users can view own favorites"
  on favorites for select
  using (auth.uid() = user_id);

create policy "Users can insert own favorites"
  on favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
  on favorites for delete
  using (auth.uid() = user_id);
