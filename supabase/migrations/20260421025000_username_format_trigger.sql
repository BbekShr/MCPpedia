-- Fix the username format enforcement added in 20260421020000_username_rules.
--
-- That migration added a CHECK constraint as NOT VALID, intending to
-- "grandfather in" legacy rows that predate the format rules. But NOT VALID
-- only skips the one-time table scan — every subsequent UPDATE to the row
-- re-evaluates the constraint. So when the karma trigger tried to bump
-- profiles.karma on a legacy row (e.g. username "BbekShr"), the constraint
-- rejected the UPDATE and the whole transaction failed.
--
-- Replace the constraint with a BEFORE trigger that only fires when the
-- username column is being set (INSERT, or UPDATE with a changed username).
-- This is what "grandfathered" was always supposed to mean.
alter table profiles drop constraint if exists profiles_username_format;

create or replace function validate_profile_username()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.username is distinct from old.username) then
    if not (new.username ~ '^[a-z0-9](?:[a-z0-9]|[_-](?=[a-z0-9])){2,29}$') then
      raise exception 'Username % does not match required format', new.username;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_profile_username on profiles;
create trigger trg_validate_profile_username
  before insert or update of username on profiles
  for each row execute function validate_profile_username();
