-- ============================================
-- COMMUNITY VERIFICATION — "Works for me" votes
-- ============================================

create table community_verifications (
  user_id uuid references auth.users(id) on delete cascade,
  server_id uuid references servers(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, server_id)
);

create index community_verifications_server_idx on community_verifications(server_id);

-- Add count + flag to servers table
alter table servers
  add column community_verification_count integer default 0,
  add column community_verified boolean default false;

-- RLS
alter table community_verifications enable row level security;

create policy "Community verifications are viewable by everyone"
  on community_verifications for select using (true);

create policy "Authed users can verify"
  on community_verifications for insert with check (auth.uid() = user_id);

create policy "Users can remove own verification"
  on community_verifications for delete using (auth.uid() = user_id);
