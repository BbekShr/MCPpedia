-- Merge `app-thoughtspot-mcp-server` into `thoughtspot-mcp-server`.
-- Both rows point to https://github.com/thoughtspot/mcp-server.
-- Keep the manual entry (older, fully scored, cleaner name); archive the import.
-- Re-parent any user-authored or historical rows from the duplicate to the keeper
-- before archiving so nothing is lost. ON CONFLICT guards collision-prone tables
-- with (server_id, user_id) unique constraints.

do $$
declare
  keeper_id uuid;
  dupe_id uuid;
begin
  select id into keeper_id from servers where slug = 'thoughtspot-mcp-server';
  select id into dupe_id   from servers where slug = 'app-thoughtspot-mcp-server';

  if keeper_id is null or dupe_id is null then
    raise notice 'thoughtspot merge: keeper=% dupe=% (one is null, skipping)', keeper_id, dupe_id;
    return;
  end if;

  -- Tables with server_id FK and no per-user uniqueness: straight UPDATE.
  update discussions          set server_id = keeper_id where server_id = dupe_id;
  update edits                set server_id = keeper_id where server_id = dupe_id;
  update changelogs           set server_id = keeper_id where server_id = dupe_id;
  update health_checks        set server_id = keeper_id where server_id = dupe_id;
  update security_advisories  set server_id = keeper_id where server_id = dupe_id;

  -- Tables with (server_id, user_id) uniqueness: only re-parent rows where
  -- the user hasn't already acted on the keeper, then drop the rest.
  update reviews r set server_id = keeper_id
   where r.server_id = dupe_id
     and not exists (select 1 from reviews k where k.server_id = keeper_id and k.user_id = r.user_id);
  delete from reviews where server_id = dupe_id;

  update publisher_claims c set server_id = keeper_id
   where c.server_id = dupe_id
     and not exists (select 1 from publisher_claims k where k.server_id = keeper_id and k.user_id = c.user_id);
  delete from publisher_claims where server_id = dupe_id;

  update community_verifications c set server_id = keeper_id
   where c.server_id = dupe_id
     and not exists (select 1 from community_verifications k where k.server_id = keeper_id and k.user_id = c.user_id);
  delete from community_verifications where server_id = dupe_id;

  update favorites f set server_id = keeper_id
   where f.server_id = dupe_id
     and not exists (select 1 from favorites k where k.server_id = keeper_id and k.user_id = f.user_id);
  delete from favorites where server_id = dupe_id;

  -- Recompute aggregates on the keeper from the now-merged underlying rows.
  update servers
     set review_count = (select count(*) from reviews where server_id = keeper_id),
         review_avg = coalesce(
           (select avg(rating_overall)::numeric(3,2) from reviews where server_id = keeper_id),
           0
         ),
         community_verification_count = (select count(*) from community_verifications where server_id = keeper_id)
   where id = keeper_id;

  -- Archive the duplicate. Audit trail in tagline so the history is greppable.
  update servers
     set is_archived = true,
         tagline = coalesce(tagline, '') || ' [merged into thoughtspot-mcp-server]'
   where id = dupe_id;
end $$;
