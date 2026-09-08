/**
 * Schema drift check — does production actually match what the migrations say?
 *
 * A file in `supabase/migrations/` proves only that it was MERGED. The ledger
 * (`supabase_migrations.schema_migrations`) can record a file as applied while
 * none of its statements ever ran, and `supabase db push` then skips it forever.
 * `20260610000000_security_hardening.sql` is exactly that case, and three org
 * documents went on to diagnose production bugs from policies that were never
 * live. Only the live catalog describes production.
 *
 * So this compares the INTENT parsed out of `supabase/migrations/**` against the
 * live catalog, and it compares DEFINITIONS rather than names: the repo idiom is
 * `DROP POLICY IF EXISTS "X"; CREATE POLICY "X" …`, so a name-only sweep sees the
 * name and never notices it still carries the old body.
 *
 * Strictly read-only. Every statement runs inside `BEGIN TRANSACTION READ ONLY`,
 * so the server itself rejects a write, and every query issued is a SELECT.
 *
 * Usage:
 *   npm run check:schema-drift
 *   npx tsx scripts/check-schema-drift.ts [--migrations <dir>]
 *
 * Env: SUPABASE_DB_URL — the same variable .github/workflows/migrate.yml uses.
 * Exit: 0 clean · 1 drift found · 2 could not check (no URL, parse or query error).
 */

import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: '.env.local' })

// --- pg_query (libpg_query, compiled to wasm) ---------------------------------

type PgNode = Record<string, unknown>
interface RawStmt { stmt?: PgNode; stmt_location?: number; stmt_len?: number }
interface ParseResult { parse_tree?: { stmts?: RawStmt[] }; error?: { message?: string } | null }
interface PgQuery { parse(sql: string): ParseResult }

const requireCjs = createRequire(import.meta.url)
const pgQueryFactory = requireCjs('pg-query-emscripten').default as () => Promise<PgQuery>
let pgQuery: PgQuery | null = null

// `.default` is an ASYNC module factory, and a single instance goes bad after a
// few dozen parses (the wasm function table goes stale and calls throw
// "… is not a function"), so re-instantiate and retry rather than lose a file.
async function parseSql(sql: string): Promise<ParseResult> {
  if (!pgQuery) pgQuery = await pgQueryFactory()
  try {
    return pgQuery.parse(sql)
  } catch {
    pgQuery = await pgQueryFactory()
    return pgQuery.parse(sql)
  }
}

// --- AST helpers --------------------------------------------------------------

function operatorName(nameNodes: unknown): string {
  if (!Array.isArray(nameNodes)) return ''
  const last = nameNodes[nameNodes.length - 1] as PgNode | undefined
  return ((last?.String as { sval?: string } | undefined)?.sval) ?? ''
}

/** Fold `x IN (a, b)` and `x = ANY (ARRAY[a, b])` onto one order-free node. */
function asMembership(node: unknown): PgNode | null {
  const ex = node as PgNode | undefined
  if (!ex) return null
  const op = operatorName(ex.name)
  let values: unknown[] | null = null
  if (ex.kind === 'AEXPR_IN') {
    const list = (ex.rexpr as PgNode | undefined)?.List as PgNode | undefined
    if (Array.isArray(ex.rexpr)) values = ex.rexpr
    else if (Array.isArray(list?.items)) values = list.items as unknown[]
  } else if (ex.kind === 'AEXPR_OP_ANY' || ex.kind === 'AEXPR_OP_ALL') {
    const arr = (ex.rexpr as PgNode | undefined)?.A_ArrayExpr as PgNode | undefined
    if (Array.isArray(arr?.elements)) values = arr.elements as unknown[]
  }
  if (!values) return null
  // `= ANY` is membership and `<> ALL` is its negation; `= ALL` / `<> ANY` mean
  // something else entirely, so leave those to the generic path.
  const negated = op === '<>'
  if (op !== '=' && !negated) return null
  if (ex.kind === 'AEXPR_OP_ANY' && negated) return null
  if (ex.kind === 'AEXPR_OP_ALL' && !negated) return null
  return {
    Membership: {
      negated,
      operand: canon(ex.lexpr),
      values: values.map((v) => JSON.stringify(canon(v))).sort(),
    },
  }
}

/**
 * Reduce an expression tree to a form where a difference means a real difference.
 * Postgres deparses `status = 'pending'` back as `(status = 'pending'::text)` and
 * table-qualifies columns inside sub-selects, so comparing the raw strings — or
 * even the raw trees — cries wolf on every single policy.
 */
function canon(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(canon)
  if (node === null || typeof node !== 'object') return node
  const obj = node as PgNode

  if (obj.TypeCast) return canon((obj.TypeCast as PgNode).arg)

  if (obj.ColumnRef) {
    const fields = ((obj.ColumnRef as PgNode).fields as unknown[] | undefined) ?? []
    return { ColumnRef: { fields: [canon(fields[fields.length - 1])] } }
  }

  // AND/OR are commutative and associative; so are `=` and `<>`. Sorting the
  // operands means a reordered predicate is not reported as a changed one.
  if (obj.BoolExpr) {
    const be = obj.BoolExpr as { boolop?: string; args?: unknown[] }
    const args = (be.args ?? []).map((a) => JSON.stringify(canon(a))).sort()
    return { BoolExpr: { boolop: be.boolop, args } }
  }

  // A deparsed predicate never says IN: `role IN ('a','b')` comes back as
  // `role = ANY (ARRAY['a','b'])`. Fold both spellings onto one membership node.
  const membership = asMembership(obj.A_Expr)
  if (membership) return membership

  const ex = obj.A_Expr as PgNode | undefined
  if (ex && ex.kind === 'AEXPR_OP' && ['=', '<>'].includes(operatorName(ex.name))) {
    const operands = [JSON.stringify(canon(ex.lexpr)), JSON.stringify(canon(ex.rexpr))].sort()
    return { A_Expr: { kind: ex.kind, name: canon(ex.name), operands } }
  }

  // Deparsing aliases a sub-select's table (`profiles profiles_1`) and resolves it
  // through the search_path, so the alias and a bare `public.` are both noise.
  if (obj.RangeVar) {
    const rv = { ...(obj.RangeVar as PgNode) }
    delete rv.alias
    if (rv.schemaname === 'public') delete rv.schemaname
    return { RangeVar: canon(rv) }
  }

  const out: PgNode = {}
  for (const key of Object.keys(obj).sort()) {
    if (key === 'location') continue
    out[key] = canon(obj[key])
  }
  return out
}

/** Split a predicate into its top-level AND conjuncts — the unit we compare. */
function topConjuncts(node: unknown): PgNode[] {
  if (!node || typeof node !== 'object') return []
  const be = (node as PgNode).BoolExpr as { boolop?: string; args?: unknown[] } | undefined
  if (be?.boolop === 'AND_EXPR' && Array.isArray(be.args)) return be.args.flatMap(topConjuncts)
  return [node as PgNode]
}

const NO_LOCATION = Number.MAX_SAFE_INTEGER

/** Lowest byte offset anywhere in a subtree — where its source text starts. */
function minLoc(node: unknown, best = NO_LOCATION): number {
  if (Array.isArray(node)) {
    for (const child of node) best = minLoc(child, best)
    return best
  }
  if (!node || typeof node !== 'object') return best
  for (const [key, value] of Object.entries(node as PgNode)) {
    if (key === 'location') {
      if (typeof value === 'number' && value >= 0) best = Math.min(best, value)
    } else {
      best = minLoc(value, best)
    }
  }
  return best
}

/** Cut at the first `)` that closes a paren we never opened — i.e. `USING (`'s. */
function cutAtUnmatchedParen(text: string): string {
  let depth = 0
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuote) {
      if (ch === "'") inQuote = false
      continue
    }
    if (ch === "'") inQuote = true
    else if (ch === '(') depth++
    else if (ch === ';') return text.slice(0, i)
    else if (ch === ')') {
      if (depth === 0) return text.slice(0, i)
      depth--
    }
  }
  return text
}

/**
 * Source text for each conjunct. `location` is a BYTE offset, so slice the
 * Buffer — these migrations contain em dashes and a JS-string offset would drift.
 */
function conjunctTexts(buf: Buffer, conjuncts: PgNode[], endLimit: number): string[] {
  const starts = conjuncts.map((c) => minLoc(c))
  return conjuncts.map((_, i) => {
    const start = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1] : endLimit
    if (start === NO_LOCATION || start >= end) return '(source text unavailable)'
    const raw = cutAtUnmatchedParen(buf.subarray(start, end).toString('utf8'))
    const text = raw.replace(/\s+(and|or)\s*$/i, '').replace(/\s+/g, ' ').trim()
    return text || '(source text unavailable)'
  })
}

// --- Intent, derived from the migration files ---------------------------------

interface PolicyIntent {
  schema: string
  table: string
  name: string
  cmd: string
  permissive: boolean
  qual: PgNode | null
  withCheck: PgNode | null
  file: string
  buf: Buffer
  stmtEnd: number
}

interface FunctionIntent {
  schema: string
  name: string
  searchPath: string | null
  securityDefiner: boolean
  file: string
}

interface Named { schema: string; table: string; name: string; file: string }

interface Intent {
  policies: Map<string, PolicyIntent>
  functions: Map<string, FunctionIntent>
  columns: Map<string, Named>
  rlsTables: Map<string, { schema: string; table: string; file: string }>
  triggers: Map<string, Named>
  schemas: Set<string>
  files: number
  statements: number
}

function relOf(rel: unknown): { schema: string; table: string } {
  const r = (rel ?? {}) as { schemaname?: string; relname?: string }
  return { schema: r.schemaname ?? 'public', table: r.relname ?? '?' }
}

function strList(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return []
  return nodes.map((n) => ((n as PgNode)?.String as { sval?: string } | undefined)?.sval ?? '')
}

function readSearchPath(options: unknown): string | null {
  if (!Array.isArray(options)) return null
  for (const opt of options) {
    const def = (opt as PgNode)?.DefElem as PgNode | undefined
    if (def?.defname !== 'set') continue
    // DefElem.arg is a wrapped node — `{ VariableSetStmt: { … } }`, not the stmt.
    const set = (def.arg as PgNode | undefined)?.VariableSetStmt as { name?: string; args?: unknown[] } | undefined
    if (set?.name !== 'search_path') continue
    const first = (set.args ?? [])[0] as PgNode | undefined
    const constant = first?.A_Const as { sval?: { sval?: string } } | undefined
    return constant?.sval?.sval ?? ''
  }
  return null
}

function hasSecurityDefiner(options: unknown): boolean {
  if (!Array.isArray(options)) return false
  return options.some((opt) => {
    const def = (opt as PgNode)?.DefElem as PgNode | undefined
    const flag = (def?.arg as PgNode | undefined)?.Boolean as { boolval?: boolean } | undefined
    return def?.defname === 'security' && flag?.boolval === true
  })
}

async function buildIntent(dir: string): Promise<Intent> {
  const intent: Intent = {
    policies: new Map(),
    functions: new Map(),
    columns: new Map(),
    rlsTables: new Map(),
    triggers: new Map(),
    schemas: new Set(['public']),
    files: 0,
    statements: 0,
  }

  // Filename order IS apply order for supabase migrations, and last write wins.
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  if (files.length === 0) throw new Error(`no .sql files under ${dir}`)

  for (const file of files) {
    const buf = readFileSync(path.join(dir, file))
    const result = await parseSql(buf.toString('utf8'))
    if (result.error) throw new Error(`${file}: ${result.error.message ?? 'parse failed'}`)
    const stmts = result.parse_tree?.stmts ?? []
    intent.files++
    intent.statements += stmts.length

    for (const raw of stmts) {
      const stmt = raw.stmt ?? {}
      const stmtEnd = (raw.stmt_location ?? 0) + (raw.stmt_len ?? buf.length)

      const policy = stmt.CreatePolicyStmt as PgNode | undefined
      if (policy) {
        const { schema, table } = relOf(policy.table)
        intent.schemas.add(schema)
        intent.policies.set(`${schema}.${table}|${policy.policy_name as string}`, {
          schema,
          table,
          name: policy.policy_name as string,
          cmd: String(policy.cmd_name ?? 'all').toLowerCase(),
          permissive: policy.permissive !== false,
          qual: (policy.qual as PgNode | undefined) ?? null,
          withCheck: (policy.with_check as PgNode | undefined) ?? null,
          file,
          buf,
          stmtEnd,
        })
        continue
      }

      const drop = stmt.DropStmt as PgNode | undefined
      if (drop && (drop.removeType === 'OBJECT_POLICY' || drop.removeType === 'OBJECT_TRIGGER')) {
        for (const object of (drop.objects as unknown[]) ?? []) {
          const parts = strList(((object as PgNode)?.List as PgNode | undefined)?.items)
          if (parts.length < 2) continue
          const name = parts[parts.length - 1]
          const table = parts[parts.length - 2]
          const schema = parts.length >= 3 ? parts[parts.length - 3] : 'public'
          // A DROP after the last CREATE means the object is intended to be gone.
          if (drop.removeType === 'OBJECT_POLICY') intent.policies.delete(`${schema}.${table}|${name}`)
          else intent.triggers.delete(`${schema}.${table}|${name}`)
        }
        continue
      }

      const fn = stmt.CreateFunctionStmt as PgNode | undefined
      if (fn) {
        const parts = strList(fn.funcname)
        const name = parts[parts.length - 1]
        const schema = parts.length >= 2 ? parts[parts.length - 2] : 'public'
        intent.schemas.add(schema)
        // Keyed by name, not signature: we only assert properties that every
        // overload of a name must share (see the caveats printed by report()).
        intent.functions.set(`${schema}.${name}`, {
          schema,
          name,
          searchPath: readSearchPath(fn.options),
          securityDefiner: hasSecurityDefiner(fn.options),
          file,
        })
        continue
      }

      const trigger = stmt.CreateTrigStmt as PgNode | undefined
      if (trigger) {
        const { schema, table } = relOf(trigger.relation)
        intent.schemas.add(schema)
        const name = trigger.trigname as string
        intent.triggers.set(`${schema}.${table}|${name}`, { schema, table, name, file })
        continue
      }

      const alter = stmt.AlterTableStmt as PgNode | undefined
      if (alter) {
        const { schema, table } = relOf(alter.relation)
        intent.schemas.add(schema)
        for (const cmdNode of (alter.cmds as unknown[]) ?? []) {
          const cmd = (cmdNode as PgNode)?.AlterTableCmd as PgNode | undefined
          if (cmd?.subtype === 'AT_AddColumn') {
            const col = (cmd.def as PgNode | undefined)?.ColumnDef as { colname?: string } | undefined
            if (col?.colname) {
              intent.columns.set(`${schema}.${table}.${col.colname}`, { schema, table, name: col.colname, file })
            }
          } else if (cmd?.subtype === 'AT_EnableRowSecurity') {
            intent.rlsTables.set(`${schema}.${table}`, { schema, table, file })
          }
        }
      }
    }
  }

  return intent
}

// --- Live catalog -------------------------------------------------------------

interface LivePolicy { schemaname: string; tablename: string; policyname: string; permissive: string; cmd: string; qual: string | null; with_check: string | null }
interface LiveFunction { schema: string; name: string; args: string; prosecdef: boolean; proconfig: string[] | null }

interface Live {
  policies: Map<string, LivePolicy>
  functions: Map<string, LiveFunction[]>
  columns: Set<string>
  tables: Map<string, boolean>
  triggers: Set<string>
}

async function readLive(client: Client, schemas: string[]): Promise<Live> {
  const policies = await client.query<LivePolicy>(
    `select schemaname, tablename, policyname, permissive, cmd, qual, with_check
       from pg_policies where schemaname = any($1::text[])`,
    [schemas],
  )
  const functions = await client.query<LiveFunction>(
    `select n.nspname as schema, p.proname as name,
            pg_get_function_identity_arguments(p.oid) as args,
            p.prosecdef, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = any($1::text[]) and p.prokind = 'f'`,
    [schemas],
  )
  const columns = await client.query<{ table_schema: string; table_name: string; column_name: string }>(
    `select table_schema, table_name, column_name from information_schema.columns
      where table_schema = any($1::text[])`,
    [schemas],
  )
  const tables = await client.query<{ schema: string; name: string; relrowsecurity: boolean }>(
    `select n.nspname as schema, c.relname as name, c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname = any($1::text[])`,
    [schemas],
  )
  const triggers = await client.query<{ schema: string; table: string; name: string }>(
    `select n.nspname as schema, c.relname as table, t.tgname as name
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and n.nspname = any($1::text[])`,
    [schemas],
  )

  const liveFunctions = new Map<string, LiveFunction[]>()
  for (const row of functions.rows) {
    const key = `${row.schema}.${row.name}`
    const bucket = liveFunctions.get(key)
    if (bucket) bucket.push(row)
    else liveFunctions.set(key, [row])
  }

  return {
    policies: new Map(policies.rows.map((r) => [`${r.schemaname}.${r.tablename}|${r.policyname}`, r])),
    functions: liveFunctions,
    columns: new Set(columns.rows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`)),
    tables: new Map(tables.rows.map((r) => [`${r.schema}.${r.name}`, r.relrowsecurity])),
    triggers: new Set(triggers.rows.map((r) => `${r.schema}.${r.table}|${r.name}`)),
  }
}

// --- Comparison ---------------------------------------------------------------

interface Finding { label: string; object: string; source: string; detail: string[] }

/** Which intended conditions the live predicate does not contain. */
async function missingConditions(
  intended: PgNode,
  intendedBuf: Buffer,
  intendedEnd: number,
  livePredicate: string,
): Promise<{ missing: string[]; total: number; comparable: boolean }> {
  const wrapper = `CREATE POLICY p ON t FOR ALL USING (${livePredicate});`
  const parsed = await parseSql(wrapper)
  const liveExpr = ((parsed.parse_tree?.stmts ?? [])[0]?.stmt?.CreatePolicyStmt as PgNode | undefined)?.qual
  const intendedConjuncts = topConjuncts(intended)
  if (parsed.error || !liveExpr) {
    return { missing: [], total: intendedConjuncts.length, comparable: false }
  }
  const liveKeys = new Set(topConjuncts(liveExpr).map((c) => JSON.stringify(canon(c))))
  const texts = conjunctTexts(intendedBuf, intendedConjuncts, intendedEnd)
  const missing = intendedConjuncts
    .map((c, i) => ({ key: JSON.stringify(canon(c)), text: texts[i] }))
    .filter((c) => !liveKeys.has(c.key))
    .map((c) => c.text)
  return { missing, total: intendedConjuncts.length, comparable: true }
}

async function comparePolicies(intent: Intent, live: Live, drift: Finding[], notes: Finding[]): Promise<void> {
  for (const policy of intent.policies.values()) {
    const object = `${policy.schema}.${policy.table} "${policy.name}"`
    const key = `${policy.schema}.${policy.table}|${policy.name}`
    const found = live.policies.get(key)
    if (!found) {
      const reason = live.tables.has(`${policy.schema}.${policy.table}`)
        ? 'no policy of that name exists on the live table'
        : 'the table itself does not exist in the live catalog'
      drift.push({ label: 'policy missing', object, source: policy.file, detail: [reason] })
      continue
    }

    if (found.cmd.toLowerCase() !== policy.cmd) {
      drift.push({
        label: 'policy command',
        object,
        source: policy.file,
        detail: [`intended FOR ${policy.cmd.toUpperCase()}, live is FOR ${found.cmd.toUpperCase()}`],
      })
    }
    const livePermissive = found.permissive.toUpperCase() !== 'RESTRICTIVE'
    if (livePermissive !== policy.permissive) {
      drift.push({
        label: 'policy kind',
        object,
        source: policy.file,
        detail: [`intended ${policy.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}, live is ${found.permissive}`],
      })
    }

    for (const clause of ['USING', 'WITH CHECK'] as const) {
      const intended = clause === 'USING' ? policy.qual : policy.withCheck
      const liveText = clause === 'USING' ? found.qual : found.with_check
      if (!intended) {
        if (liveText) {
          notes.push({
            label: 'extra live clause',
            object,
            source: policy.file,
            detail: [`the migrations declare no ${clause}, live has: ${liveText}`],
          })
        }
        continue
      }
      if (!liveText) {
        drift.push({
          label: `policy ${clause}`,
          object,
          source: policy.file,
          detail: [`the migrations declare a ${clause}, the live policy has none`],
        })
        continue
      }
      const { missing, total, comparable } = await missingConditions(intended, policy.buf, policy.stmtEnd, liveText)
      if (!comparable) {
        notes.push({
          label: 'not comparable',
          object,
          source: policy.file,
          detail: [`could not re-parse the live ${clause}: ${liveText}`],
        })
        continue
      }
      if (missing.length > 0) {
        drift.push({
          label: `policy ${clause}`,
          object,
          source: policy.file,
          detail: [
            `live ${clause} is missing ${missing.length} of ${total} intended condition(s):`,
            ...missing.map((m) => `    - ${m}`),
            `  live ${clause}: ${liveText}`,
          ],
        })
      }
    }
  }

  for (const [key, found] of live.policies) {
    if (intent.policies.has(key)) continue
    notes.push({
      label: 'unexpected policy',
      object: `${found.schemaname}.${found.tablename} "${found.policyname}"`,
      source: '(not in any migration)',
      detail: [`FOR ${found.cmd} — permissive policies OR together, so an unexpected one can only widen access`],
    })
  }
}

function compareFunctions(intent: Intent, live: Live, drift: Finding[]): void {
  for (const fn of intent.functions.values()) {
    if (fn.searchPath === null && !fn.securityDefiner) continue
    const key = `${fn.schema}.${fn.name}`
    const overloads = live.functions.get(key)
    const object = `${fn.schema}.${fn.name}()`
    if (!overloads || overloads.length === 0) {
      drift.push({ label: 'function missing', object, source: fn.file, detail: ['no function of that name exists live'] })
      continue
    }
    if (fn.searchPath !== null) {
      const want = `search_path=${fn.searchPath === '' ? '""' : fn.searchPath}`
      const bad = overloads.filter((o) => !(o.proconfig ?? []).some((c) => c.replace(/\s/g, '') === want))
      if (bad.length > 0) {
        drift.push({
          label: 'function search_path',
          object,
          source: fn.file,
          detail: [
            `the migrations declare SET search_path = ${fn.searchPath === '' ? "''" : fn.searchPath}; live proconfig does not carry it:`,
            ...bad.map((o) => `    - ${fn.name}(${o.args}) → proconfig ${o.proconfig ? JSON.stringify(o.proconfig) : 'NULL'}`),
          ],
        })
      }
    }
    if (fn.securityDefiner) {
      const bad = overloads.filter((o) => !o.prosecdef)
      if (bad.length > 0) {
        drift.push({
          label: 'function security',
          object,
          source: fn.file,
          detail: [
            'the migrations declare SECURITY DEFINER; live is SECURITY INVOKER:',
            ...bad.map((o) => `    - ${fn.name}(${o.args})`),
          ],
        })
      }
    }
  }
}

function compareRest(intent: Intent, live: Live, drift: Finding[]): void {
  for (const [key, col] of intent.columns) {
    if (!live.columns.has(key)) {
      drift.push({
        label: 'column missing',
        object: key,
        source: col.file,
        detail: ['the migrations ADD this COLUMN; information_schema.columns has no such column'],
      })
    }
  }
  for (const [key, table] of intent.rlsTables) {
    const rls = live.tables.get(key)
    if (rls === undefined) {
      drift.push({ label: 'table missing', object: key, source: table.file, detail: ['the migrations ENABLE ROW LEVEL SECURITY on a table that does not exist live'] })
    } else if (!rls) {
      drift.push({ label: 'RLS disabled', object: key, source: table.file, detail: ['the migrations ENABLE ROW LEVEL SECURITY; pg_class.relrowsecurity is false'] })
    }
  }
  for (const [key, trigger] of intent.triggers) {
    if (!live.triggers.has(key)) {
      drift.push({ label: 'trigger missing', object: key.replace('|', ' → '), source: trigger.file, detail: ['the migrations CREATE this TRIGGER; pg_trigger has no such row'] })
    }
  }
}

// --- Report -------------------------------------------------------------------

const CAVEATS = [
  'Predicates are compared as top-level AND conjuncts, after canonicalising away',
  'casts, parenthesisation, operand order and table-qualification. So this DETECTS an',
  'intended condition that is absent from the live predicate — the direction that made',
  '20260610000000 dangerous. It does NOT detect a live predicate that is weaker in some',
  'other way (an extra OR arm around an intended condition still contains it), a policy',
  'whose grantee roles differ, a function whose BODY drifted, a column whose type or',
  'default drifted, or anything about data. Function properties are asserted per NAME,',
  'so an overload the migrations never mention is still checked against them.',
  'Objects created outside supabase/migrations/** are listed under NOTES, never as drift.',
]

function printFindings(title: string, findings: Finding[]): void {
  console.log(`--- ${title} (${findings.length}) ---\n`)
  if (findings.length === 0) {
    console.log('  none\n')
    return
  }
  for (const f of findings) {
    console.log(`  [${f.label}] ${f.object}`)
    console.log(`  intent from ${f.source}`)
    for (const line of f.detail) console.log(`  ${line}`)
    console.log('')
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const dirFlag = argv.indexOf('--migrations')
  const migrationsDir = path.resolve(
    dirFlag !== -1 && argv[dirFlag + 1] ? argv[dirFlag + 1] : 'supabase/migrations',
  )

  const url = process.env.SUPABASE_DB_URL
  if (!url) {
    console.error('SUPABASE_DB_URL is not set — cannot read the live catalog.')
    console.error('It is the same variable .github/workflows/migrate.yml uses; put it in .env.local to run locally.')
    return 2
  }

  const intent = await buildIntent(migrationsDir)
  const schemas = [...intent.schemas].sort()

  const client = new Client({ connectionString: url })
  await client.connect()

  let live: Live
  try {
    // Read-only is enforced by the SERVER, not by our own discipline: any write
    // inside this transaction is rejected with 25006.
    await client.query('BEGIN TRANSACTION READ ONLY')
    await client.query("SET LOCAL statement_timeout = '30s'")
    live = await readLive(client, schemas)
    await client.query('COMMIT')
  } finally {
    await client.end()
  }

  const drift: Finding[] = []
  const notes: Finding[] = []
  await comparePolicies(intent, live, drift, notes)
  compareFunctions(intent, live, drift)
  compareRest(intent, live, drift)

  const { host, port, database, user } = client as unknown as { host: string; port: number; database: string; user: string }
  console.log('=== Schema drift check: migration INTENT vs the LIVE catalog ===\n')
  console.log(`migrations : ${migrationsDir}`)
  console.log(`             ${intent.files} files, ${intent.statements} statements parsed`)
  console.log(`database   : ${user}@${host}:${port}/${database}  [BEGIN TRANSACTION READ ONLY]`)
  console.log(`schemas    : ${schemas.join(', ')}`)
  console.log(
    `intent     : ${intent.policies.size} policies, ${intent.functions.size} functions, ` +
      `${intent.columns.size} added columns, ${intent.rlsTables.size} RLS tables, ${intent.triggers.size} triggers`,
  )
  console.log(`live       : ${live.policies.size} policies, ${live.functions.size} function names, ` +
      `${live.columns.size} columns, ${live.tables.size} tables, ${live.triggers.size} triggers\n`)

  printFindings('DRIFT', drift)
  printFindings('NOTES (not drift — informational)', notes)

  console.log('--- What this check can and cannot see ---\n')
  for (const line of CAVEATS) console.log(`  ${line}`)
  console.log('')
  console.log(
    drift.length === 0
      ? 'CLEAN — every intended definition is present in the live catalog.'
      : `DRIFT — ${drift.length} finding(s). A migration file proves only that it was MERGED.`,
  )
  return drift.length === 0 ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error('schema drift check could not run:', err instanceof Error ? err.message : err)
    process.exit(2)
  })
