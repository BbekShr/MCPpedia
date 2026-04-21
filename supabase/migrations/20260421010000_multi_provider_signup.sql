-- Support Google OAuth (and other non-GitHub providers) in signup.
--
-- The original handle_new_user trigger assumed GitHub metadata:
--   - username came from `user_name` / `preferred_username`
--   - avatar came from `avatar_url`
--   - github_username mirrored `user_name`
--
-- For Google, raw_user_meta_data looks different:
--   - name / full_name / given_name, but no `user_name`
--   - picture (not `avatar_url`)
--   - no github handle
--
-- Additionally, the old fallback (split_part(email, '@', 1)) could collide
-- across providers — two users with alice@github.com and alice@gmail.com
-- both wanted the username "alice", and the second signup failed the unique
-- constraint, aborting the whole auth flow.
--
-- This rewrites the trigger to:
--   1. Prefer provider-supplied handles (user_name, preferred_username)
--   2. Fall back to email local-part
--   3. On collision, append an incrementing numeric suffix (alice, alice2, ...)
--   4. Read avatar from avatar_url OR picture
--   5. Only set github_username when the provider is GitHub

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  base_username text;
  candidate text;
  suffix int := 1;
  provider text;
begin
  provider := new.raw_app_meta_data ->> 'provider';

  base_username := coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  );

  -- Normalize: lowercase, strip anything that isn't alphanumeric / dash / underscore
  base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_-]', '', 'g'));
  if base_username = '' then
    base_username := 'user';
  end if;

  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url, github_username)
  values (
    new.id,
    candidate,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    case
      when provider = 'github' then new.raw_user_meta_data ->> 'user_name'
      else null
    end
  );
  return new;
end;
$$;
