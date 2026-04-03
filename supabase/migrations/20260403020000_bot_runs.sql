-- Track bot execution history for admin dashboard
create table if not exists bot_runs (
  id uuid primary key default gen_random_uuid(),
  bot_name text not null,                -- discover, sync-registry, extract-schemas, etc.
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  servers_processed integer default 0,
  servers_updated integer default 0,
  error_message text,
  summary jsonb default '{}'             -- bot-specific stats
);

create index bot_runs_name_idx on bot_runs(bot_name);
create index bot_runs_started_idx on bot_runs(started_at desc);

-- RLS: admins can read, service role can write
alter table bot_runs enable row level security;
create policy "Anyone can read bot runs"
  on bot_runs for select using (true);
