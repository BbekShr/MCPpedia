-- ============================================
-- SERVERS — the heart of MCPpedia
-- ============================================
create table servers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  description text,

  -- Source & distribution
  github_url text,
  npm_package text,
  pip_package text,
  homepage_url text,
  license text,

  -- Author
  author_name text,
  author_github text,
  author_type text default 'unknown' check (author_type in ('official', 'community', 'unknown')),

  -- Technical details
  transport text[] default '{}',
  compatible_clients text[] default '{}',
  install_configs jsonb default '{}',

  -- Tools this server exposes
  tools jsonb default '[]',
  resources jsonb default '[]',
  prompts jsonb default '[]',

  -- Underlying API info
  api_name text,
  api_pricing text default 'unknown' check (api_pricing in ('free', 'freemium', 'paid', 'unknown')),
  api_rate_limits text,
  requires_api_key boolean default false,

  -- Auto-updated metrics
  github_stars integer default 0,
  github_last_commit timestamptz,
  github_open_issues integer default 0,
  npm_weekly_downloads integer default 0,
  is_archived boolean default false,

  -- Health
  health_status text default 'unknown'
    check (health_status in ('active', 'maintained', 'stale', 'abandoned', 'archived', 'unknown')),
  health_checked_at timestamptz,

  -- Categories
  categories text[] default '{}',
  tags text[] default '{}',

  -- Provenance
  source text default 'manual'
    check (source in ('manual', 'bot-github', 'bot-npm', 'bot-pypi', 'import')),
  submitted_by uuid references auth.users(id),
  verified boolean default false,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Immutable wrapper for array_to_string (needed for generated columns)
create or replace function immutable_array_to_string(arr text[], sep text)
returns text
language sql immutable
as $$ select array_to_string(arr, sep) $$;

-- Full-text search
alter table servers add column fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(tagline, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(immutable_array_to_string(tags, ' '), '')), 'B')
  ) stored;

create index servers_fts_idx on servers using gin(fts);
create index servers_categories_idx on servers using gin(categories);
create index servers_health_idx on servers(health_status);
create index servers_slug_idx on servers(slug);
create index servers_stars_idx on servers(github_stars desc);
create index servers_updated_idx on servers(updated_at desc);
create index servers_created_idx on servers(created_at desc);

-- ============================================
-- PROFILES — lightweight user profiles
-- ============================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  github_username text,
  bio text,

  servers_submitted integer default 0,
  edits_approved integer default 0,
  discussions_count integer default 0,

  role text default 'contributor'
    check (role in ('contributor', 'editor', 'maintainer', 'admin')),

  created_at timestamptz default now()
);

-- ============================================
-- EDITS — Wikipedia-style edit proposals
-- ============================================
create table edits (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references servers(id) on delete cascade,
  user_id uuid references auth.users(id),

  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  edit_reason text,

  status text default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,

  created_at timestamptz default now()
);

create index edits_server_idx on edits(server_id);
create index edits_status_idx on edits(status);

-- ============================================
-- DISCUSSIONS — community threads per server
-- ============================================
create table discussions (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references servers(id) on delete cascade,
  user_id uuid references auth.users(id),
  parent_id uuid references discussions(id),

  body text not null,
  upvotes integer default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index discussions_server_idx on discussions(server_id);
create index discussions_parent_idx on discussions(parent_id);

-- ============================================
-- CHANGELOGS — bot-tracked version changes
-- ============================================
create table changelogs (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references servers(id) on delete cascade,

  version text,
  changes_summary text,
  detected_at timestamptz default now(),
  github_release_url text
);

create index changelogs_server_idx on changelogs(server_id);

-- ============================================
-- VOTES
-- ============================================
create table votes (
  user_id uuid references auth.users(id),
  discussion_id uuid references discussions(id) on delete cascade,
  value integer check (value in (1, -1)),
  primary key (user_id, discussion_id)
);

-- ============================================
-- FLAGS — community moderation
-- ============================================
create table flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),

  target_type text check (target_type in ('server', 'discussion', 'edit')),
  target_id uuid not null,
  reason text not null,

  status text default 'open'
    check (status in ('open', 'resolved', 'dismissed')),

  created_at timestamptz default now()
);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Full-text search function
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
      (search_query is null or search_query = '' or s.fts @@ plainto_tsquery('english', search_query))
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

-- Health status computation
create or replace function compute_health_status(last_commit timestamptz, archived boolean)
returns text
language plpgsql
as $$
begin
  if archived then return 'archived'; end if;
  if last_commit is null then return 'unknown'; end if;
  if last_commit > now() - interval '30 days' then return 'active'; end if;
  if last_commit > now() - interval '90 days' then return 'maintained'; end if;
  if last_commit > now() - interval '365 days' then return 'stale'; end if;
  return 'abandoned';
end;
$$;

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url, github_username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'preferred_username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'user_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger servers_updated_at
  before update on servers
  for each row execute function update_updated_at();

create trigger discussions_updated_at
  before update on discussions
  for each row execute function update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Servers
alter table servers enable row level security;

create policy "Servers are viewable by everyone"
  on servers for select using (true);

create policy "Authed users can insert servers"
  on servers for insert with check (auth.uid() = submitted_by);

-- Profiles
alter table profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on profiles for select using (true);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Edits
alter table edits enable row level security;

create policy "Edits are viewable by everyone"
  on edits for select using (true);

create policy "Authed users can propose edits"
  on edits for insert with check (auth.uid() = user_id);

-- Discussions
alter table discussions enable row level security;

create policy "Discussions are viewable by everyone"
  on discussions for select using (true);

create policy "Authed users can post discussions"
  on discussions for insert with check (auth.uid() = user_id);

create policy "Users can update own discussions"
  on discussions for update using (auth.uid() = user_id);

-- Changelogs
alter table changelogs enable row level security;

create policy "Changelogs are viewable by everyone"
  on changelogs for select using (true);

-- Votes
alter table votes enable row level security;

create policy "Votes are viewable by everyone"
  on votes for select using (true);

create policy "Authed users can vote"
  on votes for insert with check (auth.uid() = user_id);

create policy "Users can change own votes"
  on votes for update using (auth.uid() = user_id);

create policy "Users can remove own votes"
  on votes for delete using (auth.uid() = user_id);

-- Flags
alter table flags enable row level security;

create policy "Flags are viewable by admins"
  on flags for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('maintainer', 'admin')
    )
  );

create policy "Authed users can create flags"
  on flags for insert with check (auth.uid() = user_id);
