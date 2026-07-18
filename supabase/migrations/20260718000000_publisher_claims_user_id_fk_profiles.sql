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
alter table public.publisher_claims
  add constraint publisher_claims_user_id_profile_fkey
  foreign key (user_id) references public.profiles(id)
  on delete set null;
