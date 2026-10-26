# Upgrade

## Method
1. **Read the upstream changelog and migration guide** for every version you cross, and list the
   breaking changes that touch this repo (grep for each API).
2. **One dependency (or one coupled group) per PR.** Never batch unrelated upgrades.
3. **Upgrade, then fix what broke**, applying the migration guide literally. No opportunistic
   rewrites.
4. **Full bar plus a real run** with `/mcppedia-verify`. Tooling and runtime upgrades break things
   no unit test covers.
5. Lockfile committed. Note the rollback (the previous version) in the PR body.

## In this project
- npm with `package-lock.json`; CI runs `npm ci` on Node 22 (wrangler requires it, `68871d8`).
- Breaking-change history: Next.js 16 (read `node_modules/next/dist/docs/` for every crossing),
  React 19, `@supabase/supabase-js` and `@supabase/ssr` (session refresh in `proxy.ts`),
  `@opennextjs/cloudflare` and `wrangler` (deploy; `docs/CLOUDFLARE.md`), the MCP registry API
  schema (`lib/registry-schema.ts`).
- One dependency or coupled group per PR. A Cloudflare/OpenNext upgrade needs `npm run cf:build`
  to succeed locally too, and the PR names the first deploy to watch.
