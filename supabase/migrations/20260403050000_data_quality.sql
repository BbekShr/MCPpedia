-- Data quality score — how complete is the server's information?
-- Separate from MCPpedia Score (which rates the server itself)
-- This rates how much we KNOW about it.

alter table servers add column if not exists data_quality integer default 0;
-- 0-100 scale:
-- Has name + tagline: 10
-- Has description (>50 chars): 15
-- Has tools listed: 20
-- Has install config: 20
-- Has categories: 10
-- Has GitHub URL: 5
-- Has npm/pip package: 10
-- Has compatible clients listed: 10

create index if not exists servers_data_quality_idx on servers(data_quality desc);

-- Function to compute data quality
create or replace function compute_data_quality(p_server_id uuid)
returns integer
language plpgsql
as $$
declare
  s record;
  quality integer := 0;
begin
  select * into s from servers where id = p_server_id;
  if not found then return 0; end if;

  -- Name + tagline
  if s.name is not null and s.tagline is not null and length(s.tagline) > 5 then
    quality := quality + 10;
  end if;

  -- Description
  if s.description is not null and length(s.description) > 50 then
    quality := quality + 15;
  end if;

  -- Tools
  if jsonb_array_length(s.tools) > 0 then
    quality := quality + 20;
  end if;

  -- Install config
  if s.install_configs != '{}'::jsonb then
    quality := quality + 20;
  end if;

  -- Categories
  if array_length(s.categories, 1) > 0 then
    quality := quality + 10;
  end if;

  -- GitHub URL
  if s.github_url is not null then
    quality := quality + 5;
  end if;

  -- npm/pip package
  if s.npm_package is not null or s.pip_package is not null then
    quality := quality + 10;
  end if;

  -- Compatible clients
  if array_length(s.compatible_clients, 1) > 0 then
    quality := quality + 10;
  end if;

  -- Update the server
  update servers set data_quality = quality where id = p_server_id;

  return quality;
end;
$$;

-- Compute for all servers
create or replace function compute_all_data_quality()
returns void
language plpgsql
as $$
declare
  srv record;
begin
  for srv in select id from servers loop
    perform compute_data_quality(srv.id);
  end loop;
end;
$$;
