-- Add unique constraint on (server_id, cve_id) so upserts work correctly.
-- Without this, the upsert in compute-scores.ts silently fails because
-- onConflict: 'server_id,cve_id' requires a unique index.
create unique index if not exists security_advisories_server_cve_uniq
  on security_advisories(server_id, cve_id);
