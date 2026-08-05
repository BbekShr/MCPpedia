-- Add a foreign key from public.publisher_claims.user_id to public.profiles(id)
-- so that PostgREST can resolve `select *, profile:profiles(...) from
-- publisher_claims`.
--
-- Identical in shape and cause to 20260502120000_edits_user_id_fk_profiles.sql:
-- publisher_claims.user_id already references auth.users(id), and profiles is a
-- 1:1 mirror of auth.users, but PostgREST won't infer an embedding through that
-- shared reference -- it needs a direct FK between publisher_claims and profiles.
-- Without it, the admin Claims tab silently renders empty (the pending-count
-- query works, the embedded select fails and nulls the whole result).
--
-- RENAMED 2026-08-05 from version 20260718000000. It had never been applied
-- anywhere: the constraint was absent from production and the version had no row
-- in supabase_migrations.schema_migrations, while migrations stamped as late as
-- 20260801120000 had already been applied ahead of it. `supabase db push`
-- refuses to insert a migration before the last applied one, and migrate.yml
-- deliberately withholds --include-all ("a real conflict to resolve by hand, not
-- to force past"). Resolving it by hand means giving it a version that sorts
-- after the applied set. Safe precisely because no environment had ever recorded
-- or run the old version.
--
-- Guarded rather than bare, so the rename cannot bite a database that did
-- somehow acquire the constraint: `add constraint` has no IF NOT EXISTS form, so
-- the check has to be explicit.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'publisher_claims_user_id_profile_fkey'
      and conrelid = 'public.publisher_claims'::regclass
  ) then
    alter table public.publisher_claims
      add constraint publisher_claims_user_id_profile_fkey
      foreign key (user_id) references public.profiles(id)
      on delete set null;
  end if;
end
$$;
