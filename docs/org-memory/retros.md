# Cycle retros

One line per cycle: `- YYYY-MM-DD <ID>: <friction observed> → <action or M-row filed>`.

- 2026-07-16 bootstrap: org scaffolded (constitution, 6 agents, improve-cycle skill, backlog,
  memory stores, CI guard) → first real cycle will validate the pipeline.
- 2026-07-17 S1: pipeline ran clean end-to-end; perf review caught a real hang-not-fail gap
  (env-less build still fetches Google Fonts, no timeout) that the plan's "one added step"
  minimalism missed → added `timeout-minutes: 15` and filed S4/R1/S5 from review findings.
  No agent/skill/rule friction; one process note: AC wording ("with placeholder env vars as
  needed") contradicts the correct implementation (no placeholders) — human should reconcile
  the AC text on merge, since cycles can't edit acceptance criteria.
