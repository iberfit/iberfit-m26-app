import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {derivedUuid,chileanClock,dayOffset,sameClientCalendar,firstAvailableDatedCandidate,selectCertifiedDatedCandidate,denied,isFutureIssuedJwtClockSkew,boundedReadOnlyJwtClockSkewRecovery,boundedHostedAuth522Recovery,validatedDatedCandidates,chooseUnoccupiedDatedSlot,u71PlanningDays,authorizedAutonomousQaBranch} from '../scripts/remote-gates/qa_u60_real_dated_journey.mjs';
test('U71 deterministic per-run QA operation IDs avoid duplicate writes',()=>{
 const a=derivedUuid('41900000','appointment-create-0');
 assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(a,derivedUuid('41900000','appointment-create-0'));
 assert.notEqual(a,derivedUuid('41900000','appointment-create-1'));
 assert.notEqual(a,derivedUuid('41900001','appointment-create-0'));
});
test('U71 date math is day-based and Santiago timezone is explicit',()=>{
 assert.equal(dayOffset('2026-11-04',7),'2026-11-11');
 assert.equal(dayOffset('2026-12-30',7),'2027-01-06');
 const today=chileanClock(new Date('2026-11-05T01:00:00.000Z'));
 assert.equal(today.day,'2026-11-04');
});
test('U71 calendar shape denies foreign private content and wrong client scope',()=>{
 const valid={status:200,body:{kind:'calendar',count:1,hasMore:false,occurrences:[{clientId:'client-a',id:'one',status:'confirmada'}]}};
 assert.equal(sameClientCalendar(valid,'client-a'),true);
 assert.equal(sameClientCalendar(valid,'client-b'),false);
 assert.equal(sameClientCalendar({...valid,body:{kind:'calendar',occurrences:[{clientId:'client-a',publishedSnapshot:{}}]}},'client-a'),false);
 assert.equal(sameClientCalendar({status:403,body:valid.body},'client-a'),false);
 assert.equal(sameClientCalendar({status:200,body:{...valid.body,count:2}},'client-a'),false);
 assert.equal(sameClientCalendar({status:200,body:{...valid.body,hasMore:true}},'client-a'),false);
 assert.equal(sameClientCalendar({status:200,body:{...valid.body,count:null}},'client-a'),false);
});
test('U71 denial never mistakes HTTP success for forbidden',()=>{
 for(const s of [200,201,202,429,500])assert.equal(denied({status:s,body:{kind:'calendar'}}),false);
 for(const s of [401,403,404])assert.equal(denied({status:s,body:{}}),true);
 assert.equal(denied({status:200,body:{kind:'rejected',reason:'CLIENT_ACCESS_DENIED'}}),true);
});
test('U71 stage-2 reuses immutable originally certified Santiago time and same-day slot',()=>{
 const s=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 assert.match(s,/const original=\['apply','prepare-browser'\]\.includes\(mode\)/);
 assert.match(s,/async function authenticatedStage\(ctx,certified=null\)/);
 assert.match(s,/fixedTime:certified\?\.localTime/);
 assert.match(s,/original\.localTime===plan\.time/);
 assert.match(s,/old\.localTime===proof\.localTime/);
 assert.match(s,/U71_QA_NO_CONFLICT_FREE_SLOT/);
});
test('U71 only QA origin, ordinary JWT, native commands, two-phase write gate',()=>{
 const s=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 assert.match(s,/M26_QA_ONLY/);assert.match(s,/gjztkdwfmunnzhtvxrsu/);
 assert.doesNotMatch(s,/pjhmrhejsoofmouedavw|SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(s,/buildAppointmentCommand/);assert.match(s,/buildConfirmAppointmentCommand/);
 assert.match(s,/old\.stage===\(mode==='prepare-browser'\?'preflight-browser':'preflight'\)/);
 assert.match(s,/old\.sha===proof\.sha/);
 assert.match(s,/old\.runId===proof\.runId/);
 assert.match(s,/old\.fingerprint===proof\.fingerprint/);
 assert.match(s,/GITHUB_RUN_ATTEMPT==='2'/);
 assert.match(s,/COACH_EXECUTION_DETAIL_NOT_COMMITTED/);
 assert.match(s,/branchFromRef\(e\.GITHUB_REF\)/);
 assert.match(s,/BRANCH_NOT_ALLOWLISTED/);
 assert.match(s,/feat\/real-training-360-one-release-20261117/u);
 assert.match(s,/feat\/iberfit-universal-360-one-release-20261106/);
 const wf=readFileSync(new URL('../.github/workflows/u71-qa-real-dated-e2e.yml',import.meta.url),'utf8');
 assert.match(wf,/feat\/iberfit-universal-360-one-release-20261106/);
 assert.match(wf,/github\.run_attempt == 1/);
 assert.match(wf,/github\.run_attempt == 2/);
});

test('U71 future dated appointment is rejected by start window, not un-timed date guard',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261025194000_signature_u31_private_occurrence_executor_v1.sql',import.meta.url),'utf8');
 const js=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 assert.match(sql,/v_occ\.starts_at IS NOT NULL AND \(/);
 assert.match(sql,/'START_WINDOW_INVALID'/);
 assert.match(js,/futureAttempt\.body\?\.reason==='START_WINDOW_INVALID'/);
});

test('UNIVERSAL U71 QA preserves unrelated prior appointments and dates during two-date proof',()=>{
 const s=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/assert\(old\.length===0/);
 assert.doesNotMatch(s,/assert\(visible\.length===2/);
 assert.doesNotMatch(s,/assert\(coachCalendar\.length===2/);
 assert.match(s,/QA_FIXTURE_SOURCE_DATES_NOT_CLEAN/);
 assert.match(s,/QA_CLIENT_ACTIVE_EXECUTION/);
 assert.match(s,/before\.some\(row=>occ\.includes\(row\.id\)\)/);
 assert.match(s,/const ownVisible=visible\.filter\(row=>occ\.includes\(row\.id\)\)/);
 assert.match(s,/const ownCoachDates=coachCalendar\.filter\(row=>occ\.includes\(row\.id\)\)/);
});

test('UNIVERSAL U71 protected Canary only enables existing two-phase signed QA proof',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/u71-qa-real-dated-e2e.yml',import.meta.url),'utf8');
 const source=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 assert.match(workflow,/^\s+- 'canary\/rc74-4'$/mu);
 assert.match(source,/'canary\/rc74-4'/u);
 assert.doesNotMatch(workflow,/audit\/free-static-ux-zap-20261108/u);
 assert.match(workflow,/github\.run_attempt == 1/u);
 assert.match(workflow,/github\.run_attempt == 2/u);
 assert.match(workflow,/environment: m26-canary-readonly/u);
 assert.match(source,/BRANCH_HEAD_MOVED/u);
 assert.match(source,/QA_FIXTURE_SOURCE_DATES_NOT_CLEAN/u);
 assert.match(source,/ENV_ISOLATION/u);
 assert.match(source,/BRANCH_NOT_ALLOWLISTED/u);
 assert.match(source,/NON_EXPLICIT_ATTEMPT/u);
 assert.doesNotMatch(workflow,/IBERFIT_PROD_DATABASE_URL|SERVICE_ROLE_KEY/u);
});

test('U71 chooses an unoccupied synthetic prescription rather than resetting prior dated training',()=>{
 const now='2026-11-10',future='2026-11-17';
 const ids=Array.from({length:3},(_,i)=>'10000000-0000-4000-8000-0000000000'+String(i+10));
 const candidates=ids.map(id=>({id,duration:45}));
 const calendar=[{sessionId:ids[0],localDate:now,status:'completada'},{sessionId:ids[0],localDate:future,status:'confirmada'}];
 const before=structuredClone({candidates,calendar});
 const winner=firstAvailableDatedCandidate(candidates,calendar,now,future);
 assert.equal(winner.id,ids[1]);
 assert.deepEqual({candidates,calendar},before,'selection is read-only and does not delete prior dates');
 assert.equal(firstAvailableDatedCandidate(candidates,[...calendar,{sessionId:ids[1],localDate:now}],now,future).id,ids[2]);
 assert.equal(firstAvailableDatedCandidate(candidates,[...calendar,{sessionId:ids[1],localDate:now},{sessionId:ids[2],localDate:future}],now,future),null);
 assert.equal(firstAvailableDatedCandidate(candidates,[{sessionId:ids[0],localDate:'2026-11-01'}],now,future).id,ids[0]);
 assert.throws(()=>firstAvailableDatedCandidate(candidates,[{sessionId:null,localDate:now}],now,future),/U71_CANDIDATE_CALENDAR_INVALID/);
 assert.throws(()=>firstAvailableDatedCandidate(candidates,calendar,now,now),/U71_CANDIDATE_READ_INVALID/);
});
test('U71 exact branch preflight is allowlisted but never writes on first attempt',()=>{
 const script=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/u71-qa-real-dated-e2e.yml',import.meta.url),'utf8');
 assert.match(script,/feat\/coach-a-verified-evidence-20261111/u);
 assert.match(workflow,/feat\/coach-a-verified-evidence-20261111/u);
 assert.match(workflow,/github\.run_attempt == 1/u);
 assert.match(workflow,/github\.run_attempt == 2/u);
 assert.match(script,/selectCertifiedDatedCandidate\(candidates,old,today,future,certified\)/u);
 assert.match(script,/old\.sha===proof\.sha/u);
 assert.match(script,/old\.fingerprint===proof\.fingerprint/u);
 assert.doesNotMatch(workflow,/IBERFIT_PROD_DATABASE_URL|SERVICE_ROLE_KEY/u);
});

test('the single launch branch uses signed two-step QA evidence and never PROD credentials',()=>{
  const script=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/u71-qa-real-dated-e2e.yml',import.meta.url),'utf8');
  for(const src of [script,workflow])assert.ok(src.includes('feat/iberfit-universal-launch-360-20261112'));
  assert.match(script,/GITHUB_RUN_ATTEMPT==='2'/u);
  assert.match(script,/BRANCH_HEAD_MOVED/u);
  assert.match(workflow,/github\.run_attempt == 1/u);
  assert.match(workflow,/github\.run_attempt == 2/u);
  assert.match(workflow,/environment: m26-canary-readonly/u);
  assert.doesNotMatch(workflow,/IBERFIT_PROD_DATABASE_URL|SERVICE_ROLE_KEY/u);
});

test('U71 handles only provider PGRST303 newly minted JWT skew with one bounded read-only retry',async()=>{
 const skew={status:401,body:{code:'PGRST303',message:'JWT issued at future'}};
 assert.equal(isFutureIssuedJwtClockSkew(skew),true);
 let attempts=0,pauses=0;
 const got=await boundedReadOnlyJwtClockSkewRecovery(
  async()=>++attempts===1?skew:{status:200,body:'coach'},
  async()=>{pauses++}
 );
 assert.deepEqual(got,{status:200,body:'coach'});
 assert.equal(attempts,2);
 assert.equal(pauses,1);
});
test('U71 never retries invalid audience, expired token, forbidden role, network/server fault, or a second 401',async()=>{
 const cases=[
  {status:401,body:{code:'PGRST303',message:'JWT expired'}},
  {status:401,body:{code:'PGRST303',message:'JWT audience claim failed'}},
  {status:401,body:{code:'PGRST301',message:'JWT issued at future'}},
  {status:403,body:{code:'PGRST303',message:'JWT issued at future'}},
  {status:500,body:{code:'PGRST303',message:'JWT issued at future'}},
  {status:200,body:'coach'},
 ];
 for(const given of cases){
  assert.equal(isFutureIssuedJwtClockSkew(given),false);
  let attempts=0,pauses=0;
  const result=await boundedReadOnlyJwtClockSkewRecovery(
   async()=>{attempts++;return given;},async()=>{pauses++}
  );
  assert.equal(result,given);
  assert.equal(attempts,1);
  assert.equal(pauses,0);
 }
 let attempts=0,pauses=0;
 const stillSkew={status:401,body:{code:'PGRST303',message:'JWT issued at future'}};
 const result=await boundedReadOnlyJwtClockSkewRecovery(
  async()=>{attempts++;return stillSkew;},async()=>{pauses++}
 );
 assert.equal(result,stillSkew);
 assert.equal(attempts,2);
 assert.equal(pauses,1);
});
test('M1 U71 recovers once from Hosted Auth 522 but never from credential or quota denials',async()=>{
 let n=0,pauses=0;
 const ok=await boundedHostedAuth522Recovery(async()=>++n===1?{status:522}:{status:200},async()=>{pauses++});
 assert.equal(ok.status,200);assert.equal(n,2);assert.equal(pauses,1);
 n=0;pauses=0;
 const persistent=await boundedHostedAuth522Recovery(async()=>{n++;return {status:522};},async()=>{pauses++});
 assert.equal(persistent.status,522);assert.equal(n,2);assert.equal(pauses,1);
 for(const status of [200,400,401,403,429,500,502,503,504]){
  n=0;pauses=0;
  const x=await boundedHostedAuth522Recovery(async()=>{n++;return {status};},async()=>{pauses++});
  assert.equal(x.status,status);assert.equal(n,1);assert.equal(pauses,0);
 }
});
test('M1 U71 serializes Hosted Auth in both QA stages without weakening identity assertions',()=>{
 const s=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 const stages=[s.slice(s.indexOf('async function authenticatedStage('),s.indexOf('async function verifyBrowserWorkout(')),s.slice(s.indexOf('async function verifyBrowserWorkout('),s.indexOf('async function main()'))];
 for(const b of stages){
  assert.equal(b.includes('const [coach,a,b]=await Promise.all(['),false);
  assert.ok(b.includes('const coach=await login('));
  assert.ok(b.includes('const a=await login('));
  assert.ok(b.includes('const b=await login('));
 }
 assert.ok(s.includes('AUTHENTICATION_HTTP_'));
 assert.ok(s.includes('ACTORS_NOT_SEPARATE'));
 assert.ok(s.includes('UI_PROOF_OWNER_DRIFT'));
});

test('U71 skew recovery is restricted to read-only identity and cannot reissue writes',()=>{
 const source=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 const first=source.indexOf('async function value(ctx,jwt,name');
 const last=source.indexOf('async function checkedCalendar(ctx,jwt',first);
 const section=source.slice(first,last);
 assert.match(section,/READ_ONLY_IDENTITY_RPCS\.has\(name\)/u);
 assert.match(section,/boundedReadOnlyJwtClockSkewRecovery\(\(\)=>rpc\(ctx,jwt,name,params\)\)/u);
 for(const forbidden of ['iberfit_execute_command_v26','iberfit_occurrence_api_u60_v1']){
  assert.doesNotMatch(source.slice(source.indexOf('const READ_ONLY_IDENTITY_RPCS=new Set('),first),new RegExp(forbidden));
 }
 const write=source.slice(source.indexOf("proof.status='QA_SYNTHETIC_WRITE_STARTED'"));
 assert.doesNotMatch(write,/boundedReadOnlyJwtClockSkewRecovery/u);
 assert.match(source,/GITHUB_RUN_ATTEMPT==='2'/u);
});


test('U71 avoids full Client historical bootstrap while keeping real QA owner, session and grant checks',()=>{
 const gate=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../qa/sql/20261112_u71_authenticated_bounded_candidate_read_qa_v1.sql',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/u71-qa-real-dated-e2e.yml',import.meta.url),'utf8');
 assert.match(gate,/value\(ctx,a\.jwt,'iberfit_u71_dated_candidates_qa_v1'\)/u);
 assert.doesNotMatch(gate,/value\(ctx,a\.jwt,'iberfit_bootstrap_v26'\)/u);
 assert.match(gate,/CANDIDATE_CROSS_CLIENT_EXPOSED/u);
 assert.match(gate,/validatedDatedCandidates\(raw,clientA,candidateDay\)/u);
 assert.match(sql,/SECURITY DEFINER/u);
 assert.match(sql,/SET search_path TO ''/u);
 assert.match(sql,/auth\.uid\(\)/u);
 assert.match(sql,/iberfit_current_role_v26\(\) <> 'cliente'/u);
 assert.match(sql,/iberfit_client_id\(\)/u);
 assert.match(sql,/iberfit_can_access_client_v26\(v_owner\)/u);
 assert.match(sql,/IS DISTINCT FROM 'QA'/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION [\s\S]*?FROM PUBLIC,anon,authenticated/u);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION [\s\S]*?TO authenticated/u);
 assert.doesNotMatch(sql,/INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE|DROP TABLE|service_role/u);
 assert.match(workflow,/feat\/iberfit-m1-training-reliability-20261112/u);
});
test('U71 bounded QA candidate reader accepts only current-day owner-scoped source, never raw training bodies',()=>{
 const owner=derivedUuid('qa-owner','A');
 const session=derivedUuid('qa-source','S');
 const cycle=derivedUuid('qa-source','C');
 const item={id:session,clientId:owner,revision:3,duration:45,cycleId:cycle,sets:2};
 const payload={schema:'iberfit.u71.qa.dated-candidates.v1',
  project:'QA',day:'2026-11-12',clientId:owner,count:1,candidates:[item]};
 assert.deepEqual(validatedDatedCandidates(payload,owner,payload.day),[item]);
 const invalid=[
  {...payload,project:'PROD'},
  {...payload,day:'2026-11-11'},
  {...payload,clientId:derivedUuid('other','client')},
  {...payload,count:2},
  {...payload,candidates:[item,item],count:2},
  {...payload,candidates:[{...item,clientId:derivedUuid('other','owner')}]},
  {...payload,candidates:[{...item,publishedSnapshot:{}}]},
  {...payload,candidates:[{...item,history:[]}]},
  {...payload,candidates:[{...item,sets:16}]},
  {...payload,candidates:[{...item,revision:0}]},
  {...payload,candidates:[{...item,duration:241}]},
  {...payload,candidates:[{...item,id:'not-a-uuid'}]},
  {...payload,token:'forbidden'},
  {...payload,candidates:Array.from({length:51},(_,i)=>({
    ...item,id:derivedUuid('overlimit',String(i))
  })),count:51}
 ];
 for(const bad of invalid){
  assert.throws(()=>validatedDatedCandidates(bad,owner,payload.day),
   /U71_BOUNDED_CANDIDATE_(RESPONSE|SCOPE)_INVALID/u);
 }
});

test('M1 U72 real QA Coach-Client-Coach HTTP proof includes durable pause/resume, denial and idempotency',()=>{
 const gate=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 const wf=readFileSync(new URL('../.github/workflows/u71-qa-real-dated-e2e.yml',import.meta.url),'utf8');
 for(const expected of [
  "type:'OCURRENCIA_PAUSAR'","type:'OCURRENCIA_REANUDAR'",
  'U72_PAUSE_NOT_CONFIRMED','U72_PAUSED_PRIVATE_READ_NOT_DURABLE',
  'U72_PAUSE_REPLAY_NOT_IDEMPOTENT','U72_PAUSED_WRITE_NOT_DENIED',
  'U72_CROSS_CLIENT_RESUME_NOT_DENIED','U72_RESUME_NOT_CONFIRMED',
  'U72_RESUMED_PRIVATE_READ_NOT_DURABLE',
  'executionBaseRevision:4,results:all'
 ])assert.ok(gate.includes(expected),expected);
 assert.match(gate,/GITHUB_RUN_ATTEMPT==='2'/u);
 assert.match(gate,/PREFLIGHT_MISSING_STALE_OR_CHANGED/u);
 assert.match(wf,/github\.run_attempt == 1/u);
 assert.match(wf,/github\.run_attempt == 2/u);
 assert.doesNotMatch(wf,/IBERFIT_PROD_DATABASE_URL|SERVICE_ROLE_KEY/u);
});

test('U71 QA protects the two-phase appointment schedule from old completed time collisions',async()=>{
 const {chooseUnoccupiedDatedSlot}=await import('../scripts/remote-gates/qa_u60_real_dated_journey.mjs');
 const {santiagoAppointmentInstant}=await import('../src/m26/workflows/agenda-workflow.js');
 const today='2026-11-12',future='2026-11-19';
 const base=Date.parse(santiagoAppointmentInstant('2026-11-12T20:00'));
 const start=santiagoAppointmentInstant('2026-11-12T20:25');
 const end=new Date(Date.parse(start)+20*60000).toISOString();
 const rows=[{status:'completada',startsAt:start,endsAt:end}];
 const picked=chooseUnoccupiedDatedSlot({today,future,duration:20,
  clockMinute:1200,calendar:rows,nowMs:base});
 assert.equal(picked.time,'20:45');
 assert.equal(picked.start1,end);
 assert.throws(()=>chooseUnoccupiedDatedSlot({today,future,duration:20,
  clockMinute:1200,calendar:rows,fixedTime:'20:25',nowMs:base}),
  /U71_QA_NO_CONFLICT_FREE_SLOT/);
 assert.throws(()=>chooseUnoccupiedDatedSlot({today,future,duration:20,
  clockMinute:1200,calendar:[{status:'confirmada',startsAt:'2026-11-12T23:25:00Z',endsAt:null}],
  nowMs:base}),/U71_QA_CALENDAR_INCOMPLETE_FOR_SLOT/);
 const code=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 assert.ok(code.indexOf('const old=await checkedCalendar(')<
  code.lastIndexOf('chooseUnoccupiedDatedSlot({'));
 assert.ok(code.includes('fixedTime:certified?.localTime'));
});

test('REAL TRAINING 360 current feature branch can run bounded U71 preflight without granting PROD access',()=>{
 const script=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/u71-qa-real-dated-e2e.yml',import.meta.url),'utf8');
 const branch='feat/iberfit-real-training-360-20261114';
 assert.ok(script.includes("'"+branch+"'"));
 assert.ok(workflow.includes("- '"+branch+"'"));
 assert.match(workflow,/if: \$\{\{ github\.run_attempt == 1 \}\}/u);
 assert.match(workflow,/if: \$\{\{ github\.run_attempt == 2 \}\}/u);
 assert.match(script,/U31_START_SERVER_CLOCK_MISSING/u);
 assert.match(script,/U31_START_CLOCK_PRIVATE_READ_DRIFT/u);
 assert.match(script,/Date\.parse\(String\(startedDetail\.body\?\.executionBody\?\.startedAt/u);
 assert.match(script,/old\.runId===proof\.runId/u);
 assert.doesNotMatch(workflow,/IBERFIT_PROD_DATABASE_URL|SERVICE_ROLE_KEY/u);
 assert.doesNotMatch(script,/pjhmrhejsoofmouedavw|SUPABASE_SERVICE_ROLE_KEY/u);
});

test('U71 23:51 Santiago moves to next-day 00:20 without weakening 25-55 minutes',()=>{
 const at=Date.parse('2026-11-16T02:51:00Z');
 const c=chileanClock(new Date(at));
 const d=u71PlanningDays(c);
 assert.deepEqual(d,{candidateDay:'2026-11-15',today:'2026-11-16',
  future:'2026-11-23',rollover:true});
 const slot=chooseUnoccupiedDatedSlot({today:d.today,future:d.future,clockDay:c.day,
  clockMinute:c.minute,calendar:[],duration:45,nowMs:at});
 assert.equal(slot.time,'00:20');
 assert.equal(Date.parse(slot.start1)-at,29*60_000);
 const replay=chooseUnoccupiedDatedSlot({today:d.today,future:d.future,clockDay:d.today,
  clockMinute:2,calendar:[],duration:45,fixedTime:slot.time,
  nowMs:Date.parse('2026-11-16T03:02:00Z')});
 assert.equal(replay.start1,slot.start1);
 assert.throws(()=>chooseUnoccupiedDatedSlot({today:d.today,future:d.future,clockDay:d.today,
  clockMinute:21,calendar:[],duration:45,fixedTime:slot.time,
  nowMs:Date.parse('2026-11-16T03:21:00Z')}),/U71_QA_NO_CONFLICT_FREE_SLOT/);
});
test('U71 daytime and restricted day gap still enforce the existing window',()=>{
 const d=u71PlanningDays({day:'2026-11-16',minute:600});
 assert.equal(d.rollover,false);
 assert.equal(d.today,d.candidateDay);
 assert.throws(()=>chooseUnoccupiedDatedSlot({today:'2026-11-20',future:'2026-11-27',
  clockDay:d.today,clockMinute:600,calendar:[],duration:45,
  nowMs:Date.parse('2026-11-16T13:00:00Z')}),/U71_QA_SLOT_INPUT_INVALID/);
});

test('U74 exact preflight candidate survives unrelated QA source additions',()=>{
 const ids=['10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000012'];
 const candidates=[{id:ids[0],revision:3},{id:ids[1],revision:4}];
 const today='2026-11-17',future='2026-11-24';
 const certified={candidateId:ids[1],candidateRevision:4};
 assert.equal(selectCertifiedDatedCandidate(candidates,[],today,future,certified).id,ids[1]);
 assert.equal(selectCertifiedDatedCandidate([{id:'10000000-0000-4000-8000-000000000010',revision:1},...candidates],[],today,future,certified).id,ids[1]);
 assert.throws(()=>selectCertifiedDatedCandidate([{id:ids[1],revision:5}],[],today,future,certified),/CERTIFIED_SOURCE_REVISION_CHANGED/);
 assert.throws(()=>selectCertifiedDatedCandidate(candidates,[{sessionId:ids[1],localDate:today}],today,future,certified),/CERTIFIED_SOURCE_DATES_OCCUPIED/);
 assert.throws(()=>selectCertifiedDatedCandidate(candidates,[],today,future,{candidateId:ids[0],candidateRevision:0}),/CERTIFIED_SOURCE_INVALID/);
 assert.equal(selectCertifiedDatedCandidate(candidates,[],today,future,null).id,ids[0]);
});


test('U71 protected QA legacy workflow supplies explicit false autonomous mode to signed runner',()=>{
 const source=readFileSync(new URL('../.github/workflows/u71-qa-real-dated-e2e.yml',import.meta.url),'utf8');
 const runner=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 assert.match(source,/M26_QA_U74_AUTONOMOUS_NO_APPOINTMENT:\s*'false'/u);
 assert.match(runner,/MODE_EXPLICIT_REQUIRED/u);
 assert.match(runner,/AUTONOMOUS_BRANCH_DENIED/u);
 assert.match(source,/github\.run_attempt == 1/u);
 assert.match(source,/github\.run_attempt == 2/u);
 assert.doesNotMatch(source,/workflow_dispatch|SUPABASE_SERVICE_ROLE_KEY|pjhmrhejsoofmouedavw/u);
});

// M1: merged Canary must be able to certify appointmentless training on its
// exact source SHA. Legacy U71 and non-push contexts stay explicitly excluded.
test('M1 appointmentless U74 QA is signed on Canary, never on U71 or PR dispatch',()=>{
 const verified={GITHUB_WORKFLOW:'IBERFIT U74 Real QA Dated Browser Write E2E',GITHUB_EVENT_NAME:'push'};
 assert.equal(authorizedAutonomousQaBranch(verified,'canary/rc74-4'),true);
 assert.equal(authorizedAutonomousQaBranch(verified,'feat/m26-autonomous-dates-m44-one-prod-release-20261121'),true);
 assert.equal(authorizedAutonomousQaBranch(verified,'feat/iberfit-real-training-360-20261114'),false);
 assert.equal(authorizedAutonomousQaBranch(verified,'release/prod-9536dfad2cbc'),false);
 assert.equal(authorizedAutonomousQaBranch({...verified,GITHUB_WORKFLOW:'IBERFIT U71 Real QA Coach Client Coach Dated E2E'},'canary/rc74-4'),false);
 assert.equal(authorizedAutonomousQaBranch({...verified,GITHUB_EVENT_NAME:'pull_request'},'canary/rc74-4'),false);
 assert.equal(authorizedAutonomousQaBranch({...verified,GITHUB_EVENT_NAME:'workflow_dispatch'},'canary/rc74-4'),false);
 assert.equal(authorizedAutonomousQaBranch({},'canary/rc74-4'),false);
});
