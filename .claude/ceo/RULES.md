# MCPpedia org rules

Read by every agent at boot, after `CLAUDE.md`. MCPpedia's `CLAUDE.md` already holds the
project's rules; this file adds only what the org itself needs and never restates `CLAUDE.md`, so
the two can't drift. Changes here are rule changes: the CEO proposes them, the human merges them.

This repo runs an agent org adopted into agent-org's layout (`/org-init adopt`). The CEO is
`/mcppedia-ceo`; agents live in `.claude/agents/`; org state lives in `.claude/ceo/` (see its
README). Kill switch: `touch .claude/ceo/PAUSE`.

**Verification bar, critical rules, protected paths:** `CLAUDE.md` §2, §4 and §5. They are
authoritative. The bar inline: `npx tsc --noEmit` ∧ `npm run lint` ∧ `npm test`, plus
`npm run build` for routing, pages, config or anything Next-specific, plus the feature check the
CEO's brief names. Never weaken a gate to pass.

**Org control files** (protected on top of §5; the guard blocks agent edits to them always):
`.claude/ceo/org.json`, `.claude/ceo/AUTONOMY.md`, `.claude/ceo/DEMOTED`, `.claude/settings.json`,
`.claude/hooks/**`. Gate config files (`tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`)
are guarded too: the human enables gate edits for one run with
`touch .claude/ceo/ALLOW_GATE_EDITS`. Agents never create that file.

**Merging:** `CLAUDE.md` §6. The agent may merge a PR whose required checks are green, whose
review board found no CONFIRMED correctness bug, and whose guard is green, including after
labelling a protected-path PR `human-approved` and naming the path and reason in its body. Never
`--admin`. Never merge a change to `CLAUDE.md` or `AGENTS.md`. Outward-facing acts (commenting
on, closing or labelling a third party's issue or PR) are the maintainer's alone. Below L3 in
`org.json`, the human merges.

**User-data paths:** none in the repo. End-user data lives only in Supabase; no agent writes to
the production database, applies a migration, or runs a bot against it.

**Memory** (the three stores in `CLAUDE.md` §6, plus org evidence):
- Rules: `CLAUDE.md` (human-approved PRs only) and this file.
- Tasks: `BACKLOG.md`. Cycles change Status, append notes, and append rows ONLY.
- Facts: `docs/org-memory/codebase.md` (dated, `file:line`), `docs/org-memory/retros.md` (one
  line per run).
- Org evidence: `.claude/ceo/memory/scorecard.md` (every org PR's fate),
  `.claude/ceo/learnings/` (lessons the CEO prepends to briefs), `.claude/ceo/upstream.md`.

**Simplicity rules** (the fallback when `ponytail` isn't installed): question whether the change
needs to exist; reuse the existing helper before writing one; the standard library and the
platform before a dependency; no speculative options, flags or abstractions; the smallest diff
that meets the acceptance criteria; a refactor never rides along with a behaviour change.
