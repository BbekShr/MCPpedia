# Backlog

The org's work queue — one of the three memory stores (see `docs/org-memory/README.md`).

**Bright line:** improvement cycles may ONLY change a row's Status, append notes to it, and
append new rows. Priority and acceptance criteria are the human's lever — cycles never edit
them and never delete rows. Status values: `open` · `in-progress` · `in-review` · `done`.

ID taxonomy mirrors the standing goals: **S** = stability/features/bugs, **R** = refactors,
**W** = keep-current/dependency drift, **M** = org/process improvements. Priority P1 (urgent)
→ P4 (someday). Protected = the change will touch a protected path (CLAUDE.md §5), so its PR
needs the human-approved label.

| ID | P | Item | Acceptance criteria | Status | Protected |
|----|---|------|---------------------|--------|-----------|
| S1 | P2 | CI has no build gate — `next build` never runs in CI, so type-safe-but-unbuildable changes (bad route exports, RSC violations, config errors) surface only at Vercel deploy time | `.github/workflows/ci.yml` runs `npm run build` on every PR (with placeholder env vars as needed) and it passes on main | open | yes |
| S2 | P3 | `npm run lint` reports 11 warnings (unused vars etc.) — warning noise hides new ones | `npm run lint` exits with 0 errors and 0 warnings, with no `eslint-disable` added and no rule weakened | open | no |
| S3 | P3 | No smoke check exists — nothing verifies the built app boots and serves pages | A scripted smoke check (build + `next start` + curl of `/`, one server page, and one API route asserting HTTP 200) exists as an npm script, is documented in CLAUDE.md §2, and runs in CI | open | yes |
| M1 | P3 | Pre-existing `.claude/commands/qa.md` predates the org and overlaps qa-verifier | A human decision is recorded in `docs/org-memory/codebase.md`: fold it into qa-verifier's feature-specific checks, keep it as a standalone manual skill, or delete it | open | no |
| W1 | P4 | Dependency drift is untracked — Next.js 16 / React 19 / Supabase SDKs move fast and this repo pins a breaking-changes Next version | A dated drift report appended to `docs/org-memory/codebase.md`: `npm outdated` summary, upstream breaking changes that affect this codebase, and any W rows filed for needed migrations | open | no |
