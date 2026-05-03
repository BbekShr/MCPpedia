-- Add a foreign key from public.edits.user_id to public.profiles(id) so that
-- PostgREST can resolve `select *, profile:profiles(...) from edits`.
--
-- The existing edits_user_id_fkey already references auth.users(id); profiles
-- is a 1:1 mirror of auth.users, but PostgREST won't infer an embedding
-- through that shared reference -- it needs a direct FK between edits and
-- profiles. Without it, the admin Edits tab and the per-server edit-history
-- page silently render empty (the count query works, the embedded select
-- fails).
alter table public.edits
  add constraint edits_user_id_profile_fkey
  foreign key (user_id) references public.profiles(id)
  on delete set null;
