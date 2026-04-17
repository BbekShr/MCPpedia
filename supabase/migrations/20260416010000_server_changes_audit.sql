-- ============================================
-- SERVER_CHANGES — field-level audit log for the servers table
-- Captures changes from any path: admin toggles, approved edits, bot imports,
-- direct SQL. Complements `edits`, which only records user-proposed changes.
-- ============================================

create table if not exists server_changes (
  id bigserial primary key,
  -- No FK: audit rows must survive server deletion.
  server_id uuid not null,
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  -- auth.uid() when a logged-in user caused the change; NULL for service-role writes.
  actor_id uuid,
  -- Free-form tag set by the caller via the `x-actor-label` HTTP header
  -- (PostgREST exposes it as current_setting('request.headers')).
  -- Lets bots/scripts identify themselves (e.g. 'bot-github', 'bot-npm').
  actor_label text,
  changed_at timestamptz not null default now()
);

create index idx_server_changes_server_time on server_changes(server_id, changed_at desc);
create index idx_server_changes_actor on server_changes(actor_id) where actor_id is not null;
create index idx_server_changes_field on server_changes(field_name);

alter table server_changes enable row level security;

-- Admins and maintainers can read; nobody writes directly (trigger is SECURITY DEFINER).
create policy "Admins read server_changes"
  on server_changes for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'maintainer')
    )
  );

-- ============================================
-- AUDIT TRIGGER
-- High-churn auto-updated fields (stars, downloads, health_status, *_checked_at,
-- updated_at, fts) are intentionally excluded — they'd drown the log on every bot run.
-- ============================================
create or replace function log_server_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- PostgREST exposes HTTP headers as a JSON object in this GUC.
  -- Header names are lowercased; value is an empty string when unset.
  v_headers_raw text := current_setting('request.headers', true);
  v_actor_label text;
  v_field text;
  v_old jsonb;
  v_new jsonb;
  v_old_row jsonb;
  v_new_row jsonb;
  v_audited_fields constant text[] := array[
    'name', 'slug', 'tagline', 'description',
    'github_url', 'npm_package', 'pip_package', 'homepage_url', 'license',
    'author_name', 'author_github', 'author_type',
    'api_name', 'api_pricing', 'api_rate_limits', 'requires_api_key',
    'is_archived', 'verified', 'publisher_verified', 'claimed_by',
    'categories', 'tags', 'source'
  ];
begin
  if v_headers_raw is not null and v_headers_raw <> '' then
    v_actor_label := nullif((v_headers_raw::jsonb) ->> 'x-actor-label', '');
  end if;

  if TG_OP = 'DELETE' then
    insert into server_changes(server_id, field_name, old_value, new_value, actor_id, actor_label)
    values (OLD.id, '__deleted__', to_jsonb(OLD), null, auth.uid(), v_actor_label);
    return OLD;
  end if;

  v_old_row := to_jsonb(OLD);
  v_new_row := to_jsonb(NEW);

  foreach v_field in array v_audited_fields loop
    v_old := v_old_row -> v_field;
    v_new := v_new_row -> v_field;
    if v_old is distinct from v_new then
      insert into server_changes(server_id, field_name, old_value, new_value, actor_id, actor_label)
      values (NEW.id, v_field, v_old, v_new, auth.uid(), v_actor_label);
    end if;
  end loop;

  return NEW;
end;
$$;

create trigger servers_audit
after update or delete on servers
for each row execute function log_server_changes();
