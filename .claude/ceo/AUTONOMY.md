# Autonomy levels (the trust curve)

`org.json` → `"autonomy_level": "L0".."L4"`. The CEO reads it in preflight and refuses anything
the level doesn't unlock. The guard enforces it mechanically during org runs only: a human working
in their own session can still merge or push as they always have. **Only the human raises the level.** The CEO lowers it itself on a
demotion trigger by creating `.claude/ceo/DEMOTED` with the new level, and says so at the top of
the report. The guard takes the lower of the two levels, so a demotion binds at once; the human
later sets `org.json` to match and deletes DEMOTED.

**Control files.** `org.json`, `AUTONOMY.md`, `DEMOTED`, `.claude/settings.json` and everything in
`.claude/hooks/` decide what the org may do, so the agents they govern can't edit them. The guard
hard-codes this list (it is not read from `org.json`, so it can't be edited away) and blocks Edit
and Write calls on it always, and shell writes to it (`>`, `sed -i`, `tee`, `cp`, `mv`, `rm`)
during org runs. It is a seatbelt, not a wall: a determined shell command can still get round
it, and `ALLOW_GATE_EDITS` is honour-system. The boundary is the human-merged PR.

| Level | Name | Unlocks | Merge | Schedule |
|---|---|---|---|---|
| **L0** | Observe | `audit`, `discover`, `rnd`, `issues` (records-only PRs) | human | none |
| **L1** | Verify | + `light`, `deep`, `<ID>`: fix PRs, one at a time, sequential | human, before merge | none |
| **L2** | Constrain | + headless local runs (nightly `light`, weekly `discover`) | human, before merge | local (launchd/cron) |
| **L3** | Parallelize | + `N` parallel worktree items, `discover fix` | agent may merge green-gated PRs that touch no protected path; human samples after | local |
| **L4** | Cloud | + cloud routines (`/schedule`), always-on repro/verify streams | as L3 | cloud |

At every level: same gates, same guard, same review board. A level unlocks capabilities, never
shortcuts.

## Starting level (chosen by /org-init)

- **L0** if the verification bar is weak: no automated tests, or no typecheck/lint for a typed
  language, or the app can't be run locally. The org's first backlog items build the bar.
- **L1** for a PARTIAL or STRONG bar. With a PARTIAL bar (a harness exists, but core write
  paths have no behavioural tests), the editors' proving-test duty means the first fix PRs
  build the missing test layer, and the seed backlog ranks that layer first.
- **Never start higher**, even if the user asks for it: trust is earned on *this*
  codebase with *these* agents. Record the user's target level in `org.json` → `"autonomy_target"`
  so promotions have a destination.

## Promotion criteria (the CEO checks these in every report)

Computed from `.claude/ceo/memory/scorecard.md` over the trailing window:

| To | Requires |
|---|---|
| L1 → L2 | ≥5 apply runs; ≥80% of org PRs landed with no human code changes; 0 reverts; 0 escaped defects; `/org-eval` pass rate ≥80% for every editor and the release manager |
| L2 → L3 | ≥10 headless runs at L2; ≥90% landed clean; 0 reverts in the last 10; review board caught ≥1 CONFIRMED defect that gates missed (proves the board works) or ran ≥10 diffs clean; CI enforces the full verification bar on every PR (not just locally) |
| L3 → L4 | ≥20 self-merged PRs with 0 reverts and 0 escaped defects in human sampling; cost per landed PR stable or falling; the guard and gates run identically in the cloud environment (verified by one supervised cloud run) |

When met, the report's first line says: **"Promotion criteria for Lx met: <evidence>. Raise
`autonomy_level` in .claude/ceo/org.json to grant."** The CEO never edits that field upward.

## Demotion triggers (the CEO acts immediately)

- A revert of an org PR, or a human reports an escaped defect from one → drop one level.
- A gate was found weakened in a shipped PR, or the guard was bypassed → drop to L1.
- `/org-eval` pass rate for an editor falls below 60% → that editor is benched (report-only)
  until its definition is fixed and re-evaluated; the org level is unchanged.

## Scorecard row format

`| date | run | PR | outcome | human edits? | board CONFIRMED | escaped? | tokens/cost |`
Outcomes: `landed-clean` · `landed-edited` · `closed` · `reverted` · `open`. Update the outcome
of earlier rows when you learn it (preflight: `gh pr list --state all --search "head:<prefix>"`).
