# Org memory

The org persists knowledge in three stores with different owners and change rules:

| Store | Holds | Changed by |
|-------|-------|------------|
| `CLAUDE.md` | Rules (constitution) | human-approved PRs only (protected) |
| `BACKLOG.md` | Tasks (work queue) | every cycle — Status/notes/new rows only |
| `docs/org-memory/` | Facts (discoveries) | every cycle, at the Records step |

## Conventions

- **Read before work:** every agent's boot sequence reads `CLAUDE.md` then
  `docs/org-memory/codebase.md` before touching anything.
- **Write at Records time:** the CEO folds agents' "Memory-worthy" hand-backs into
  `codebase.md` in phase 6, on the cycle's branch — not ad hoc mid-cycle.
- **One dated bullet per fact**, with `file:line` evidence and the originating cycle/PR:
  `- YYYY-MM-DD (S1/PR#25): claim — file.ts:42`.
- **Delete when falsified.** A stale "fact" is worse than no fact.
- **Promote hardened facts:** when a fact has held across several cycles and agents keep
  needing it, promote it into `CLAUDE.md` via a human-approved PR and remove it here.
- **Keep it pruned:** `codebase.md` stays around ~120 lines. When it grows past that, merge
  duplicates and drop the least-load-bearing bullets.
- `retros.md` gets exactly one line per cycle:
  `- YYYY-MM-DD <ID>: <friction observed> → <action or M-row filed>`.
