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
- 2026-08-01 (S51, advisory reconcile helper): shipped clean, but TWO of the three CONFIRMED defects were
  my own dispatch errors, the same failure mode as the S58 cycle immediately before it. (1) I told the
  architect to place the `scanStatus === 'failed'` early return AFTER the upsert loop, justified by a
  claim I did not verify — that `scanSecurity` returns no advisories on failure. It is false for
  dual-package servers, and worse, the upsert itself can CLOSE a row (`status: adv.status` +
  `ignoreDuplicates:false`), so the ordering I specified made "never close on a failed scan" unachievable.
  The implementer flagged the drift honestly and implemented as instructed, which is correct behavior —
  the error was mine to catch. (2) I approved reconciliation on `scan_status: 'pending'` by importing
  S33's "the package was cleared by a bot" assumption into a user-triggered route, where a maintainer can
  clear the package themselves and choose the target; the security lens traced it to a full CVE-suppression
  chain. Lessons: (a) when a plan's justification contains a factual claim about OTHER code ("X returns
  empty on failure"), that claim is a research question, not a design premise — verify it or mark it
  unverified in the dispatch; (b) porting a guard between an unattended and a user-triggered caller
  requires re-asking who can reach each input state, because the same predicate has different trust
  properties on the two paths; (c) the review board caught the CEO twice in two cycles — that is the
  system working, and it argues for keeping three lenses on anything touching a public trust signal even
  when the diff looks small. Also: I overruled the implementer's `process.exitCode = 1` addition, whose
  general principle was right but which would have pinned the nightly bot red via a known-reachable
  trigger (S68) — filed as M10 rather than settled by fiat. Process note: two consecutive cycles opened by
  finding badly stale backlog statuses; filed as M11.
- 2026-08-01 (S58, registry schema drift): the cycle's lesson is about REVIEW CONVERGENCE, not the
  bug. Round 1 review found 13 CONFIRMED issues; the fix commit introduced 4 NEW ones; that fix
  introduced 4 MORE — all three rounds concentrated in the same area, the existing-row
  LINKING/identity logic, which touches four independent `is_archived` writers, a 9-URL monorepo
  allow-list, and a missing unique index. Two of the new defects were caused by MY OWN dispatch
  instructions (I specified `isIngestable` as a deny-list and then wrote allow-list semantics; I
  ordered `.eq('is_archived', false)` onto reads where it turned archived servers into a nightly
  re-insert loop). Rather than iterate a fourth time I CUT SCOPE: deleted the linking rework
  wholesale, kept the schema-parse fix, and filed the deferred pieces as S63–S65/S67. Lessons:
  (1) when successive fix rounds keep producing new defects in one area, that area is the finding —
  stop fixing and split it out; (2) a scope reduction is a much safer final round than another
  feature round because it DELETES code, and it converged first try; (3) the right question to ask
  the last reviewer is not "is this correct?" but "is this strictly safe relative to `main`?" —
  that reframing is what made the ship/no-ship call obvious, and it surfaced that `main` itself
  inserts a duplicate row nightly for the ~50% of registry entries that have no `repository.url`;
  (4) writing a CEO decision into a dispatch does not make it right — both of my bad instructions
  were stated confidently and implemented faithfully, and only an adversarial reviewer caught them,
  so "the reviewer checks the CEO too" is load-bearing, not ceremony.

- **2026-08-01 (S48, auto-approve RLS denial).** Friction, and it was mine. (1) The item's
  acceptance criteria opened with "a human with prod access checks `pg_policies`", which reads as
  a hard block — the cycle could have stalled there the way `discover fix` stalls (M5). What
  unblocked it was asking what the human answer was actually *for*: it gated whether the fix was
  safe, and the unsafe branch existed only because the gate trusted a forgeable counter. Deriving
  the count from ground truth removed the dependency rather than waiting on it. **A blocking human
  criterion is worth re-reading as a question about the design, not only as a queue item** — often
  the block is a symptom of the design leaning on something it should not. The human check is
  still filed and still needed; it just no longer gates the fix.
  (2) The S59 lesson repeated exactly: a fix to a guard activates the body beneath it, and that
  body is unreviewed code. Here the guard fix made the `servers` write, both karma triggers, the
  revert path and the whole moderation-queue interaction reachable for the first time since
  2026-06-10 — four of the six filed follow-ups (S72–S74, S76) are consequences of *activation*,
  not defects in the diff. Dispatching the regression lens with "enumerate what executes now that
  never did" as its explicit first task is what surfaced them; that phrasing is worth reusing on
  any fix that repairs a predicate or a policy.
  (3) The Review Board again caught a CEO instruction. I told the implementer the count made the
  gate "un-forgeable under every RLS state"; the security lens showed it was un-forgeable but
  freely *inflatable* by the route's own output, which is nearly as bad and was one predicate
  away. Second cycle running where a confidently-stated CEO claim was implemented faithfully and
  only an adversarial reviewer stopped it.
  (4) qa-verifier's teeth check earned its cost twice: it caught that one of the four new tests
  passed with the security filter removed, i.e. a test whose *name* claimed more than it proved.
  Mutation testing on new assertions should stay standard, not occasional.
- **2026-08-01 (S60, `/servers` listing cache).** Three things worth keeping.
  (1) **A backlog row can specify an unachievable test.** S60's criteria said "verified by
  `x-vercel-cache` no longer reporting MISS" — structurally impossible for a data cache on a dynamic
  route, and S35 carries the same wording. The research step caught it before any code was written,
  which is the only reason nobody spent the cycle chasing a header or, worse, "fixed" it by adding
  back the dead `revalidate` knob the item exists to remove. **Read acceptance criteria adversarially
  at the research step, not at the QA step** — a criterion is a claim about reality and can be wrong.
  Cycles may not edit criteria, so the honest move is: ship the fix, append a note, hand the re-word
  to the human.
  (2) **The board overturned my design, correctly, twice.** I approved caching both branches; all four
  lenses independently found that free-text `q` made the key space unbounded on an unrate-limited
  page — so the "cache" was an attacker-writable write amplifier that would evict the very entries it
  existed to hold, while the module docstring asserted the opposite. And bare `withRetry` on a render
  path turned a ~3s honest failure into a ~13.75s one plus a 4x retry storm into an already-failing
  database. Neither was in the plan; both were in the diff. The narrowing (cache the catalog branch
  only, gated on a bounded-shape predicate) came from the reviews, not from me.
  (3) **The architect corrected my dispatch on a point of fact**, which is the second cycle running
  that a downstream agent caught a confidently-stated CEO instruction. I said collapsing an
  out-of-allow-list `?status=zzz` onto `''` was result-preserving; it is the opposite — it turns
  "matches nothing" into "show everything". Worth stating as a standing expectation rather than a
  pleasant surprise: **agents are expected to refuse a wrong instruction and say why.**
  (4) Friction, minor: four backlog rows (S30/S32/S34/S37) were `open` but already shipped, found
  incidentally while picking. Three needed only their required test. A cheap batch re-verification is
  worth doing periodically — the picking step currently pays that cost one row at a time.

- **2026-08-01 (test residuals S34/S37/S39/S43/S44, interrupted by a live incident).**
  (1) **The picking step found a systemic gap the backlog was hiding.** Seven rows sat `open` with
  complete, correct production code, missing only their required test — all from two commits that
  added zero test files. That is not seven small oversights, it is one process hole, and it was
  costing real safety: a naive-sum mutation of `refresh-score/route.ts:165` left the whole suite
  green, meaning the exact harm S34 exists to prevent was shippable past a fully green bar. Filed as
  M13. Worth generalizing: **when several rows fail the same way, stop fixing them one at a time and
  file the shared cause.**
  (2) **Cheap batch re-verification beat careful single-row picking.** One read-only agent checking
  four rows against their full criteria cost a fraction of one cycle and reclassified all four. The
  previous two cycles each paid this discovery cost one row at a time. Re-verify in batches.
  (3) **The lighter review board was the right call and still caught the important thing.** For a
  test-only diff I ran correctness + QA instead of all four lenses, and the correctness lens found a
  surviving mutation the implementer's own 13-row table had missed — because I explicitly asked it to
  hunt "assertions a mutation might MISS" rather than re-run the mutations QA was already running.
  Giving two reviewers genuinely different jobs beats giving them the same job twice.
  (4) **A user-reported prod incident interrupted the cycle, and the interrupt was correct.** The
  homepage had been serving a degraded shell to every visitor and NOTHING in the org noticed — no
  gate, no bot, no probe. S19's freshness probe watches `home_stats_cache` staleness, not page
  health. The diagnosis took four probes (per-page, per-query, concurrent, then a head-count for
  nulls) and the decisive one was the cheapest: asking "are there actually any null `published_at`
  rows?" before assuming the `nullsFirst: false` was load-bearing. Answer: zero, out of 27,405.
  **The degraded copy said "the database is not reachable" and that was simply wrong** — the DB was
  fine and every other page worked. Component fallback text is a guess, not a diagnosis; probe before
  believing it.
  (5) Process note: three PRs are now open off an unchanged `main`, and each cycle appends to
  `BACKLOG.md`, so they conflict on append location. I chose non-overlapping ID ranges so the IDs
  never collide, but the queue depth is now the binding constraint on this loop, not throughput.

### 2026-08-01 — S81 (homepage aggregate snapshot)

  (1) **Friction, fixed in this PR: the implementer handed back with the work UNCOMMITTED.** All four
  review lenses and QA independently discovered that `git diff main...HEAD` contained only the
  BACKLOG status flip, and each had to reconstruct the real change from `git status` and untracked
  files. Four agents paid the same tax, and a less careful reviewer would have reviewed `main`. Fixed
  by adding an explicit commit-before-hand-back requirement to `.claude/agents/implementer.md`.
  (2) **The board earned its keep by DISAGREEING.** The regression lens filed "user-visible staleness
  doubles 24h → 48h" as CONFIRMED; the correctness lens refuted it with evidence from Next internals
  (`unstable-cache.js:152,231` pass `softTags: implicitTags`, so `revalidatePath('/')` does evict the
  entry). Had I acted on the first report as it arrived I would have shipped an unnecessary
  `revalidate` change. Waiting for all lenses before dispatching one fix batch was the right call and
  should stay the default.
  (3) **Two CEO design decisions were reversed by measurement, both mine.** I directed "both indexes"
  (plain + partial on `status='open'`) without asking for a row count; the performance lens measured
  362 open of 27,405 (1.3%), showed `/security` already returns in 0.15s unindexed, and showed the
  partial index would newly make `open → fixed` updates HOT-blocking — a permanent write cost for a
  measured ~zero benefit. I also chose "no code tolerance, use an apply-before-merge runbook" for the
  migration-apply gap; two lenses then pointed at the repo's OWN rule 60 lines above the new code
  (`bots/compute-scores.ts:369-377`, "a permanently-red bot masks genuine failures"), which made
  tolerance the org-consistent answer rather than gate-weakening. **Lesson: do not decide index shape
  or alarm policy from the armchair — the row counts and the existing rule were both one query and
  one grep away.**
  (4) **The row understated its own severity, and only a live probe caught it.** S81 read as "within
  ~1-2s of degrading again"; the pre-fix baseline the implementer measured showed 9 of 10 anon calls
  to both aggregate RPCs returning HTTP 500 `57014` right now. A cheap 5-run median against prod with
  the `.env.local` anon key should be the default first step for any statement-timeout item, before
  any design work — it re-verifies the row and sizes the fix in the same minute.
  (5) **A capability the org lacked appeared as a side effect of a gate doing its job honestly.**
  Asked to state plainly that nothing verifies SQL (M7), qa-verifier went and found a way — parsing
  migrations via `pg-query-emscripten` with no database and no Docker. Filed as M14. Asking an agent
  to name a gap explicitly is apparently a decent way to get the gap closed.
