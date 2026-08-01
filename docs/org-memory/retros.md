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
- 2026-07-24 discover: 5 bug-hunters (api-security, bots data-integrity, scoring correctness,
  pages performance, MCP correctness) returned 23 findings; CEO spot-verified 6 of the
  highest-severity against the code and prod before filing, all held. Filed S23-S45 + M3/M4.
  Friction: the skill's `discover fix` path says "wait for the records-only PR to be merged by
  the human", but a cycle can never merge — so `discover fix` structurally cannot self-continue
  in one session. Resolved by CEO decision (standing instruction to decide): file the
  records-only PR, then open FIX PRs off the same discovery branch's base (`main`), keeping
  finding and fixing in separate diffs as the bright line requires. Filed as M5.
- 2026-07-25 batch 1 (S24, S25/S34, S27/S28, S29): the review board earned its keep — QA was
  GREEN on all four diffs and the board still found 5 CONFIRMED defects, including one both the
  correctness and regression lenses caught independently (a score-merge predicate keyed on a
  column the same UPDATE overwrites, which would have inflated fleet-wide security scores on the
  second day of any OSV outage — strictly worse than the bug it replaced). Lesson recorded: a
  green gate says "nothing I assert is broken", not "the change is right"; never ship a
  verified-but-unreviewed diff. Second lesson: an implementer's "flagged but out of scope" note
  in a hand-back should be routed as an acceptance-criteria check, not filed as future work — the
  /servers search-branch gap was already covered by the AC wording and was found by review after
  being volunteered by the builder. Friction: none from agents or skills beyond M5 (already
  filed); the worktree-parallel + one-serialized-QA shape worked well at 4 concurrent items.

- 2026-07-25 (issues intake, S55-S57 + `issues` mode): the org had no path for user-reported bugs
  at all — three open GitHub issues, one of them 7 days old, describing defects our own discovery
  passes had not found. Closing that is a bigger win than any single row filed. Friction: none
  from the agents (three parallel `bug-hunter` dispatches all came back with `file:line` evidence
  and correctly refuted parts of their reports); the friction was the missing mode itself, now
  fixed in this PR rather than deferred to an M row. Lesson: the screen had to live with the CEO,
  not in an agent's prompt — a subagent reading raw third-party text is the thing being defended
  against, so "delegate the reading, keep the judgment" is the wrong split here; the CEO reads the
  issue bodies and hands agents a scoped, paraphrased claim to verify.
- 2026-07-25 (issues cycle, second half): two process facts earned the hard way. (1) A `git add -A`
  swept untracked `.blogdata*.tmp.ts` scratch files into a commit and turned lint red; use an
  explicit pathspec or `git add <paths>` in a repo whose working tree is not clean, and note that
  `npm run lint` is NOT `.gitignore`-aware (M8) — the CI-equivalent command is
  `npx eslint $(git ls-files '*.ts' '*.tsx')`. (2) A `bug-hunter` died mid-run on a session limit,
  but its raw curl output was still decisive evidence and led to S58 (P1) — the largest finding of
  the cycle. When an agent fails, read what it produced before re-dispatching; and re-verify its
  key claims first-hand (I did, with two curls) rather than citing a dead agent's transcript.
- 2026-08-01 (S59, admin categorize predicate): a three-line fix that needed three rounds, and the reason
  is worth keeping. The item read as trivial — swap `[]` for `{}` — but the predicate had been erroring
  since the endpoint shipped, so the entire processing body below it was DEAD CODE that my fix would
  wake up: an unbounded serial write loop with no `maxDuration`, and `if (!error) updated++` swallowing
  every per-row write failure into a green "Categorized 0 servers". Round 2 bounded the server side but
  the review board then found the frozen-progress-bar symptom was STILL present, because the SSE client
  treats stream-end as success — server-side bounding cannot fix a client that never checks for a
  terminal frame. Round 3 replaced the offset walk with a single `cap + 1` read, which killed three
  findings at once (the exact-boundary "more remain" lie, the short-page trim hazard, and the
  mutable-predicate skip). Lessons: (a) **a predicate-level fix is never a one-line change** — scope the
  body it activates, and say so in the dispatch; (b) when bounding a runaway, check the CLIENT's failure
  handling too, not just the server's, or you fix the cause and keep the symptom; (c) simplifying beat
  patching — the single bounded read removed more defects than the three targeted fixes it replaced;
  (d) I twice accepted an unmeasured performance constant (~20ms/row) that the reviewer overturned with
  concrete evidence (the `servers_audit` per-row trigger `to_jsonb`ing the whole row), so a latency
  number in a comment needs either a measurement or an explicit "budgeted, not measured" label. Also a
  near-miss worth recording: the implementer flagged that `maxDuration = 300` exceeds the Vercel Hobby
  ceiling and would fail the VERCEL build — invisible to a local build, and exactly the S50 deploy-block
  shape. Lowering to 60 cost nothing because the run is idempotent. Good catch by the agent, and the
  right instinct to flag rather than silently ship.
