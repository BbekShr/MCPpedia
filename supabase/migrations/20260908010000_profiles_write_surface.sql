-- Close the two write-surface gaps on `profiles` that a self-UPDATE RLS policy
-- reopens: reserved usernames (S102) and four unbounded text columns (S103).
--
-- Why this is needed at all. `anon`/`authenticated` hold full DML grants and the
-- anon key ships to the browser, so once a self-UPDATE policy exists a signed-in
-- user can `PATCH /rest/v1/profiles?id=eq.<self>` straight at PostgREST. That
-- path touches no Next.js route, and every rate limit and every validation in
-- this repo is route-side (`app/api/username/route.ts`, `lib/rate-limit.ts`) —
-- none of it applies. The two writers that exist in the app are not the threat
-- model; the absent writer is. So the invariants have to live in the database.
--
-- Both gaps are RESTORED pre-existing exposures, not new ones — but "exposed"
-- differs by environment, and both halves are spelled out here because
-- asserting one and leaving the other implied is how this comment read wrong
-- on its first draft:
--
--   * ANY environment built from `supabase/migrations/**` — a `db reset`, CI,
--     a freshly created project — ALREADY carries the self-UPDATE policy, so
--     these columns ARE self-writable there TODAY. `"Users can update own
--     profile"` is created at `20260610000000_security_hardening.sql:55-68`
--     and no later migration drops it:
--     `20260725000000_fix_profiles_privilege_escalation.sql:55` drops only the
--     differently-named `"Users can update own profile except role"`.
--
--   * PRODUCTION is different, and that is measured rather than inferred: a
--     read-only `pg_policies` query against prod on 2026-09-07 returned
--     exactly two policies on `profiles` — `"Profiles are viewable by
--     everyone"` (SELECT) and `"Admins can update any profile"` (UPDATE), with
--     no self-update policy at all. The reason is that `20260610000000` is
--     recorded in `supabase_migrations.schema_migrations` but was never
--     executed (BACKLOG S98; PR #156 restores it).
--
-- ============================================================================
-- MERGE ORDER WARNING — read before merging this PR.
-- ============================================================================
-- `.github/workflows/migrate.yml:107-112` runs `supabase db push` WITHOUT
-- `--include-all`, deliberately: out-of-order application silently reorders DDL
-- against a schema built in filename order. The consequence is that a migration
-- with a version LOWER than the last applied one is refused forever and has to
-- be renamed by hand — `20260803120000_publisher_claims_user_id_fk_profiles.sql:12-20`
-- documents this repo paying that price once already.
--
-- This file is version 20260908010000. Two sibling migrations are open in other
-- PRs at the time of writing: `20260907120000` (the profiles self-UPDATE policy)
-- and `20260908000000`. This version sorts AFTER both, so merging this PR last
-- is safe and merging it first is not. If either sibling is still unmerged when
-- this lands, merge them first or renumber this file upward.

-- ============================================================================
-- PART 1 (S102) — reserved usernames, enforced in the database.
-- ============================================================================
-- `RESERVED_USERNAMES` (lib/username.ts:17-29) is checked in exactly one place:
-- `app/api/username/route.ts`. The DB-side trigger has only ever tested the
-- format regex, a deliberate 2026-04 decision recorded at
-- `20260421020000_username_rules.sql:9-10` ("blocked in application code only,
-- since the list is opinionated and easier to evolve there than in SQL"). That
-- reasoning held only while nothing let a user write `username` directly. A
-- direct PATCH can claim `admin`, `mcppedia`, `official`, `staff` or `security`,
-- and the handle then renders as a byline in the moderator queue
-- (`app/admin/page.tsx:604,659`), in public edit history
-- (`app/s/[slug]/history/page.tsx:55-57`) and on the profile page.
--
-- BEHAVIOUR CHANGE, PLEASE READ: this is a BEFORE trigger, so it fires for
-- EVERY writer — including the service role, `supabase db push`, and any
-- maintenance script. After this migration nobody can set a reserved handle,
-- not even an admin acting deliberately. That is intended (nobody should hold
-- `@admin`), but it is a real loss of an escape hatch: undoing it means another
-- migration, not a flag.
--
-- The `handle_new_user` placeholder is unaffected: it generates
-- `user-<8 hex>` (`20260421020000_username_rules.sql:46-84`, the loop at :59-62),
-- and the comparison below is exact set membership — `user` is reserved,
-- `user-ab12cd34` is not.
--
-- Existing rows are safe: a prod pre-check on 2026-09-07 found ZERO profiles
-- holding a reserved name, and none reserved-adjacent. The trigger is also
-- change-gated (see the `is distinct from` guard), so an unrelated UPDATE to a
-- grandfathered row still cannot trip it — the reason 20260421025000 replaced
-- the CHECK constraint with a trigger in the first place.
--
-- SYNC HAZARD: the list below duplicates the TypeScript one. The TS list stays
-- the source of truth for the friendly user-facing error; this one is the
-- backstop. `__tests__/reserved-usernames-sync.test.ts` reads BOTH files from
-- disk and fails if the two sets diverge in either direction, which is what
-- makes the duplication safe. Keep the `array[...]` literal below between its
-- markers and formatted one-quoted-token-per-entry — the test parses it.
--
-- CREATE OR REPLACE, not a second trigger: the existing binding
-- (`trg_validate_profile_username`, `before insert or update of username`) and
-- the function signature are preserved exactly. Note the function is
-- deliberately left SECURITY INVOKER with no `search_path` setting, matching
-- `20260421025000_username_format_trigger.sql:15-18` — it reads no tables, so
-- there is nothing for a search_path to resolve, and changing its security
-- context here would be an unrelated change.

create or replace function validate_profile_username()
returns trigger
language plpgsql
as $$
declare
  -- Mirror of RESERVED_USERNAMES in lib/username.ts, entry for entry. All
  -- lowercase. NOT sorted — `'static', 'staff'` is inverted here exactly as it
  -- is inverted in the TypeScript list, and the sync test compares sets, not
  -- order. Do not "fix" the order in one file alone.
  -- reserved-usernames-begin
  reserved constant text[] := array[
    'about', 'account', 'admin', 'administrator', 'analytics', 'api', 'assets',
    'auth', 'badge', 'blog', 'bot', 'bots', 'callback', 'category', 'claude',
    'compare', 'contact', 'contributor', 'dashboard', 'delete', 'discuss',
    'docs', 'edit', 'editor', 'favicon', 'help', 'home', 'images', 'legal',
    'login', 'logout', 'maintainer', 'manifest', 'mcp', 'mcppedia', 'me',
    'methodology', 'moderator', 'new', 'null', 'official', 'owner', 'privacy',
    'profile', 'public', 'register', 'report', 'robots', 'root', 'security',
    'server', 'servers', 'settings', 'signin', 'signout', 'signup', 'site',
    'sitemap', 'static', 'staff', 'submit', 'support', 'system', 'team',
    'terms', 'undefined', 'user', 'users', 'verify', 'webhook', 'welcome',
    'www'
  ];
  -- reserved-usernames-end
begin
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.username is distinct from old.username) then
    if not (new.username ~ '^[a-z0-9](?:[a-z0-9]|[_-](?=[a-z0-9])){2,29}$') then
      raise exception 'Username % does not match required format', new.username;
    end if;
    if new.username = any (reserved) then
      raise exception 'Username % is reserved', new.username;
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================================
-- PART 2 (S103) — bound the four unbounded profile text columns.
-- ============================================================================
-- `bio`, `display_name`, `avatar_url` and `github_username` are bare `text`
-- (`20260402000000_initial_schema.sql:95-98`) with no length bound, and NO
-- application writer at all — the only two `profiles` writers in the repo are
-- `app/api/username/route.ts` and `app/api/admin/role/route.ts`, neither of
-- which touches them. So a direct PATCH can write megabytes into `bio` against
-- a project with a documented hard-quota outage precedent, and can point
-- `avatar_url` at any host: it renders as a raw `<img src>` at
-- `app/profile/[username]/page.tsx:83-87` (with `@next/next/no-img-element`
-- disabled) and the CSP `img-src 'self' data: https:` (`next.config.ts:54`)
-- permits any https origin, so every visitor to that profile is fetched by
-- whatever server the attacker names.
--
-- WHAT THESE BOUNDS DO NOT DO, stated plainly so nobody reads the section as
-- closed: they do not mitigate that visitor-IP leak at all.
-- `https://attacker.example/track.gif` is 34 characters and satisfies every
-- bound below. Closing the leak needs either the host allow-list declined
-- further down or routing the avatar through `next/image`; neither is done
-- here. All Part 2 buys is a ceiling on stored size.
--
-- ============================================================================
-- THE SIGNUP HAZARD — this is what set every number below.
-- ============================================================================
-- `handle_new_user` (`20260421020000_username_rules.sql:46-84`), fired
-- `after insert on auth.users` (`20260402000000_initial_schema.sql:268-270`),
-- copies provider metadata into three of these four columns VERBATIM — no
-- truncation, no trim, no scheme check:
--     display_name    <- coalesce(raw_user_meta_data->>'full_name', ->>'name')
--     avatar_url      <- coalesce(->>'avatar_url', ->>'picture')
--     github_username <- ->>'user_name'
--
-- GENERAL RULE, worth carrying beyond this migration: a CHECK on any column
-- `handle_new_user` writes converts a hostile — or merely long — provider
-- value into a FAILED SIGNUP, not a rejected write. The constraint fires
-- during that INSERT, aborts the `auth.users` insert inside the auth
-- transaction, and GoTrue returns "Database error saving new user", which the
-- user cannot recover from. So such a column may only be bounded ABOVE the
-- provider's own maximum, or bounded at all alongside truncation inside that
-- function. Hence, deliberately:
--
--   * `display_name` <= 255, NOT 100. GitHub's own Name field accepts 255
--     characters, so no GitHub value can trip 255, while 100 would have
--     bricked signup for a real user with a long name. Google display names
--     are far shorter.
--   * `github_username` <= 39 is safe for the same reason and only that
--     reason: 39 IS GitHub's maximum handle length and `user_name` originates
--     from GitHub, so the value cannot exceed the bound.
--   * `avatar_url` <= 500. Provider avatar URLs are signed CDN links well
--     under this; observed prod maximum is 98.
--   * `bio` <= 500 stays tight, and it is the only column here that can:
--     `bio` has NO writer anywhere in the repo, `handle_new_user` never
--     touches it, and it is entirely NULL in prod (0 of 41 rows). Zero signup
--     risk, and the one genuinely unbounded-growth column.
--
-- NO SCHEME CHECK on `avatar_url`. An earlier draft added
-- `avatar_url like 'https://%'` and it is omitted on purpose: `->>` on
-- `{"avatar_url": ""}` yields `''`, not NULL, so an empty provider avatar
-- field fails that check and takes the whole signup down with it. It is also
-- case-sensitive (`HTTPS://` would fail), and it does not close the vector its
-- own motivation invokes anyway — `https://attacker.example/track.gif`
-- satisfies it.
--
-- Sanitizing `handle_new_user` itself (truncate, trim, normalize the scheme)
-- and only THEN tightening these bounds is the follow-up. It is deliberately
-- not attempted here: `handle_new_user` is a SECURITY DEFINER function on the
-- auth path, and breaking it breaks every signup.
--
-- Bounds vs. the 2026-09-07 prod pre-check (41 rows): `bio` entirely NULL
-- (0 set) vs. 500; `display_name` max 23 vs. 255; `avatar_url` max 98 vs. 500;
-- `github_username` max 24 vs. 39. Every existing `avatar_url` is https, from
-- `avatars.githubusercontent.com` (27) and `lh3.googleusercontent.com` (12).
-- Nothing in the table is close to a bound.
--
-- `char_length` counts CHARACTERS, not bytes, so a 500-character bound admits
-- up to ~2000 bytes of 4-byte codepoints. That is fine at 41 rows, but it is
-- the number to revisit if STORAGE rather than write surface turns out to be
-- the real concern — `octet_length` is what to switch to then.
--
-- Every constraint tolerates NULL explicitly: a bare `char_length(x) <= n` is
-- NULL (not false) for a NULL column and would pass anyway, but spelling it out
-- keeps the intent readable and survives a future NOT NULL change.
--
-- Deliberately NOT a host allow-list on `avatar_url`: pinning
-- `avatars.githubusercontent.com` / `lh3.googleusercontent.com` would break the
-- day a third OAuth provider is added, and would break it inside
-- `handle_new_user`, i.e. at signup — the same hazard as above. That is the
-- reason the IP leak stays open here rather than a claim it is unimportant.
--
-- Added NOT VALID then VALIDATEd as two steps on purpose, but NOT for the
-- reason that form is usually given, and the usual reasons are false here:
-- `ADD CONSTRAINT ... CHECK` takes ACCESS EXCLUSIVE in BOTH forms (the weaker
-- SHARE UPDATE EXCLUSIVE belongs to `VALIDATE CONSTRAINT`, not to the ADD),
-- and `supabase db push` applies each migration file as ONE implicit
-- transaction (`.github/workflows/migrate.yml:112`), so a failing VALIDATE
-- rolls the entire file back — nothing is left in place, enforced or
-- otherwise. The reason to keep the split is diagnostic: the ADD and the
-- backfill scan are separate statements, so a validation failure names the
-- offending constraint rather than failing opaquely inside a compound ADD.
-- Because the file applies in one transaction the outcome is all-or-nothing,
-- which is the behaviour we want here. VALIDATE is a no-op on an
-- already-validated constraint, so re-running is safe.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_bio_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_bio_length
      check (bio is null or char_length(bio) <= 500) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_display_name_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    -- 255, not 100: `handle_new_user` copies GitHub's Name field in verbatim
    -- and GitHub accepts 255 there, so a lower bound is a failed signup.
    alter table public.profiles
      add constraint profiles_display_name_length
      check (display_name is null or char_length(display_name) <= 255) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_url_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_url_length
      check (avatar_url is null or char_length(avatar_url) <= 500) not valid;
  end if;

  -- 39 is safe only because it IS GitHub's own maximum handle length and
  -- `github_username` is copied from GitHub's `user_name` — the value cannot
  -- exceed the bound, so this cannot fail a signup.
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_github_username_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_github_username_length
      check (github_username is null or char_length(github_username) <= 39) not valid;
  end if;
end;
$$;

alter table public.profiles validate constraint profiles_bio_length;
alter table public.profiles validate constraint profiles_display_name_length;
alter table public.profiles validate constraint profiles_avatar_url_length;
alter table public.profiles validate constraint profiles_github_username_length;
