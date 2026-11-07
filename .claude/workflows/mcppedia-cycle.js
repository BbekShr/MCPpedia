export const meta = {
  name: 'mcppedia-cycle',
  description: 'One lean MCPpedia improvement cycle: pick a backlog row, build, gate, review, merge, close the row, smoke prod',
  whenToUse: 'Called by /mcppedia-ceo after its inline preflight; never directly. args are built by the skill.',
  phases: [
    { title: 'Pick', detail: 'reconcile stale rows, choose one open row (haiku)' },
    { title: 'Verify', detail: 'researcher re-checks the premise and maps the surface; architect only for hard items' },
    { title: 'Build', detail: 'owning editor(s) on the run branch' },
    { title: 'Check', detail: 'release manager gates in parallel with 2-3 reviewer lenses in worktrees; up to 2 fix rounds' },
    { title: 'Ship', detail: 'records, PR, CI, merge, row closed' },
    { title: 'Smoke', detail: 'deploy observed, read-only prod GETs, revert on failure' },
  ],
}

// ───────────────────────── inputs (built by /mcppedia-ceo preflight) ─────────────────────────
// args (from `python3 .claude/ceo/bin/cycle_args.py`): { mode:'run'|'audit', id, root, date, runId,
//   mainSha, reconcile[{id,pr}], blockedIds[], openOrgPrs[], lessons,
//   smoke:{home,homeMarker,api,apiMarker}, extraLenses[], noMerge }
const A = args || {}
if (!A.root || !A.date || !A.mainSha) throw new Error('mcppedia-cycle: args.root, args.date and args.mainSha are required (run it through /mcppedia-ceo)')
const ROOT = A.root
const DATE = A.date
const RUN = A.runId || `${DATE}-cycle`
const R = `python3 ${ROOT}/.claude/ceo/bin/records.py --root ${ROOT}`

// ───────────────────────── policy, as plain code ─────────────────────────
// Mirror of the ci.yml `guard` job regex: these need the human-approved label (CLAUDE.md §5).
const PROTECTED_RE = /^(CLAUDE\.md|AGENTS\.md|\.github\/workflows\/|\.env|proxy\.ts|lib\/supabase\/|lib\/validators\.ts|lib\/rate-limit\.ts|supabase\/migrations\/|__tests__\/|lib\/__tests__\/)/
// Never self-merged: the rules files (CLAUDE.md §6), a migration (merging applies it to prod and a
// revert can't undo it: never-list), the org's control files (the guard's domain), and the cycle's
// own machinery (a self-merged edit there would rewrite the next run's rules).
const HOLD_RE = /^(CLAUDE\.md|AGENTS\.md|supabase\/migrations\/|\.claude\/(settings\.json|hooks\/|workflows\/|skills\/|agents\/)|\.claude\/ceo\/(org\.json|AUTONOMY\.md|DEMOTED|RULES\.md|bin\/))/
const SECURITY_RE = /^(app\/api\/|lib\/(validators|rate-limit)\.ts|lib\/supabase\/|lib\/mcp\/|proxy\.ts|supabase\/migrations\/|app\/admin\/|\.github\/workflows\/)/
const BUILD_RE = /^(app\/|components\/|proxy\.ts|next\.config\.ts|open-next\.config\.ts|lib\/)/
const TEST_RE = /(^|\/)__tests__\//
const OWNER = (f) =>
  /^app\/api\//.test(f) ? 'mcppedia-backend-engineer'
  : /^(app|components|public)\//.test(f) ? 'mcppedia-frontend-engineer'
  : /^(bots|\.github\/workflows|content|data)\//.test(f) ? 'mcppedia-data-engineer'
  : 'mcppedia-backend-engineer'
const OWNER_ORDER = ['mcppedia-backend-engineer', 'mcppedia-data-engineer', 'mcppedia-frontend-engineer']

const BOOT = `Repo root (absolute): ${ROOT}. Resolve every path against it. CLAUDE.md is already in your context: do not re-read it. Never read BACKLOG.md whole; read your row with \`${R} get <ID>\`. Never run git checkout, switch, stash, reset or rebase. STRUCTURED: finish with StructuredOutput.
Prior lessons (apply them, don't relearn them):
${A.lessons || '(none)'}`

const str = { type: 'string' }
const strs = { type: 'array', items: str }

// ───────────────────────── ops: a cheap agent that runs exact shell commands ─────────────────────────
const OPS = { type: 'object', required: ['outputs'], properties: { outputs: { type: 'array', items: {
  type: 'object', required: ['exit', 'tail'], properties: { exit: { type: 'integer' }, tail: str } } } } }
async function ops(label, cmds, phase) {
  const r = await agent(
    `You are a command runner. Repo root: ${ROOT}. Run each command below with the Bash tool, in order, from the repo root, copying it EXACTLY as written (including heredocs; one Bash call per numbered command). Use a 600000 ms timeout for any command containing "watch" or "sleep". Do not run anything else, do not fix, retry or interpret failures, and keep going after a failure. Return one entry per command: its exit code and the last 40 lines of its combined output.\n\n` +
    cmds.map((c, i) => `### ${i + 1}\n${c}`).join('\n\n'),
    { label: `ops:${label}`, phase, model: 'haiku', effort: 'low', schema: OPS })
  const outs = (r && r.outputs) || []
  return { ok: outs.length === cmds.length && outs.every((o) => o.exit === 0), outs, text: outs.map((o) => o.tail).join('\n') }
}
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
// Bash calls cap at 10 min, so long waits are split into repeated <9 min polls that return early.
const poll = (check, n) => Array.from({ length: n }, () => `for i in $(seq 1 16); do ${check} && break; sleep 30; done; true`)
const checksDone = (pr) => `[ "$(gh pr checks ${pr} --json bucket --jq '[.[]|select(.bucket=="pending")]|length' 2>/dev/null || echo x)" = 0 ] && [ "$(gh pr checks ${pr} --json name --jq length 2>/dev/null || echo 0)" -gt 0 ]`
const checksList = (pr) => `gh pr checks ${pr} --json name,bucket --jq '.[] | "\\(.bucket) \\(.name)"'`
const onBranch = (b) => `test "$(git rev-parse --abbrev-ref HEAD)" = ${b}`
// The heredoc terminator must stand alone on its line, so a follow-on command goes on the first line.
const heredoc = (cmd, obj, then = '') => `${cmd} <<'MCPPEDIA_JSON'${then ? ` ${then}` : ''}\n${JSON.stringify(obj)}\nMCPPEDIA_JSON`
const bodyHeredoc = (cmd, text) => `${cmd} <<'MCPPEDIA_BODY'\n${text}\nMCPPEDIA_BODY`

const notes = []
// One line, so the 40-line output tail can never drop a file (a dropped CLAUDE.md would skip the hold).
async function diffFiles(phase) {
  const d = await ops('diff', ['git diff --name-only origin/main...HEAD | paste -sd , -'], phase)
  return d.ok ? d.text.trim().split(',').map((s) => s.trim()).filter(Boolean) : null
}

// M24: a session whose agent registry comes from a stale checkout doesn't know the mcppedia-*
// agents. If a named agent can't be spawned (or returns nothing), run it once more as a generic
// agent that adopts the role file. After the first miss, skip straight to the fallback.
let registryMissing = false
async function role(prompt, opts) {
  if (!registryMissing) {
    let r = null
    try { r = await agent(prompt, opts) } catch (e) {
      if (!/agent type|not found|unknown agent/i.test(String((e && e.message) || e))) throw e
      registryMissing = true
      notes.push(`agent registry lacks ${opts.agentType} (M24): roles ran from their definition files`)
    }
    if (r) return r
  }
  const { agentType, ...rest } = opts
  return agent(`Your role is defined in ${ROOT}/.claude/agents/${agentType}.md. Read it first (skip its frontmatter) and follow it exactly.\n\n${prompt}`, { ...rest, label: `${rest.label}~` })
}
const records = { backlog: [], facts: [], lessons: [] }
const result = (outcome, extra) => ({ outcome, run: RUN, notes, records, ...extra })

// ───────────────────────── Pick ─────────────────────────
phase('Pick')

// M11: cycle_args.py found the in-review rows whose PR merged; this run's PR closes them.
const reconciled = (A.reconcile || []).map((r) => `${r.id} → done (PR #${r.pr})`)
for (const r of A.reconcile || []) records.backlog.push({ op: 'set', id: r.id, status: `done (PR #${r.pr} merged; closed ${DATE} by reconciliation)` })
if (reconciled.length) log(`reconcile: ${reconciled.join(', ')}`)

const PICK = { type: 'object', required: ['id', 'status_seen', 'title', 'slug', 'kind', 'reason', 'files_guess', 'runner_up'], properties: {
  id: str, status_seen: str, title: str, slug: str, reason: str, runner_up: str, files_guess: strs,
  kind: { enum: ['bug-fix', 'perf', 'feature', 'refactor', 'security-fix', 'upgrade', 'test-gap'] } } }
const blocked = new Set(A.blockedIds || [])

async function pick(exclude) {
  const p = await agent(A.id && !exclude.length
    ? `Read backlog row ${A.id} with \`${R} get ${A.id}\` (do not read BACKLOG.md). Return its ID, its Status cell exactly as written (status_seen), a PR title ≤60 chars, a kebab slug ≤5 words, the playbook kind, the files you expect to change, reason "named by the caller", and runner_up "".`
    : `Pick ONE MCPpedia backlog row for an autonomous one-item cycle that must finish, merge and deploy without a human.

Rank strictly by this objective (top wins): 1 red gates or broken deploy · 2 security/privacy · 3 crashes and data loss · 4 correctness in core journeys (search → server page → install config; score → methodology → advisories; submit/claim/edit → admin approval; registry sync → scores → homepage stats) · 5 missing tests on critical untested paths · 6 org drift · 7 cost/performance · 8 polish. Within a rank prefer P1 over P4, then the smallest change (one perimeter, ≤3 files).

Exclude a row when: it needs production DB access, a secret, a deploy, a migration, a product decision, or a human edit (says "human", "maintainer decides", "control file"); it touches CLAUDE.md or AGENTS.md; its notes say REJECTED or "do not re-attempt"; it has a \`cycle-failed\` note dated within 14 days of ${DATE}; or its ID is in: ${[...blocked, ...exclude].join(', ') || '(none)'}.

List the open rows with \`${R} list --status open --width 400\` (do not read BACKLOG.md). Return the row's exact ID and the status you saw for it, a PR title ≤60 chars, a kebab slug ≤5 words, the playbook kind, the files you expect to change, and a runner-up ID (or "").`,
    { label: 'pick', model: 'haiku', effort: 'low', schema: PICK })
  if (!p || !/^[SRWM]\d+$/.test(p.id) || !/^open\b/i.test(p.status_seen || '') || blocked.has(p.id) || exclude.includes(p.id)) { notes.push(`pick returned an unusable row (${p && p.id}: ${p && p.status_seen})`); return null }
  return p
}

// No usable row still ships the reconciliation, if there is any.
let chosen = (await pick([])) || { id: 'reconcile', title: 'backlog reconciliation', recordsOnly: true, noVerify: true }

// ───────────────────────── Verify ─────────────────────────
phase('Verify')
const PREMISE = { type: 'object', required: ['verdict', 'evidence', 'files', 'plan_steps', 'hard', 'feature_check'], properties: {
  verdict: { enum: ['STILL_TRUE', 'RESOLVED', 'WRONG_PREMISE', 'CANT_TELL'] }, evidence: str, files: strs, reuse: strs,
  plan_steps: strs, hard: { type: 'boolean' }, feature_check: str, facts: strs, report_md: str } }
const verify = (p) => role(
  `${BOOT}\n\nBacklog row ${p.id} (read it: \`${R} get ${p.id}\`). Picked because: ${p.reason}\nCode is at origin/main ${A.mainSha} (you are on it). Re-verify the row's claims at file:line before anything else: STILL_TRUE / RESOLVED / WRONG_PREMISE / CANT_TELL. If STILL_TRUE, map the touched surface and reuse inventory briefly, write a mechanical plan (one step per file change, plus the proving test), and give one feature check that proves the acceptance criteria. Keep report_md under 40 lines.`,
  { label: `verify:${p.id}`, agentType: 'mcppedia-researcher', model: 'sonnet', effort: 'medium', schema: PREMISE })

let premise = chosen.noVerify ? null : await verify(chosen)
if (premise && (premise.verdict === 'WRONG_PREMISE' || premise.verdict === 'CANT_TELL')) {
  records.backlog.push({ op: 'note', id: chosen.id, text: `cycle ${RUN}: premise ${premise.verdict}: ${premise.evidence.slice(0, 300)}` })
  const second = A.id ? null : await pick([chosen.id])
  if (second) { chosen = second; premise = await verify(chosen) } else premise = null
}
if (!premise || premise.verdict === 'WRONG_PREMISE' || premise.verdict === 'CANT_TELL') {
  if (premise) records.backlog.push({ op: 'note', id: chosen.id, text: `cycle ${RUN}: premise ${premise.verdict}: ${premise.evidence.slice(0, 300)}` })
  if (A.mode === 'audit') return result('audit', { pick: chosen, premise, reconciled })
  chosen = { ...chosen, recordsOnly: true }
}
if (A.mode === 'audit') return result('audit', { pick: chosen, premise, reconciled })
if (chosen.recordsOnly && !records.backlog.length) return result('nothing-to-do', { id: chosen.id, reconciled })

const ID = chosen.id
const slug = (chosen.slug || 'item').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item'
const BRANCH = chosen.recordsOnly || premise.verdict === 'RESOLVED' ? `improve/records-${DATE}` : `improve/${ID}-${slug}`
if (premise && premise.facts) records.facts.push(...premise.facts.slice(0, 2))

const sw = await ops('branch', [`git fetch origin -q && git switch -c ${BRANCH} origin/main && git rev-parse --abbrev-ref HEAD`], 'Verify')
if (!sw.ok || !sw.text.includes(BRANCH)) return result('branch-failed', { id: ID, detail: sw.text.slice(-500) })

let plan = premise && premise.plan_steps
if (premise && premise.verdict === 'STILL_TRUE' && premise.hard && plan.length > 3) {
  const arch = await role(
    `${BOOT}\n\nItem ${ID} (\`${R} get ${ID}\`). Research brief:\n${premise.report_md || premise.evidence}\nWrite the build plan. Ordered per-file steps with owner, a verification step per acceptance criterion, and the decisions a reviewer should attack.`,
    { label: `architect:${ID}`, phase: 'Verify', agentType: 'mcppedia-architect', model: 'opus', effort: 'high',
      schema: { type: 'object', required: ['steps', 'verification', 'decisions'], properties: { steps: strs, verification: strs, decisions: strs, report_md: str } } })
  if (arch) plan = [...arch.steps, ...arch.verification.map((v) => `verify: ${v}`)]
}

// ───────────────────────── Build ─────────────────────────
phase('Build')
const BUILD = { type: 'object', required: ['status', 'commit_sha', 'files_changed', 'proving_test', 'deviations'], properties: {
  status: { enum: ['done', 'blocked', 'failed'] }, commit_sha: str, files_changed: strs, proving_test: str, deviations: str,
  facts: strs, lessons: strs, report_md: str } }
const editorBrief = (owner, files, extra) => `${BOOT}

Item ${ID}: ${chosen.title}. Read the row: \`${R} get ${ID}\`. Playbook: .claude/ceo/playbooks/${chosen.kind}.md.
You are on branch ${BRANCH}; it already exists: commit on it, never create or switch branches.
Your files this dispatch: ${files.join(', ') || '(as the plan says, inside your perimeter)'}.
Plan:
${(plan || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}
${extra || ''}
Rules: a proving test that fails without the fix is required (state it in proving_test); run only \`npx tsc --noEmit\` and \`npm run lint\` (the release manager runs the rest); do not edit BACKLOG.md, docs/org-memory or .claude/ceo (the cycle records those); commit with a conventional message ending "(${ID})".`

async function build(groups, extra) {
  const out = []
  for (const [owner, files] of groups) {
    let r = await role(editorBrief(owner, files, extra), { label: `build:${owner.replace('mcppedia-', '')}`, phase: 'Build', agentType: owner, model: 'sonnet', effort: 'medium', schema: BUILD })
    if (!r || r.status !== 'done' || !r.commit_sha) {
      r = await role(editorBrief(owner, files, `${extra || ''}\nYour previous attempt returned: ${r ? `${r.status}: ${r.deviations}` : 'nothing'}. Fix that and finish.`),
        { label: `build-retry:${owner.replace('mcppedia-', '')}`, phase: 'Build', agentType: owner, model: 'sonnet', effort: 'medium', schema: BUILD })
    }
    if (!r || r.status !== 'done' || !r.commit_sha) return { failed: r ? `${r.status}: ${r.deviations}` : 'editor returned nothing' }
    out.push(r)
    records.facts.push(...(r.facts || []).slice(0, 2))
    records.lessons.push(...(r.lessons || []).slice(0, 1))
  }
  return { out }
}
function groupByOwner(files) {
  const g = new Map()
  for (const f of files.filter((f) => !TEST_RE.test(f))) g.set(OWNER(f), [...(g.get(OWNER(f)) || []), f])
  if (!g.size) g.set(OWNER(files[0] || 'lib/'), files)
  else { const first = [...g.keys()].sort((a, b) => OWNER_ORDER.indexOf(a) - OWNER_ORDER.indexOf(b))[0]; g.set(first, [...g.get(first), ...files.filter((f) => TEST_RE.test(f))]) }
  return [...g.entries()].sort((a, b) => OWNER_ORDER.indexOf(a[0]) - OWNER_ORDER.indexOf(b[0]))
}

let changed = []
let gate = null
let reviews = []
let reviewIncomplete = false
let lensesWanted = []
const fixLog = []
const shipFix = premise && premise.verdict === 'STILL_TRUE' && !chosen.recordsOnly

if (shipFix) {
  const b = await build(groupByOwner(premise.files.length ? premise.files : chosen.files_guess))
  if (b.failed) {
    records.backlog.push({ op: 'note', id: ID, text: `cycle-failed ${DATE} (${RUN}): build: ${b.failed.slice(0, 250)}` })
    notes.push(`build failed: ${b.failed}`)
  } else {
    changed = (await diffFiles('Build')) || []
    if (!changed.length) {
      // An unreadable or empty diff means nothing verifiable was built: never ship it as a fix.
      notes.push('diff against origin/main is empty or unreadable after build')
      records.backlog.push({ op: 'note', id: ID, text: `cycle-failed ${DATE} (${RUN}): editor reported done but the diff is empty or unreadable` })
    } else {

    // ───────────────────────── Check: gate ∥ review, then up to 2 fix rounds ─────────────────────────
    phase('Check')
    const lenses = lensesWanted = ['correctness', 'regression', ...(changed.some((f) => !TEST_RE.test(f) && SECURITY_RE.test(f)) ? ['security'] : []), ...(A.extraLenses || [])]
    const GATE = { type: 'object', required: ['verdict', 'gates', 'branch_seen'], properties: {
      verdict: { enum: ['GO', 'GO-WITH-GAP', 'NO-GO'] }, failed_gate: { type: 'integer' }, branch_seen: str, tree_hash_stable: { type: 'boolean' },
      gates: { type: 'array', items: { type: 'object', properties: { name: str, result: { enum: ['green', 'red', 'skipped'] }, tail: str } } }, gap: str } }
    const REVIEW = { type: 'object', required: ['lens', 'verdict', 'findings'], properties: {
      lens: str, verdict: { enum: ['CLEAN', 'FINDINGS'] }, rejected: strs, facts: strs, lessons: strs,
      findings: { type: 'array', items: { type: 'object', required: ['grade', 'file', 'line', 'scenario', 'fix'], properties: {
        grade: { enum: ['CONFIRMED', 'PLAUSIBLE'] }, file: str, line: { type: 'integer' }, scenario: str, fix: str, owner: str } } } } }
    const runGate = (round) => role(
      `${BOOT}\n\nGate branch ${BRANCH} for ${ID}. Run the bar in order and stop at the first red: tsc, lint (0 errors; warnings vs the baseline in docs/org-memory/codebase.md), test, ${changed.some((f) => BUILD_RE.test(f)) ? 'build (required: the diff touches the build surface)' : 'build (skip: no build-surface file changed; say so)'}, then the feature check: ${premise.feature_check}. Run \`npm ci\` first only if node_modules is missing.`,
      { label: `gate:r${round}`, phase: 'Check', agentType: 'mcppedia-release-manager', model: 'haiku', effort: 'low', schema: GATE })
    const runLens = (lens, sha, round) => role(
      `${BOOT}\n\nLens: ${lens}. Item ${ID} (\`${R} get ${ID}\`). Review \`git diff origin/main...${sha}\` and every caller of every function it modifies. The plan the cycle chose (attack it, not just the code):\n${(plan || []).join('\n')}\nYou may be in an isolated worktree; read files at ${sha} with \`git show ${sha}:<path>\` if your checkout differs.`,
      { label: `review:${lens}:r${round}`, phase: 'Check', agentType: 'mcppedia-reviewer', model: 'sonnet', effort: 'medium', isolation: 'worktree', schema: REVIEW })

    // Gate first, review only a green diff: cheaper (no review tokens on a red build), and the
    // test gate never runs while reviewer worktrees exist (vitest has no .claude/ exclude: M6).
    // At most 3 gate runs and 2 fix rounds.
    let head = b.out[b.out.length - 1].commit_sha
    let active = lenses
    for (let round = 1; round <= 3; round++) {
      gate = await runGate(round)
      if (!gate) { notes.push(`release manager returned nothing (round ${round})`); gate = { verdict: 'NO-GO', gates: [], branch_seen: BRANCH } }
      if (gate.branch_seen && gate.branch_seen !== BRANCH) return result('tree-corrupted', { id: ID, branch: BRANCH, gate, detail: `tree moved off ${BRANCH} (${gate.branch_seen}) mid-run: M18` })
      let confirmed = []
      if (gate.verdict !== 'NO-GO') {
        const fresh = (await parallel(active.map((l) => () => runLens(l, head, round)))).filter(Boolean)
        if (fresh.length < active.length) {
          // A lens that returned nothing is a missing review, never a clean one.
          reviewIncomplete = true
          notes.push(`round ${round}: ${active.length - fresh.length} lens(es) returned nothing: not shipping`)
          break
        }
        reviews = [...reviews.filter((r) => !active.includes(r.lens)), ...fresh]
        fresh.forEach((r) => { records.facts.push(...(r.facts || []).slice(0, 1)); records.lessons.push(...(r.lessons || []).slice(0, 1)) })
        confirmed = reviews.flatMap((r) => r.findings.filter((f) => f.grade === 'CONFIRMED').map((f) => ({ ...f, lens: r.lens })))
        if (!confirmed.length) break
      }
      if (round === 3) break
      fixLog.push(`round ${round}: ${confirmed.length} CONFIRMED, gate ${gate.verdict}${gate.failed_gate ? ` at ${gate.failed_gate}` : ''}`)
      const fixBrief = `FIX ROUND ${round}. Fix exactly these and nothing else, then commit.\n` +
        confirmed.map((f) => `- [${f.lens}] ${f.file}:${f.line}: ${f.scenario}\n  fix: ${f.fix}`).join('\n') +
        (gate.verdict === 'NO-GO' ? `\n- gate ${gate.failed_gate} red:\n${(gate.gates || []).filter((g) => g.result === 'red').map((g) => g.tail).join('\n').slice(-1500)}` : '')
      const fx = await build(groupByOwner(confirmed.length ? [...new Set(confirmed.map((f) => f.file))] : changed), fixBrief)
      if (fx.failed) { notes.push(`fix round ${round} failed: ${fx.failed}`); break }
      head = fx.out[fx.out.length - 1].commit_sha
      if (confirmed.length) active = [...new Set(confirmed.map((f) => f.lens))] // a red gate keeps the pending lenses
    }
    // Fix rounds add commits: re-read the diff so the label and hold decisions see every file.
    const finalFiles = await diffFiles('Check')
    if (finalFiles && finalFiles.length) changed = finalFiles
    else { reviewIncomplete = true; notes.push('final diff unreadable: not shipping') }
    }
  }
}

const confirmedLeft = reviews.flatMap((r) => r.findings.filter((f) => f.grade === 'CONFIRMED').map((f) => ({ ...f, lens: r.lens })))
const plausible = reviews.flatMap((r) => r.findings.filter((f) => f.grade === 'PLAUSIBLE').map((f) => ({ ...f, lens: r.lens })))
const fixGreen = shipFix && changed.length > 0 && gate && gate.verdict !== 'NO-GO' && !confirmedLeft.length &&
  !reviewIncomplete && lensesWanted.every((l) => reviews.some((r) => r.lens === l))
const fixFailed = shipFix && !fixGreen

// ───────────────────────── Ship ─────────────────────────
phase('Ship')
const protectedTouched = changed.filter((f) => PROTECTED_RE.test(f))
const held = changed.filter((f) => HOLD_RE.test(f))
// A RESOLVED verdict closes a row only with file:line evidence; otherwise it is just a note.
const resolved = premise && premise.verdict === 'RESOLVED' && /[\w/.\[\]-]+\.[a-z]{1,5}:\d+/.test(premise.evidence || '')
if (premise && premise.verdict === 'RESOLVED' && !resolved) records.backlog.push({ op: 'note', id: ID, text: `cycle ${RUN}: researcher says RESOLVED without file:line evidence: ${premise.evidence.slice(0, 250)}` })

if (fixFailed) {
  records.backlog.push({ op: 'note', id: ID, text: `cycle-failed ${DATE} (${RUN}): ${gate ? `gate ${gate.verdict}` : 'build failed'}; ${confirmedLeft.length} CONFIRMED left. Draft PR holds the work` })
} else if (resolved) {
  records.backlog.push({ op: 'set', id: ID, status: `done (verified resolved ${DATE} @${A.mainSha} by ${RUN})` })
  records.backlog.push({ op: 'note', id: ID, text: premise.evidence.slice(0, 300) })
}
const lensLine = (r) => `| ${r.lens} | ${r.verdict} | ${r.findings.filter((f) => f.grade === 'CONFIRMED').length} | ${r.findings.filter((f) => f.grade === 'PLAUSIBLE').length} |`
const prBody = [
  `Autonomous cycle \`${RUN}\` (\`/mcppedia-ceo\` → \`.claude/workflows/mcppedia-cycle.js\`).`,
  '',
  shipFix ? `**Item:** ${ID}: ${chosen.title}\n\n**Why:** ${chosen.reason}\n\n**Premise:** ${premise.verdict}: ${premise.evidence.slice(0, 600)}` : `**Records-only run.** ${resolved ? `${ID} was already resolved: ${premise.evidence.slice(0, 400)}` : 'No buildable item this run.'}`,
  '',
  '## Verification',
  gate ? `Release manager: **${gate.verdict}**${gate.gap ? ` (gap: ${gate.gap})` : ''}\n\n| gate | result |\n|---|---|\n${(gate.gates || []).map((g) => `| ${g.name} | ${g.result} |`).join('\n')}` : 'No code changed: CI is the gate.',
  '',
  reviews.length ? `| lens | verdict | CONFIRMED | PLAUSIBLE |\n|---|---|---|---|\n${reviews.map(lensLine).join('\n')}` : '',
  fixLog.length ? `\nFix rounds: ${fixLog.join('; ')}` : '',
  confirmedLeft.length ? `\n**Unresolved CONFIRMED:**\n${confirmedLeft.map((f) => `- [${f.lens}] ${f.file}:${f.line}: ${f.scenario}`).join('\n')}` : '',
  plausible.length ? `\n**PLAUSIBLE (not blocking, not adjudicated):**\n${plausible.map((f) => `- [${f.lens}] ${f.file}:${f.line}: ${f.scenario}`).join('\n')}` : '',
  '',
  protectedTouched.length ? `## Protected paths (CLAUDE.md §5)\nTouched: ${protectedTouched.map((f) => `\`${f}\``).join(', ')}. Why: required by ${ID}'s acceptance criteria (proving tests live under the protected test dirs). Labelled \`human-approved\` by the cycle per CLAUDE.md §6.` : '',
  held.length ? `## Needs a human\nHeld, not merged: ${held.map((f) => `\`${f}\``).join(', ')} (rules file, migration, or org control file).` : '',
  reconciled.length ? `\n**Backlog reconciled:** ${reconciled.join(', ')}` : '',
  '',
  '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
].filter((s) => s !== '').join('\n\n')

const prTitle = shipFix ? `${chosen.kind === 'test-gap' ? 'test' : chosen.kind === 'feature' ? 'feat' : chosen.kind === 'refactor' ? 'refactor' : chosen.kind === 'perf' ? 'perf' : 'fix'}: ${chosen.title} (${ID})` : `records: ${resolved ? `close ${ID}` : 'backlog reconciliation'} (${RUN})`
const nothingToRecord = !records.backlog.length && !shipFix
if (nothingToRecord) return result('nothing-to-do', { id: ID, reconciled })

const retro = `${ID}: ${fixFailed ? 'cycle failed' : shipFix ? 'shipped' : 'records only'}${fixLog.length ? `; ${fixLog.join('; ')}` : ''} (${RUN})`
const rec = await ops('records', [
  heredoc(`${R} apply --date ${DATE}`, { ...records, facts: records.facts.slice(0, 5), lessons: records.lessons.slice(0, 2), retro }),
  `${onBranch(BRANCH)} && git add BACKLOG.md docs/org-memory .claude/ceo/learnings .claude/ceo/memory && git commit -q -m "records(${ID}): cycle ${RUN}" && git push -q -u origin ${BRANCH}`,
  bodyHeredoc(`gh pr create --base main --head ${BRANCH} ${fixFailed ? '--draft ' : ''}--title ${shq(prTitle)} --body-file -`, prBody),
], 'Ship')
const prNum = Number((rec.text.match(/\/pull\/(\d+)/) || [])[1])
if (!prNum) return result('pr-failed', { id: ID, branch: BRANCH, detail: rec.text.slice(-800) })
if (fixFailed) return result(gate ? 'review-failed' : 'build-failed', { id: ID, pr: prNum, branch: BRANCH, gate, reviews: reviews.map(lensLine) })

// Close the row inside the PR that lands it (M11's root cause). The `done` status and the scorecard
// row reach main only if this PR merges; if it doesn't, the open PR itself keeps the row from being
// re-picked (openPrHeads) and is the signal to the human. Label first, so the guard job's run on
// the final head already sees it.
const closeCmds = []
if (protectedTouched.length) closeCmds.push(`gh pr edit ${prNum} --add-label human-approved`)
if (shipFix) closeCmds.push(`${onBranch(BRANCH)} && ` + heredoc(`${R} apply --date ${DATE}`, { backlog: [{ op: 'set', id: ID, status: `done (PR #${prNum}; merged by mcppedia-cycle ${DATE})` }],
  scorecard: `| ${DATE} | ${ID} | #${prNum} | landed (self-merged) | — | ${reviews.reduce((n, r) => n + r.findings.filter((f) => f.grade === 'CONFIRMED').length, 0)} found, 0 left | — | ${Math.round(budget.spent() / 1000)}k out |` },
  `&& git add BACKLOG.md .claude/ceo/memory && git commit -q -m "records(${ID}): close row in PR #${prNum}" && git push -q`))
closeCmds.push('sleep 30', ...poll(checksDone(prNum), 2), checksList(prNum))
const ci = await ops('ci', closeCmds, 'Ship')
const ciLines = ci.outs.length ? ci.outs[ci.outs.length - 1].tail.split('\n').filter((l) => /^(pass|fail|pending|skipping|cancel)\b/.test(l)) : []
// The quick guard job can finish before the main CI job is even registered: require the main job by name.
const ciGreen = ci.outs.slice(0, -1).every((o) => o.exit === 0) && ciLines.some((l) => /^pass .*Type-check/.test(l)) && ciLines.every((l) => /^(pass|skipping)\b/.test(l))
if (!ciGreen) return result('ci-red', { id: ID, pr: prNum, ci: ciLines, detail: ci.text.slice(-400) })
if (held.length) return result('needs-human', { id: ID, pr: prNum, held })
if (A.noMerge) return result('pr-open (noMerge)', { id: ID, pr: prNum })

// Baseline smoke BEFORE merging, so a prod that is already broken is never blamed on this PR.
phase('Smoke')
const S = A.smoke || {}
const smokeCmd = (u, m) => `curl -sS --max-time 20 -D "\${TMPDIR:-/tmp}/mcp-h" -o "\${TMPDIR:-/tmp}/mcp-b" -w 'status=%{http_code}\\n' '${u}'; echo "challenged=$(grep -ci '^cf-mitigated: *challenge' "\${TMPDIR:-/tmp}/mcp-h")"; echo "marker=$(grep -cF '${m}' "\${TMPDIR:-/tmp}/mcp-b")"`
const parseSmoke = (t) => ({ status: Number((t.match(/status=(\d+)/) || [])[1] || 0), challenged: /challenged=[1-9]/.test(t), marker: /marker=[1-9]/.test(t) })
async function smoke(label) {
  const r = await ops(label, [smokeCmd(S.home, S.homeMarker), smokeCmd(S.api, S.apiMarker)], 'Smoke')
  const [home, api] = r.outs.map((o) => parseSmoke(o.tail))
  const challenged = (home && home.challenged) || (api && api.challenged)
  const green = !!home && !!api && [home, api].every((x) => x.status === 200 && x.marker)
  return { home, api, challenged, green }
}
const base = shipFix && S.home ? await smoke('smoke-baseline') : { green: true, skipped: true }

phase('Ship')
const mg = await ops('merge', [
  // Last line of defence: re-check the PR's real file list for held paths in the same shell as the merge.
  `git fetch -q origin && ! git diff --name-only origin/main...origin/${BRANCH} | grep -qE ${shq(HOLD_RE.source.replace(/\\\//g, '/'))} && gh pr merge ${prNum} --squash`,
  `gh pr view ${prNum} --json state,mergeCommit --jq '"\\(.state) \\(.mergeCommit.oid)"'`,
  `git push -q origin --delete ${BRANCH}`,
], 'Ship')
const mergeLine = (mg.outs[1] && mg.outs[1].tail) || ''
const mergeSha = (mergeLine.match(/MERGED ([0-9a-f]{40})/) || [])[1]
if (!mergeSha) return result('merge-failed', { id: ID, pr: prNum, detail: mg.text.slice(-600) })

phase('Smoke')
if (!shipFix) return result('records-only merged', { id: ID, pr: prNum, mergeSha, reconciled })
if (!S.home) return result('merged (smoke not configured)', { id: ID, pr: prNum, mergeSha })
// Deploys can take up to 30 min (deploy-cloudflare.yml timeout): poll in <9 min chunks.
const runId = (sha) => `gh run list --workflow=deploy-cloudflare.yml --branch main --limit 15 --json databaseId,headSha --jq '.[] | select(.headSha=="${sha}") | .databaseId' | head -1`
const watchDeploy = (sha) => ops('deploy', [
  ...poll(`[ -n "$(${runId(sha)})" ]`, 1),
  ...poll(`[ "$(gh run view "$(${runId(sha)})" --json status --jq .status 2>/dev/null)" = completed ]`, 4),
  `id=$(${runId(sha)}); [ -z "$id" ] && echo "deploy=notfound" || echo "deploy=$(gh run view "$id" --json status,conclusion --jq 'if .status=="completed" then .conclusion else "timeout" end') run=$id"`,
], 'Smoke')
const dep = await watchDeploy(mergeSha)
const deploy = (dep.text.match(/deploy=(\w+)/) || [])[1] || 'unknown'
// A cancelled or superseded deploy (bots push to main all day) is not evidence of a bad change.
if (deploy !== 'success' && deploy !== 'failure') return result('deploy-unobserved', { id: ID, pr: prNum, mergeSha, detail: dep.text.slice(-300) })

let post = deploy === 'success' ? await smoke('smoke-1') : null
if (post && !post.green && !post.challenged) post = await smoke('smoke-2')
const prodRed = deploy !== 'success' || (post && !post.green && !post.challenged)
if (!prodRed) {
  return result(post && post.challenged ? 'merged (smoke unmeasurable: challenged)' : 'merged-smoke-green', { id: ID, pr: prNum, mergeSha, deploy, smoke: post, baseline: base, reviews: reviews.map(lensLine) })
}
if (!base.green && !base.challenged) {
  return result('merged (prod was already red before merge; no revert)', { id: ID, pr: prNum, mergeSha, deploy, smoke: post, baseline: base })
}

// ───────────────────────── Rollback: a revert PR through the same gates ─────────────────────────
const why = deploy !== 'success' ? `deploy ${deploy}` : `smoke home ${post.home && post.home.status}/${post.home && post.home.marker} api ${post.api && post.api.status}/${post.api && post.api.marker}`
const RB = `revert/${ID}-pr${prNum}`
const scratch = `"\${TMPDIR:-/tmp}/mcppedia-${RB.replace(/\//g, '-')}"`
const rb = await ops('revert', [
  `git fetch origin -q && git worktree add -q -b ${RB} ${scratch} origin/main && git -C ${scratch} revert --no-edit ${mergeSha}`,
  heredoc(`python3 ${ROOT}/.claude/ceo/bin/records.py --root ${scratch} apply --date ${DATE}`, { backlog: [{ op: 'note', id: ID, text: `cycle-failed ${DATE}: PR #${prNum} reverted automatically: ${why}` }],
    scorecard: `| ${DATE} | ${ID} | #${prNum} | reverted | — | — | yes: ${why} | — |` },
    `&& git -C ${scratch} add BACKLOG.md .claude/ceo/memory && git -C ${scratch} commit -q -m "records(${ID}): reverted PR #${prNum}" && git -C ${scratch} push -q -u origin ${RB}`),
  bodyHeredoc(`gh pr create --base main --head ${RB} --title ${shq(`revert: PR #${prNum} (${ID}): ${why}`)} --body-file -`,
    `Automatic rollback by \`${RUN}\`: after PR #${prNum} merged, ${why}. The pre-merge baseline smoke was green, so this PR is the likely cause.\n\n${protectedTouched.length ? 'Reverts protected paths; labelled `human-approved` per CLAUDE.md §6.\n\n' : ''}🤖 Generated with [Claude Code](https://claude.com/claude-code)`),
], 'Smoke')
const rbNum = Number((rb.text.match(/\/pull\/(\d+)/) || [])[1])
if (!rbNum) return result('revert-failed: NEEDS A HUMAN NOW', { id: ID, pr: prNum, mergeSha, why, detail: rb.text.slice(-600) })
const rbm = await ops('revert-merge', [
  ...(protectedTouched.length ? [`gh pr edit ${rbNum} --add-label human-approved`] : []),
  'sleep 30', ...poll(checksDone(rbNum), 2), checksList(rbNum),
  // A revert restores the last known-good code, so it merges even if a check is red: the
  // alternative is leaving a broken prod deployed while waiting for a human.
  `gh pr merge ${rbNum} --squash && gh pr view ${rbNum} --json mergeCommit --jq .mergeCommit.oid`,
  `git push -q origin --delete ${RB}; git worktree remove --force ${scratch}`,
], 'Smoke')
const rbSha = (rbm.text.match(/\b([0-9a-f]{40})\b/) || [])[1]
if (!rbSha) return result('revert-not-merged: NEEDS A HUMAN NOW', { id: ID, pr: prNum, revertPr: rbNum, why })
const dep2 = await watchDeploy(rbSha)
const after = await smoke('smoke-after-revert')
return result(after.green ? 'reverted' : 'reverted (prod still red: NEEDS A HUMAN)', { id: ID, pr: prNum, revertPr: rbNum, why, deploy2: (dep2.text.match(/deploy=(\w+)/) || [])[1], smoke: after })
