-- Let new users pick their own username instead of getting one derived from
-- their OAuth handle. Rules enforced in lib/username.ts (client + API) and
-- mirrored by the CHECK constraint below:
--   - 3–30 chars
--   - lowercase letters, digits, _, -
--   - must start and end with a letter or digit
--   - no doubled separators (enforced by the regex shape)
--
-- Reserved usernames (admin, api, etc.) are blocked in application code only,
-- since the list is opinionated and easier to evolve there than in SQL.

-- ============================================================================
-- Tracking flag: has the user finalized their username?
-- ============================================================================

alter table profiles
  add column if not exists username_set boolean not null default false;

-- Existing users have already been using their profile — treat their current
-- username as finalized so they don't get bounced to /welcome on next visit.
update profiles set username_set = true where username_set = false;

-- ============================================================================
-- CHECK constraint on username format.
-- Old rows are grandfathered in via NOT VALID so we don't fail the migration
-- if an early profile picked up a username that predates these rules.
-- ============================================================================

alter table profiles drop constraint if exists profiles_username_format;
alter table profiles
  add constraint profiles_username_format
  check (
    username ~ '^[a-z0-9](?:[a-z0-9]|[_-](?=[a-z0-9])){2,29}$'
  ) not valid;

-- ============================================================================
-- Update handle_new_user: generate a placeholder like "user-ab12cd34" so the
-- profile row exists immediately (foreign keys on edits/discussions depend on
-- it), but mark username_set=false so the app routes the user to /welcome.
--
-- We intentionally do NOT try to guess a good username from OAuth metadata
-- anymore — that coupled signup to a provider-specific field and caused
-- collisions across providers. The user picks their handle themselves.
-- ============================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  placeholder text;
  provider text;
begin
  provider := new.raw_app_meta_data ->> 'provider';

  -- Short random placeholder. Collisions are astronomically unlikely but we
  -- loop anyway to be safe.
  loop
    placeholder := 'user-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from public.profiles where username = placeholder);
  end loop;

  insert into public.profiles (id, username, username_set, display_name, avatar_url, github_username)
  values (
    new.id,
    placeholder,
    false,
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
