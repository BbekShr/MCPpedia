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
- 2026-07-18 S2: implementer correctly refused to force item #1 — the "unused" exhaustive-deps
  directive is load-bearing (removing it = 3 set-state-in-effect errors); CEO empirically
  re-verified rather than trusting the hand-back, shipped 10/11, filed S7 for the real refactor.
  Process note: AC was atomic ("0 warnings") but one warning was structurally unfixable by
  dead-code removal — human should decide whether S2's 0/0 target waits on S7. Two of the 11
  sites live in protected `lib/__tests__/**`, so a pure-cleanup PR still needs human-approved;
  worth considering whether trivial unused-import fixes in test files should be exempt. No
  agent/skill friction; researcher's exact-replacement table let me skip a separate architect pass.
- 2026-07-18 S4: no friction — a 3-line mechanical guard mirroring an existing pattern; CEO did
  the research inline (read public.ts to confirm the mock trigger) and skipped separate
  researcher/architect passes, went straight implementer → review∥QA. All lenses refuted clean,
  QA bar green, build confirmed compare pages dropped ~701→0. For changes this small the full
  6-agent pipeline is heavier than the change; the lean path (inline research, implementer, 2
  relevant review lenses + qa) fit well.
