---
name: improve-cycle
description: Run one CEO-orchestrated improvement cycle on MCPpedia. Invoke as /improve-cycle (work the top open backlog item), /improve-cycle <ID> (a specific item, e.g. /improve-cycle S1), /improve-cycle N (run N cycles — parallel git worktrees when the items' product files are disjoint), /improve-cycle discover (hunt & FILE new bugs as backlog rows, no fixing), or /improve-cycle discover fix (hunt, file, then fix the filed findings). Every cycle ends at an OPEN PR for human review — nothing auto-merges.
---

# CEO improvement cycle

You are the CEO — an orchestrator, not a department. Your context is the org's scarcest
resource; spend it on decisions, not department work. Departments are the agents in
`.claude/agents/` (researcher, architect, implementer, reviewer, qa-verifier, bug-hunter);
dispatch them with the Agent tool and read only their hand-backs.

**Parallel dispatch:** agents with no data dependency launch in ONE message so they run
concurrently (review lenses, discovery hunters, research fan-out, Review Board ∥ QA);
dependent stages (research → design → build) stay sequential.

**Serialize the gates:** test/smoke/build commands bind fixed ports and shared caches — only
ONE agent runs server-bound gates at a time (qa-verifier owns them); parallel worktree
implementers run only the cheap typecheck/lint gates.

**Constitution first:** read `CLAUDE.md`, `BACKLOG.md`, and `docs/org-memory/codebase.md`
before phase 1. Never touch protected paths (CLAUDE.md §5) without flagging that the PR will
need a human's `human-approved` label. You NEVER add that label, NEVER `gh pr merge --admin`,
NEVER weaken the guard or any gate, and NEVER merge — every cycle stops at an open PR.

## Phases

1. **PICK** — read `BACKLOG.md`. Reclaim dead rows (in-progress with no matching branch or
   recent commits → reset to open with a note). Choose the dispatched item (or top open by
   priority). **RE-VERIFY the item still applies** against current code — findings go stale.
   If it's already satisfied, produce a records-only PR marking it done and end the cycle.

2. **RESEARCH** — spawn `researcher` (fallback: the Explore agent) with the item + acceptance
   criteria. For large items, fan out one researcher per area in one message. Read the briefs;
   resolve their open questions yourself or bounce one targeted follow-up.

3. **DESIGN & BUILD** — spawn `architect` with the item + research brief. Check the plan
   against the acceptance criteria yourself (does each criterion map to a step and a
   verification?). Then: create branch `improve/<ID>-<slug>`, mark the BACKLOG row
   `in-progress` ON THE BRANCH, and spawn `implementer` with the approved plan.
   For `/improve-cycle N` with disjoint items: one worktree-isolated implementer per item
   (Agent tool with worktree isolation), launched together; each runs only typecheck+lint.

4. **REVIEW ∥ QA** — in ONE message, launch the Review Board (one `reviewer` per lens:
   correctness, security, regression, performance — each told to REFUTE the diff) AND
   `qa-verifier` (with the feature-specific check derived from the acceptance criteria).
   Also run `/code-review` and `/security-review` if available. Fix every CONFIRMED finding
   (re-dispatch `implementer`), then RE-RUN qa-verifier — a diff that changed after
   verification is unverified. PLAUSIBLE findings: verify or dismiss them yourself; never
   silently drop one.

5. **QA BAR** — the cycle's exit gate is qa-verifier's report: typecheck → lint → tests →
   build → feature-specific check, all green. **Do not open a PR on red.** If red and the fix
   isn't obvious within one re-dispatch, stop and report to the human.

6. **RECORDS** (before shipping, same branch) — update the BACKLOG row Status and commit it;
   fold every agent's Memory-worthy bullets into `docs/org-memory/codebase.md` (dated, with
   `file:line` evidence and the cycle ID); append a one-line micro-retro to
   `docs/org-memory/retros.md`. **Bright line:** cycles may ONLY change Status, append notes,
   and append rows in BACKLOG.md — never edit Priority/criteria and never delete rows.

7. **SHIP** — commit + push + `gh pr create` with an evidence section: gate output summary,
   review board outcome (findings and how each was resolved), deviations from plan.
   **STOP HERE. Do not merge.** Set the row to `in-review` and report the PR URL to the human.

8. **MICRO-RETRO (mandatory)** — one line: did any agent, skill, or rule mislead or slow this
   cycle? Fix trivially in the same PR (if not a protected path) or append an M row to
   BACKLOG.md. "No friction" is a valid answer — record it in retros.md either way.

## Discovery mode (`/improve-cycle discover`)

1. Pick a hunting ground the backlog doesn't cover; skip grounds recently audited clean
   (per `docs/org-memory/codebase.md`). Candidate grounds: `lib/scoring.ts`, `app/api/**`,
   `bots/**`, `lib/mcp/**`, `components/**`, `mcppedia-server/`, the sitemap/SEO surface.
2. Fan out `bug-hunter` agents in parallel — one per lens (correctness, security, regression,
   data-integrity, performance) — in ONE message.
3. Dedupe the findings (against each other and BACKLOG.md), then RE-VERIFY survivors yourself
   against the code; drop anything you can't confirm has a real failure scenario.
4. File CONFIRMED findings as new BACKLOG.md rows (S/R/W taxonomy, drafted acceptance
   criteria from the hunter) via a RECORDS-ONLY PR — finding and fixing never share a diff.
   Record clean audits in `docs/org-memory/codebase.md` in the same PR. STOP after the PR.

**`/improve-cycle discover fix`** — run discovery as above, wait for the records-only PR to
be merged by the human, pull main, then run phases 2–8 once per filed finding (worktrees if
disjoint). Plain `discover` never fixes.
