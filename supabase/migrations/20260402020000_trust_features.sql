-- ============================================
-- TRUST FEATURES: Health checks, verified publishers, reviews
-- ============================================

-- Health check results — did the server actually start and respond?
create table if not exists health_checks (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references servers(id) on delete cascade,

  status text not null check (status in ('pass', 'fail', 'timeout', 'error')),
  response_time_ms integer,            -- how long to get first response
  error_message text,                  -- if failed, why
  checked_transport text,              -- 'stdio', 'http', 'sse'
  checked_client text,                 -- 'claude-desktop', 'cursor', etc.
  tools_responded integer default 0,   -- how many tools the server reported
  mcp_version text,                    -- protocol version reported

  checked_at timestamptz default now()
);

create index health_checks_server_idx on health_checks(server_id);
create index health_checks_status_idx on health_checks(status);
create index health_checks_time_idx on health_checks(checked_at desc);

alter table health_checks enable row level security;
create policy "Health checks are viewable by everyone"
  on health_checks for select using (true);

-- Add last health check fields to servers
alter table servers add column if not exists last_health_check_status text
  check (last_health_check_status in ('pass', 'fail', 'timeout', 'error', null));
alter table servers add column if not exists last_health_check_at timestamptz;
alter table servers add column if not exists health_check_uptime numeric(5,2) default 0; -- percentage

-- ============================================
-- VERIFIED PUBLISHERS — authors claim their listings
-- ============================================
create table if not exists publisher_claims (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references servers(id) on delete cascade,
  user_id uuid references auth.users(id),

  -- Proof of ownership
  proof_type text not null check (proof_type in ('github_org', 'github_repo', 'npm_package', 'dns_txt')),
  proof_value text not null,           -- e.g., GitHub username that matches repo owner
  verified boolean default false,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),

  created_at timestamptz default now(),
  unique(server_id, user_id)
);

alter table publisher_claims enable row level security;
create policy "Claims are viewable by everyone"
  on publisher_claims for select using (true);
create policy "Authed users can submit claims"
  on publisher_claims for insert with check (auth.uid() = user_id);

-- Add publisher fields to servers
alter table servers add column if not exists claimed_by uuid references auth.users(id);
alter table servers add column if not exists publisher_verified boolean default false;

-- ============================================
-- REVIEWS — structured developer reviews
-- ============================================
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references servers(id) on delete cascade,
  user_id uuid references auth.users(id),

  -- Structured ratings (1-5 each)
  rating_overall integer not null check (rating_overall between 1 and 5),
  rating_ease_of_setup integer check (rating_ease_of_setup between 1 and 5),
  rating_reliability integer check (rating_reliability between 1 and 5),
  rating_documentation integer check (rating_documentation between 1 and 5),

  -- Context
  used_with text,                     -- which client they used it with
  use_case text,                      -- what they used it for
  body text not null,                 -- written review (min 50 chars)
  pros text,                          -- what worked well
  cons text,                          -- what didn't

  -- Moderation
  helpful_count integer default 0,
  reported boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(server_id, user_id)          -- one review per user per server
);

create index reviews_server_idx on reviews(server_id);
create index reviews_rating_idx on reviews(rating_overall);

alter table reviews enable row level security;
create policy "Reviews are viewable by everyone"
  on reviews for select using (true);
create policy "Authed users can post reviews"
  on reviews for insert with check (auth.uid() = user_id);
create policy "Users can update own reviews"
  on reviews for update using (auth.uid() = user_id);

-- Add aggregate review fields to servers
alter table servers add column if not exists review_count integer default 0;
alter table servers add column if not exists review_avg numeric(2,1) default 0;
