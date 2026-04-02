-- ============================================
-- MCPpedia Score + Security + Registry Sync
-- ============================================

-- Add score fields to servers
alter table servers add column if not exists score_total integer default 0;
alter table servers add column if not exists score_security integer default 0;
alter table servers add column if not exists score_maintenance integer default 0;
alter table servers add column if not exists score_documentation integer default 0;
alter table servers add column if not exists score_compatibility integer default 0;
alter table servers add column if not exists score_efficiency integer default 0;
alter table servers add column if not exists score_computed_at timestamptz;

-- Security fields
alter table servers add column if not exists has_authentication boolean default false;
alter table servers add column if not exists security_issues jsonb default '[]';
alter table servers add column if not exists cve_count integer default 0;
alter table servers add column if not exists last_security_scan timestamptz;
alter table servers add column if not exists security_verified boolean default false;

-- Token efficiency fields
alter table servers add column if not exists estimated_tokens_per_call integer default 0;
alter table servers add column if not exists total_tool_tokens integer default 0;
alter table servers add column if not exists token_efficiency_grade text default 'unknown'
  check (token_efficiency_grade in ('A', 'B', 'C', 'D', 'F', 'unknown'));

-- Registry sync fields
alter table servers add column if not exists registry_id text;
alter table servers add column if not exists registry_synced_at timestamptz;
alter table servers add column if not exists registry_verified boolean default false;

-- ============================================
-- SECURITY_ADVISORIES — CVE and vulnerability tracking
-- ============================================
create table if not exists security_advisories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references servers(id) on delete cascade,

  cve_id text,                          -- CVE-2026-XXXX
  severity text check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  cvss_score numeric(3,1),              -- 0.0 - 10.0
  title text not null,
  description text,
  affected_versions text,               -- e.g., "< 1.3.0"
  fixed_version text,                   -- e.g., "1.3.0"
  source_url text,                      -- link to advisory
  status text default 'open' check (status in ('open', 'fixed', 'wont_fix', 'disputed')),

  published_at timestamptz,
  created_at timestamptz default now()
);

create index security_advisories_server_idx on security_advisories(server_id);
create index security_advisories_cve_idx on security_advisories(cve_id);
create index security_advisories_severity_idx on security_advisories(severity);

-- RLS
alter table security_advisories enable row level security;

create policy "Security advisories are viewable by everyone"
  on security_advisories for select using (true);

-- ============================================
-- COMPARISONS — saved comparison pages
-- ============================================
create table if not exists comparisons (
  id uuid primary key default gen_random_uuid(),
  server_a_id uuid references servers(id) on delete cascade,
  server_b_id uuid references servers(id) on delete cascade,
  slug text unique not null,            -- "slack-mcp-vs-slack-bot-toolkit"
  summary text,                         -- editorial comparison summary
  winner_id uuid references servers(id),
  created_by uuid references auth.users(id),
  view_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(server_a_id, server_b_id)
);

create index comparisons_slug_idx on comparisons(slug);

alter table comparisons enable row level security;

create policy "Comparisons are viewable by everyone"
  on comparisons for select using (true);

create policy "Authed users can create comparisons"
  on comparisons for insert with check (auth.uid() = created_by);

-- ============================================
-- SCORE COMPUTATION FUNCTION
-- ============================================
create or replace function compute_server_score(
  p_server_id uuid
) returns jsonb
language plpgsql
as $$
declare
  s record;
  sec_score integer := 0;
  maint_score integer := 0;
  doc_score integer := 0;
  compat_score integer := 0;
  eff_score integer := 0;
  total integer := 0;
begin
  select * into s from servers where id = p_server_id;
  if not found then return '{}'::jsonb; end if;

  -- SECURITY (0-25)
  if s.cve_count = 0 then sec_score := sec_score + 10; end if;
  if s.has_authentication then sec_score := sec_score + 5; end if;
  if s.license is not null and s.license != '' then sec_score := sec_score + 3; end if;
  if s.security_verified then sec_score := sec_score + 5; end if;
  if not s.is_archived then sec_score := sec_score + 2; end if;
  sec_score := least(sec_score, 25);

  -- MAINTENANCE (0-25)
  if s.github_last_commit is not null then
    if s.github_last_commit > now() - interval '7 days' then maint_score := maint_score + 12;
    elsif s.github_last_commit > now() - interval '30 days' then maint_score := maint_score + 10;
    elsif s.github_last_commit > now() - interval '90 days' then maint_score := maint_score + 6;
    elsif s.github_last_commit > now() - interval '180 days' then maint_score := maint_score + 3;
    end if;
  end if;
  if s.github_stars > 1000 then maint_score := maint_score + 5;
  elsif s.github_stars > 100 then maint_score := maint_score + 3;
  elsif s.github_stars > 10 then maint_score := maint_score + 1;
  end if;
  if s.npm_weekly_downloads > 1000 then maint_score := maint_score + 5;
  elsif s.npm_weekly_downloads > 100 then maint_score := maint_score + 3;
  end if;
  if s.verified then maint_score := maint_score + 3; end if;
  maint_score := least(maint_score, 25);

  -- DOCUMENTATION (0-25)
  if s.description is not null and length(s.description) > 50 then doc_score := doc_score + 5; end if;
  if s.tagline is not null and s.tagline != '' then doc_score := doc_score + 3; end if;
  if jsonb_array_length(s.tools) > 0 then doc_score := doc_score + 5; end if;
  if s.install_configs != '{}'::jsonb then doc_score := doc_score + 5; end if;
  if s.api_name is not null then doc_score := doc_score + 3; end if;
  if s.github_url is not null then doc_score := doc_score + 2; end if;
  if s.homepage_url is not null then doc_score := doc_score + 2; end if;
  doc_score := least(doc_score, 25);

  -- COMPATIBILITY (0-25)
  compat_score := least(array_length(s.compatible_clients, 1) * 5, 25);
  if compat_score = 0 then
    -- If no clients listed but has stdio transport, assume basic compat
    if 'stdio' = any(s.transport) then compat_score := 10; end if;
  end if;
  if array_length(s.transport, 1) > 1 then compat_score := least(compat_score + 5, 25); end if;

  -- EFFICIENCY (0-25)
  declare
    tool_count integer := jsonb_array_length(s.tools);
  begin
    if tool_count <= 5 then eff_score := 25;
    elsif tool_count <= 10 then eff_score := 20;
    elsif tool_count <= 20 then eff_score := 15;
    elsif tool_count <= 30 then eff_score := 10;
    elsif tool_count <= 50 then eff_score := 5;
    else eff_score := 2;
    end if;
  end;

  total := sec_score + maint_score + doc_score + compat_score + eff_score;

  -- Update the server record
  update servers set
    score_total = total,
    score_security = sec_score,
    score_maintenance = maint_score,
    score_documentation = doc_score,
    score_compatibility = compat_score,
    score_efficiency = eff_score,
    score_computed_at = now()
  where id = p_server_id;

  return jsonb_build_object(
    'total', total,
    'security', sec_score,
    'maintenance', maint_score,
    'documentation', doc_score,
    'compatibility', compat_score,
    'efficiency', eff_score
  );
end;
$$;

-- Compute scores for all servers
create or replace function compute_all_scores()
returns void
language plpgsql
as $$
declare
  srv record;
begin
  for srv in select id from servers loop
    perform compute_server_score(srv.id);
  end loop;
end;
$$;

-- Indexes for score-based sorting
create index if not exists servers_score_idx on servers(score_total desc);
