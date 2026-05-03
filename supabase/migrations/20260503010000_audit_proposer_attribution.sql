-- Let the audit trigger attribute a write to the *original proposer* instead
-- of the moderator who clicked Approve.
--
-- Approve-edit is invoked by an editor/maintainer/admin, so auth.uid() is
-- theirs. We want the audit row to credit the contributor who proposed the
-- change, mirroring how Wikipedia attributes accepted edits to the author,
-- not the patroller. The route now sends the proposer's user_id in an
-- x-original-actor-id header (analogous to the existing x-actor-label).
--
-- For backwards compatibility:
--   * If x-original-actor-id is missing/blank/non-uuid → fall back to
--     auth.uid() (current behavior).
--   * Direct admin saves don't set the header, so they still record the
--     admin as the actor. Bot writes via the service-role admin client
--     have auth.uid() = null, also unchanged.

create or replace function log_server_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers_raw text := current_setting('request.headers', true);
  v_actor_label text;
  v_actor_id_raw text;
  v_actor_id uuid;
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
    v_actor_id_raw := nullif((v_headers_raw::jsonb) ->> 'x-original-actor-id', '');
    -- Defensive: only accept a well-formed uuid; any garbage falls through.
    if v_actor_id_raw is not null then
      begin
        v_actor_id := v_actor_id_raw::uuid;
      exception when invalid_text_representation then
        v_actor_id := null;
      end;
    end if;
  end if;

  -- Header takes precedence; otherwise fall back to the calling session.
  v_actor_id := coalesce(v_actor_id, auth.uid());

  if TG_OP = 'DELETE' then
    insert into server_changes(server_id, field_name, old_value, new_value, actor_id, actor_label)
    values (OLD.id, '__deleted__', to_jsonb(OLD), null, v_actor_id, v_actor_label);
    return OLD;
  end if;

  v_old_row := to_jsonb(OLD);
  v_new_row := to_jsonb(NEW);

  foreach v_field in array v_audited_fields loop
    v_old := v_old_row -> v_field;
    v_new := v_new_row -> v_field;
    if v_old is distinct from v_new then
      insert into server_changes(server_id, field_name, old_value, new_value, actor_id, actor_label)
      values (NEW.id, v_field, v_old, v_new, v_actor_id, v_actor_label);
    end if;
  end loop;

  return NEW;
end;
$$;
