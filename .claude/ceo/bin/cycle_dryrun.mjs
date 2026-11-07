#!/usr/bin/env node
// Dry run of .claude/workflows/mcppedia-cycle.js against mocked agents: no tokens, no git, no network.
// Usage: node .claude/ceo/bin/cycle_dryrun.mjs [show]   (run it after every edit to the workflow script)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src=fs.readFileSync(path.join(__dirname, "../../workflows/mcppedia-cycle.js"),"utf8").replace(/^export const meta/m,"const meta");
const AF=Object.getPrototypeOf(async function(){}).constructor;
const SHA="a".repeat(40), SHA2="b".repeat(40);
const EXPECT={happy:"merged-smoke-green",audit:"audit","fix-round":"merged-smoke-green","gate-red-then-green":"merged-smoke-green",
  "never-fixed":"review-failed","ci-red":"ci-red",tripwire:"tree-corrupted","smoke-fail-revert":"reverted",
  "prod-already-red":"merged (prod was already red before merge; no revert)","pick-blocked":"records-only merged",
  resolved:"records-only merged","registry-missing":"merged-smoke-green","wrong-premise-twice":"records-only merged"};
let failures=0;
async function run(name, tweak={}) {
  const calls=[]; const cmdsSeen={};
  const agent=async(prompt,o)=>{
    if(tweak.noRegistry && o.agentType) throw new Error(`Agent type '${o.agentType}' not found`);
    const L=o.label.replace(/~$/,""); calls.push(L+(o.model?`[${o.model}]`:"")+(o.isolation?"{wt}":""));
    const n=(prompt.match(/^### \d+/mg)||[]).length;
    const ok=(tails)=>({outputs:Array.from({length:n},(_,i)=>({exit:0,tail:(tails&&tails[i])||""}))});
    if(L.startsWith("ops:")) cmdsSeen[L]=prompt.split("\n\n").slice(1).join("\n\n");
    if(tweak[L]) return tweak[L](prompt,n,ok);
    if(L==="pick") return {id:"S44",title:"pin `.int()` on MCP tool schemas",slug:"Pin INT schemas!",kind:"test-gap",status_seen:"open",reason:"small",files_guess:["lib/mcp/tools.ts"],runner_up:"S2"};
    if(L.startsWith("verify:")) return {verdict:"STILL_TRUE",evidence:"tools.ts:73 has .int(), no test",files:["__tests__/mcp-int.test.ts","lib/mcp/tools.ts"],plan_steps:["add test","assert schema"],hard:false,feature_check:"npx vitest run __tests__/mcp-int.test.ts",facts:["f1"]};
    if(L==="ops:branch") return ok([(prompt.match(/switch -c (\S+)/)||[])[1]]);
    if(L.startsWith("build")) return {status:"done",commit_sha:"c0ffee",files_changed:[],proving_test:"t",deviations:"none"};
    if(L==="ops:diff") return ok(["__tests__/mcp-int.test.ts\nlib/mcp/tools.ts"]);
    if(L.startsWith("gate:")) return {verdict:"GO",gates:[{name:"tsc",result:"green"}],branch_seen:"improve/S44-pin-int-schemas"};
    if(L.startsWith("review:")) return {lens:L.split(":")[1],verdict:"CLEAN",findings:[]};
    if(L==="ops:records") return ok(["","","https://github.com/BbekShr/mcppedia/pull/201"]);
    if(L==="ops:ci"){const t=ok(); t.outputs[n-1].tail="pass CI\npass guard"; return t;}
    if(L.startsWith("ops:smoke")) return ok(["status=200\nchallenged=0\nmarker=1","status=200\nchallenged=0\nmarker=1"]);
    if(L==="ops:merge") return ok(["","MERGED "+SHA,""]);
    if(L==="ops:deploy"){const t=ok(); t.outputs[n-1].tail="deploy=success run=9"; return t;}
    if(L==="ops:revert") return ok(["","","https://github.com/BbekShr/mcppedia/pull/202"]);
    if(L==="ops:revert-merge"){const t=ok(); t.outputs[n-2].tail=SHA2; return t;}
    throw new Error("unmocked "+L);
  };
  const parallel=async(th)=>Promise.all(th.map(t=>t().catch(()=>null)));
  const args={mode:"run",root:"/repo",date:"2026-11-07",mainSha:"bdc387c",reconcile:[{id:"S36",pr:192}],blockedIds:["S9"],lessons:"- l",
    smoke:{home:"https://mcppedia.org/",homeMarker:"Find the Right MCP Server",api:"https://mcppedia.org/api/v1/servers?limit=1",apiMarker:'"servers":['},...(tweak.args||{})};
  const r=await new AF("args","agent","parallel","pipeline","phase","log","budget",src)(args,agent,parallel,null,()=>{},()=>{},{total:null,spent:()=>123456,remaining:()=>Infinity});
  const okay=EXPECT[name]===r.outcome; if(!okay) failures++;
  console.log(`\n${okay?"==":"!! FAIL (expected "+EXPECT[name]+")"} ${name}: ${r.outcome}  pr=${r.pr||"-"} notes=${JSON.stringify(r.notes)}\n   ${calls.join(" → ")}`);
  return {r,cmdsSeen};
}
(async()=>{
  const h=await run("happy");
  if(process.argv[2]) for(const k of ["ops:records","ops:ci","ops:deploy","ops:smoke-1"]) console.log(`\n--- ${k}\n`+h.cmdsSeen[k]);
  await run("audit",{args:{mode:"audit"}});
  await run("fix-round",{"review:correctness:r1":()=>({lens:"correctness",verdict:"FINDINGS",findings:[{grade:"CONFIRMED",file:"lib/mcp/tools.ts",line:73,scenario:"s",fix:"f"}]})});
  await run("gate-red-then-green",{"gate:r1":()=>({verdict:"NO-GO",failed_gate:3,gates:[{name:"test",result:"red",tail:"boom"}],branch_seen:"improve/S44-pin-int-schemas"})});
  await run("never-fixed",{"review:regression:r1":()=>({lens:"regression",verdict:"FINDINGS",findings:[{grade:"CONFIRMED",file:"lib/mcp/tools.ts",line:1,scenario:"s",fix:"f"}]}),"review:regression:r2":()=>({lens:"regression",verdict:"FINDINGS",findings:[{grade:"CONFIRMED",file:"lib/mcp/tools.ts",line:1,scenario:"s",fix:"f"}]}),"review:regression:r3":()=>({lens:"regression",verdict:"FINDINGS",findings:[{grade:"CONFIRMED",file:"lib/mcp/tools.ts",line:1,scenario:"s",fix:"f"}]})});
  await run("ci-red",{"ops:ci":(p,n,ok)=>{const t=ok();t.outputs[n-1].tail="fail CI\npass guard";return t;}});
  await run("tripwire",{"gate:r1":()=>({verdict:"GO",gates:[],branch_seen:"main"})});
  await run("smoke-fail-revert",{"ops:smoke-1":(p,n,ok)=>ok(["status=500\nchallenged=0\nmarker=0","status=200\nchallenged=0\nmarker=1"]),"ops:smoke-2":(p,n,ok)=>ok(["status=500\nchallenged=0\nmarker=0","status=200\nchallenged=0\nmarker=1"])});
  await run("prod-already-red",{"ops:smoke-baseline":(p,n,ok)=>ok(["status=500\nchallenged=0\nmarker=0","x"]),"ops:smoke-1":(p,n,ok)=>ok(["status=500\nchallenged=0\nmarker=0","status=200\nmarker=1"]),"ops:smoke-2":(p,n,ok)=>ok(["status=500\nchallenged=0\nmarker=0","status=200\nmarker=1"])});
  await run("pick-blocked",{"pick":()=>({id:"S9",status_seen:"open",title:"t",slug:"s",kind:"bug-fix",reason:"r",files_guess:[],runner_up:""})});
  await run("registry-missing",{noRegistry:true});
  await run("resolved",{"verify:S44":()=>({verdict:"RESOLVED",evidence:"already pinned by x.test.ts",files:[],plan_steps:[],hard:false,feature_check:""})});
  await run("wrong-premise-twice",{"verify:S44":()=>({verdict:"WRONG_PREMISE",evidence:"nope",files:[],plan_steps:[],hard:false,feature_check:""}),"pick":(p)=>p.includes("S44,")||p.match(/in: .*S44/)?{id:"S2",status_seen:"open — note",title:"t",slug:"s",kind:"bug-fix",reason:"r",files_guess:[],runner_up:""}:{id:"S44",status_seen:"open",title:"t",slug:"s",kind:"test-gap",reason:"r",files_guess:[],runner_up:""},"verify:S2":()=>({verdict:"CANT_TELL",evidence:"needs prod",files:[],plan_steps:[],hard:false,feature_check:""})});
  console.log(failures?`\n${failures} scenario(s) FAILED`:"\nall scenarios passed"); process.exit(failures?1:0);
})().catch(e=>{console.error("HARNESS ERROR",e);process.exit(1)});
