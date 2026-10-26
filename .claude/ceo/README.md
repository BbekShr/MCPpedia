# MCPpedia org: operator notes

Adopted into agent-org's layout on 2026-10-25 (from the hand-built `/improve-cycle` org). The CEO
is the `/mcppedia-ceo` skill (`.claude/skills/mcppedia-ceo/SKILL.md`). It runs as the main loop,
delegates to the agents in `.claude/agents/`, and ships behind a PR. This folder holds its state.

| Path | What | Tracked? |
|---|---|---|
| `org.json` | machine-readable org config (roster, gates, protected paths, autonomy, guard policy) | yes |
| `RULES.md` | the org's rules on top of `CLAUDE.md` | yes |
| `backlog.md` | pointer: the tracker is `BACKLOG.md` at the repo root | yes |
| `memory/codebase.md`, `memory/retros.md` | pointers: facts and retros live in `docs/org-memory/` | yes |
| `memory/scorecard.md` | every org PR's fate: the evidence for autonomy promotions | yes |
| `AUTONOMY.md` | the trust curve: what each level unlocks, promotion/demotion rules | yes |
| `PRINCIPLES.md` | the rules and the incidents behind them (agent-org, verbatim) | yes |
| `playbooks/` | how each kind of change is done in this repo | yes |
| `evals/` | known-answer cases for `/org-eval` | yes |
| `learnings/` | `_shared.md` + one file per agent; only `## Active` enters briefs | yes |
| `bin/org_doctor.py` | static health check (`python3 .claude/ceo/bin/org_doctor.py .`) | yes |
| `upstream.md` | template findings for agent-org itself; sent only via opt-in `/org-feedback` | yes |
| `reports/` | one board report per run | no (gitignored) |
| `PAUSE` | **kill switch**: if it exists, every mode aborts | no |

## Run it

| Command | Does |
|---|---|
| `/mcppedia-ceo audit` | read-only board report, zero writes (safe anytime) |
| `/mcppedia-ceo` | light: assess → fix the top 1-3 → verify → PR |
| `/mcppedia-ceo deep` | every specialist, all findings, fixes batched by owner → PR |
| `/mcppedia-ceo <ID>` | one backlog item through the full pipeline → PR (was `/improve-cycle <ID>`) |
| `/mcppedia-ceo N` | the top N open items in parallel worktrees when their files are disjoint |
| `/mcppedia-ceo request "..."` | anyone describes a change in plain words → spec → PR |
| `/mcppedia-ceo triage "..."` | reproduce a bug report on current main: fixed / file it / fix it |
| `/mcppedia-ceo discover [fix]` | hunt and file new bugs (records-only PR); `fix` then fixes each |
| `/mcppedia-ceo issues [n]` | triage open GitHub issues into backlog rows (records-only PR) |
| `/mcppedia-ceo rnd [direction]` | feature and process proposals (records-only PR) |
| `/mcppedia-verify` | how to run, drive and inspect the real app (agents load it; you can too) |

Stop everything: `touch .claude/ceo/PAUSE`. Resume: `rm .claude/ceo/PAUSE`.
Check the org's health: `python3 .claude/ceo/bin/org_doctor.py .` (or `/org-doctor` with the
agent-org plugin installed).

## Scheduling

Not set up. The org is at L3, which unlocks local headless runs; agent-org's
`schedule/run-headless.sh` template can be added when you want nightly `light` or weekly
`discover` runs.
