-- Make `server_changes` publicly readable so /s/[slug]/history can show a
-- complete audit timeline (bot updates, admin direct saves, approved edits)
-- alongside the user-proposed edits already pulled from `edits`.
--
-- The audited columns are all fields that already appear on the public server
-- page (name, slug, tagline, description, urls, packages, license, author,
-- api_*, is_archived, verified, claimed_by, categories, tags, source — see
-- v_audited_fields in 20260416010000_server_changes_audit.sql), so exposing
-- their old/new values to anonymous readers leaks no new information.
--
-- We keep writes locked: nothing can insert into this table outside the
-- SECURITY DEFINER trigger on `servers`.

drop policy if exists "Admins read server_changes" on public.server_changes;

create policy "Server_changes are viewable by everyone"
  on public.server_changes
  for select
  using (true);
