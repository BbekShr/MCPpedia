# Upstream outbox

Template findings: problems this org hit that would happen in **any** org built from the same
agent-org templates (a template defect, a doctor false positive, an ambiguous CEO instruction, a
guard rule that blocked the wrong thing). The CEO appends one entry per finding at the micro-retro.
Project-specific findings do not go here: they get fixed in this project's own org files.

This file is local. Nothing in it leaves the machine unless feedback is enabled in `org.json`
(`"feedback": {"enabled": true}`) and you run `/org-feedback` and approve the drafts.

Entry format:

```
## <YYYY-MM-DD> <short title>
- status: new | sent <url> | fixed-upstream (<why>) | wontfix (<why>)
- agent-org version: <org.json agent_org_version>
- template: <agent-org path, e.g. skills/org-init/templates/ceo/SKILL.md>
- what happened: <the mechanism>
- evidence: <command output, test, eval score>
- proposed change: <what the template should say or do instead>
- local workaround: <what this project did meanwhile, if anything>
```

## Entries

## 2026-10-25 Adopt can't keep a project's existing memory stores where they are
- status: new
- agent-org version: 0.1.0
- template: skills/org-doctor/scripts/org_doctor.py (check_memory), templates/agents/_contract.md (BOOT)
- what happened: MCPpedia's CLAUDE.md names `BACKLOG.md` and `docs/org-memory/` as its stores, and ~10 live worktrees edit `BACKLOG.md`. The doctor requires `.claude/ceo/backlog.md` and `memory/{codebase,retros}.md`, and BOOT hard-codes `.claude/ceo/memory/codebase.md`, so adopt had to choose between a conflicting move and pointer stubs.
- evidence: `python3 .claude/ceo/bin/org_doctor.py .` errors on the missing files.
- proposed change: an `org.json` `memory_stores` map that the doctor, BOOT and the CEO template read, defaulting to the `.claude/ceo/` paths.
- local workaround: pointer files in `.claude/ceo/`, BOOT and the CEO skill point at the real stores, `org.json` records `memory_stores`.

## 2026-10-25 L3 merge rule conflicts with a project rule that allows protected-path merges
- status: new
- agent-org version: 0.1.0
- template: skills/org-init/templates/ceo/SKILL.md (Ship), references/autonomy.md
- what happened: the template's L3 lets the agent merge only PRs that touch no protected path; MCPpedia's CLAUDE.md §6 lets the agent merge protected-path PRs after self-applying a `human-approved` label. The generated Ship section would silently tighten the maintainer's own rule.
- evidence: CLAUDE.md §5-§6 vs templates/ceo/SKILL.md step 6.
- proposed change: Ship defers to the project's written merge rule when one exists, and adopt surfaces the difference as a question.
- local workaround: the CEO skill's Ship section cites CLAUDE.md §6.
