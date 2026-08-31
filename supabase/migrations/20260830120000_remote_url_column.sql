-- `remote_url` — the endpoint a hosted/remote MCP server is actually reached at.
--
-- The registry already parses this (`ParsedRegistryServer.remoteUrls`,
-- lib/registry-schema.ts) but nothing persisted it, so the site had no way to
-- tell a genuinely local, clone-and-run server from a hosted remote service —
-- `components/ServerFAQ.tsx` and `components/server/InstallMatrix.tsx` both
-- fell back to asserting a local install path for servers that don't have one
-- (issue #68). This column gives them a real signal to branch on.

alter table servers add column if not exists remote_url text;
