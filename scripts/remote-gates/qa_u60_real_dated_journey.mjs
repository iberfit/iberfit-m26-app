/**
 * U71: one QA-only authenticated Coach -> Client A -> Coach dated training
 * rehearsal using synthetic QA identities, canonically linked appointments.
 * First attempt is strictly read-only, second rerun may write only if an
 * immutable run/sha/owner/session proof is <=2h. No PROD, no service role.
 * All operations carry deterministic IDs to diagnose partial ACK/retry.
 */
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {candidateList} from './qa_u60_dated_fixture_preflight.mjs';
import {expandQaClientCanonicalBodyEnvelope} from '../../src/m26/production-state.js';
import {buildAppointmentCommand,buildConfirmAppointmentCommand,santiagoAppointmentInstant} from '../../src/m26/workflows/agenda-workflow.js';
const QA='gjztkdwfmunnzhtvxrsu';
const BASE='https://'+QA+'.supabase.co';
const BRANCHES=new Set([
 'feat/u60-training360-r50-reconciled-20261104',
 'feat/iberfit-universal-360-one-release-20261106',
]);
const branchFromRef=ref=>{
 const prefix='refs/heads/';
 const branch=String(ref||'').startsWith(prefix)?String(ref).slice(prefix.length):'';
 assert(BRANCHES.has(branch),'BRANCH_NOT_ALLOWLISTED');
 return branch;
};
const REPO='iberfit/iberfit-m26-app';
const FILE='recovery/u71-qa-authenticated-workout/evidence.json';
const PREVIOUS='.tmp/u71-first/evidence.json';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
function assert(v,code){if(!v)throw Error('U71_'+code);}
export function derivedUuid(run,label){
 const h=hash(String(run)+':u71:'+String(label));
 return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);
}
export function chileanClock(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Santiago',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
  .formatToParts(now).filter(v=>v.type!=='literal').map(v=>[v.type,v.value]));
 const day=[parts.year,parts.month,parts.day].join('-');
 const minute=Number(parts.hour)*60+Number(parts.minute);
 return {day,minute};
}
export function dayOffset(day,n){
 const dt=new Date(day+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()+n);
 return dt.toISOString().slice(0,10);
}
export function sameClientCalendar(response,owner){
 return response.status===200&&response.body?.kind==='calendar'
  &&Array.isArray(response.body.occurrences)
  &&response.body.occurrences.every(o=>o.clientId===owner
    &&!/publishedSnapshot|requestHash|coachPrivateNote|prescriptionSnapshot/.test(JSON.stringify(o)));
}
export function denied(x){
 return [401,403,404].includes(x?.status)||
  (x?.status===200&&['rejected','conflict'].includes(x.body?.kind)
  &&/DENIED|FORBIDDEN|ACCESS|ROLE|OWNER|NOT_FOUND|NOT_ALLOWED/.test(x.body?.reason||''));
}
function context(mode){
 const e=process.env;
 for(const name of ['M26_QA_ONLY','M26_PROJECT_REF','M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD','M26_QA_CLIENT_A_EMAIL',
  'M26_QA_CLIENT_A_PASSWORD','M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
  'GITHUB_SHA','GITHUB_RUN_ID','GITHUB_REPOSITORY','GITHUB_REF','GITHUB_RUN_ATTEMPT','GH_TOKEN'])
   assert(e[name],'ENV_MISSING_'+name);
 assert(e.M26_QA_ONLY==='true'&&e.M26_PROJECT_REF===QA
  &&new URL(e.M26_SUPABASE_URL).origin===BASE,'NOT_QA');
 const branch=branchFromRef(e.GITHUB_REF);
 assert(e.GITHUB_REPOSITORY===REPO
  &&UUID.test(derivedUuid(e.GITHUB_RUN_ID,'check')),'INVALID_RUN_CONTEXT');
 assert(/^[a-f0-9]{40}$/.test(e.GITHUB_SHA),'INVALID_SHA');
 assert((mode==='preflight'&&e.GITHUB_RUN_ATTEMPT==='1')
   ||(mode==='apply'&&e.GITHUB_RUN_ATTEMPT==='2'),'NON_EXPLICIT_ATTEMPT');
 const key=e.M26_SUPABASE_PUBLISHABLE_KEY;
 assert(key.length>20&&!/service.?role|sb_secret/i.test(key),'PRIVILEGED_KEY_DENIED');
 return {e,key,branch};
}
async function currentSha(ctx){
 const res=await fetch('https://api.github.com/repos/'+REPO+'/git/ref/heads/'+
  encodeURIComponent(ctx.branch),{
  headers:{Authorization:'Bearer '+ctx.e.GH_TOKEN,Accept:'application/vnd.github+json'},
  signal:AbortSignal.timeout(10000)});
 assert(res.ok,'HEAD_READ_UNAVAILABLE');
 const x=await res.json();
 assert(x.object?.sha===ctx.e.GITHUB_SHA,'BRANCH_HEAD_MOVED');
}
async function http(ctx,path,body={},jwt=null,method='POST'){
 const u=new URL(path,BASE);
 assert(u.origin===BASE&&u.username===''&&u.password==='','HTTP_QA_TARGET');
 const headers={apikey:ctx.key,origin:'https://m26-canary.iberfit.cl'};
 if(jwt)headers.authorization='Bearer '+jwt;
 if(method==='POST')headers['content-type']='application/json';
 const res=await fetch(u,{method,headers,redirect:'error',signal:AbortSignal.timeout(18000),
  ...(method==='POST'?{body:JSON.stringify(body)}:{})});
 return {status:res.status,body:await res.json().catch(()=>null)};
}
async function login(ctx,email,password){
 const r=await http(ctx,'/auth/v1/token?grant_type=password',{email,password});
 assert(r.status===200&&typeof r.body?.access_token==='string','AUTHENTICATION');
 return {jwt:r.body.access_token,actor:r.body.user?.id};
}
const rpc=(ctx,jwt,name,params)=>http(ctx,'/rest/v1/rpc/'+name,params,jwt);
const u60=(ctx,jwt,action,payload)=>rpc(ctx,jwt,'iberfit_occurrence_api_u60_v1',{p_action:action,p_payload:payload});
async function value(ctx,jwt,name,params={}){
 const r=await rpc(ctx,jwt,name,params);
 assert(r.status===200,'IDENTITY_RPC_'+name.toUpperCase()+'_'+r.status);
 return r.body;
}
async function checkedCalendar(ctx,jwt,owner,start,end){
 const r=await u60(ctx,jwt,'CALENDARIO',{clientId:owner,startDate:start,endDate:end,limit:50});
 assert(sameClientCalendar(r,owner),'CALENDAR_SCOPE_HTTP_'+r.status);
 return r.body.occurrences;
}
async function save(proof){
 await mkdir('recovery/u71-qa-authenticated-workout',{recursive:true});
 await writeFile(FILE,JSON.stringify(proof,null,2)+'\n',{mode:0o600});
}
async function readbackAppointment(ctx,coachJwt,id,owner,sessionId,status){
 const path='/rest/v1/appointments?select=id,client_id,session_id,status,revision,start_at,end_at&id=eq.'+encodeURIComponent(id);
 const r=await http(ctx,path,{},coachJwt,'GET');
 assert(r.status===200&&Array.isArray(r.body)&&r.body.length===1,'APPOINTMENT_READBACK_HTTP_'+r.status);
 const row=r.body[0];
 assert(row.id===id&&row.client_id===owner&&row.session_id===sessionId
  &&row.status===status&&Number.isInteger(Number(row.revision)),'APPOINTMENT_SCOPE_DRIFT');
 return row;
}
async function canonical(ctx,coachJwt,command){
 const pre=await rpc(ctx,coachJwt,'iberfit_command_preflight_v26',{p_command:command});
 assert(pre.status===200&&pre.body?.kind==='ack','COACH_PREFLIGHT_NOT_ACK_'+pre.status);
 return pre.body;
}
async function authenticatedStage(ctx,certified=null){
 const e=ctx.e;
 const [coach,a,b]=await Promise.all([
  login(ctx,e.M26_QA_COACH_EMAIL,e.M26_QA_COACH_PASSWORD),
  login(ctx,e.M26_QA_CLIENT_A_EMAIL,e.M26_QA_CLIENT_A_PASSWORD),
  login(ctx,e.M26_QA_CLIENT_B_EMAIL,e.M26_QA_CLIENT_B_PASSWORD),
 ]);
 assert(new Set([coach.actor,a.actor,b.actor]).size===3,'ACTORS_NOT_SEPARATE');
 const [roleCoach,roleA,roleB,clientA,clientB,environment,raw]=await Promise.all([
  value(ctx,coach.jwt,'iberfit_current_role_v26'),
  value(ctx,a.jwt,'iberfit_current_role_v26'),
  value(ctx,b.jwt,'iberfit_current_role_v26'),
  value(ctx,a.jwt,'iberfit_client_id'),value(ctx,b.jwt,'iberfit_client_id'),
  value(ctx,a.jwt,'iberfit_environment'),
  value(ctx,a.jwt,'iberfit_bootstrap_v26'),
 ]);
 assert(roleCoach==='coach'&&['client','cliente'].includes(roleA)
  &&['client','cliente'].includes(roleB),'ROLE_MISMATCH');
 assert(UUID.test(clientA)&&UUID.test(clientB)&&clientA!==clientB,'CLIENT_OWNERS');
 assert(environment?.environment==='QA'&&environment.realDataAllowed===false
  &&environment.productionBlocked===true,'ENV_ISOLATION');
 const clock=chileanClock(),today=clock.day,future=dayOffset(today,7);
 const candidates=candidateList(expandQaClientCanonicalBodyEnvelope(raw),today)
  .filter(x=>x.clientId===clientA).sort((x,y)=>x.id.localeCompare(y.id));
 assert(candidates.length>0,'NO_SUITABLE_SYNTHETIC_PRESCRIPTION');
 // Each date must be a valid exact local instant (never DST guessed).
 const chosen=candidates[0],minute=certified
  ? Number(certified.localTime.slice(0,2))*60+Number(certified.localTime.slice(3,5))
  : Math.ceil((clock.minute+25)/5)*5;
 assert(Number.isInteger(minute)&&minute>=0&&minute<1440,'NO_SAFE_TODAY_APPOINTMENT_WINDOW');
 const hh=String(Math.floor(minute/60)).padStart(2,'0');
 const mm=String(minute%60).padStart(2,'0');
 const time=hh+':'+mm;
 const start1=santiagoAppointmentInstant(today+'T'+time);
 const start2=santiagoAppointmentInstant(future+'T'+time);
 const end1=new Date(Date.parse(start1)+chosen.duration*60000).toISOString();
 const end2=new Date(Date.parse(start2)+chosen.duration*60000).toISOString();
 assert(Date.parse(start1)>Date.now()&&Date.parse(start1)-Date.now()<3600000,'APPOINTMENT_CLOCK_DRIFT');
 const old=await checkedCalendar(ctx,coach.jwt,clientA,today,future);
 // A real QA portfolio legitimately contains prior dates from other plans.
 // Never erase them or require an empty calendar. Reserve only the TWO
 // intended dates for the chosen prescription, and never start if an
 // unrelated workout is already active for this Client.
 assert(!old.some(row=>row.status==='en_curso'),'QA_CLIENT_ACTIVE_EXECUTION');
 assert(!old.some(row=>row.sessionId===chosen.id&&
   [today,future].includes(row.localDate)),'QA_FIXTURE_SOURCE_DATES_NOT_CLEAN');
 const foreign=await u60(ctx,b.jwt,'CALENDARIO',{clientId:clientA,startDate:today,endDate:future,limit:2});
 assert(denied(foreign),'CROSS_CLIENT_SCOPE_BROKEN');
 const appointments=[{date:today,startAt:start1,endAt:end1},{date:future,startAt:start2,endAt:end2}];
 const commands=appointments.map((slot,i)=>{
  const base=buildAppointmentCommand({clientId:clientA,sessionId:chosen.id,
    title:'IBERFIT U71 QA synthetic verified',modality:'guiada_en_app',
    startAt:slot.startAt,endAt:slot.endAt},0);
  return {...base,entityId:derivedUuid(e.GITHUB_RUN_ID,'appointment-'+i),
    operationId:derivedUuid(e.GITHUB_RUN_ID,'appointment-create-'+i)};
 });
 for(const cmd of commands)await canonical(ctx,coach.jwt,cmd);
 const fingerprint=hash(clientA+':'+chosen.id+':'+chosen.revision+':'+today+':'+future+':'+time);
 return {ctx,coach,a,b,clientA,clientB,chosen,appointments,commands,today,future,time,fingerprint};
}
async function main(){
 const mode=process.argv[2];
 assert(['preflight','apply'].includes(mode),'STAGE_INVALID');
 const ctx=context(mode);await currentSha(ctx);
 // Read prior clock/date BEFORE any authenticated fetch; never pick a new slot
 // for attempt 2. If the certified slot is no longer future, fail without writes.
 const original=mode==='apply'?JSON.parse(await readFile(PREVIOUS,'utf8')):null;
 if(original){
  const age=Date.now()-Date.parse(original.createdAt);
  assert(original.schema==='iberfit.u71.qa-authenticated-dated-e2e.v1'
    &&original.stage==='preflight'&&original.status==='READY_FOR_EXPLICIT_RERUN'
    &&original.project==='QA'&&original.sha===ctx.e.GITHUB_SHA
    &&original.runId===ctx.e.GITHUB_RUN_ID
    &&/^\d{4}-\d{2}-\d{2}$/.test(original.localDate)
    &&/^\d{4}-\d{2}-\d{2}$/.test(original.futureDate)
    &&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(original.localTime)
    &&Number.isFinite(age)&&age>=0&&age<7200000,'PREFLIGHT_MISSING_STALE_OR_CHANGED');
 }
 const plan=await authenticatedStage(ctx,original);
 if(original)assert(original.localDate===plan.today
   &&original.futureDate===plan.future&&original.localTime===plan.time,
   'CERTIFIED_DATE_OR_TIME_CHANGED');
 const proof={schema:'iberfit.u71.qa-authenticated-dated-e2e.v1',stage:mode,
   project:'QA',sha:ctx.e.GITHUB_SHA,runId:ctx.e.GITHUB_RUN_ID,
   createdAt:new Date().toISOString(),fingerprint:plan.fingerprint,
   localDate:plan.today,futureDate:plan.future,localTime:plan.time,
   sourceFixture:'existing QA synthetic published prescription',
   realJwtForCoachAndTwoClients:true,prodTouched:false,serviceRole:false,
   writesApplied:false,checks:['identity_roles_scoped','canary_owner_A_B_distinct',
    'two_calendar_dates_free','native_appointment_preflights_ack','exact_daylight_santiago'],
   status:'PENDING'};
 if(mode==='preflight'){
  proof.status='READY_FOR_EXPLICIT_RERUN';
  await save(proof);
  process.stdout.write('IBERFIT_U71_QA_READ_ONLY_PREFLIGHT_READY\n');
  return;
 }
 const old=original;
 const age=Date.now()-Date.parse(old.createdAt);
 assert(old.schema===proof.schema&&old.stage==='preflight'
  &&old.status==='READY_FOR_EXPLICIT_RERUN'&&old.project==='QA'
  &&old.sha===proof.sha&&old.runId===proof.runId
  &&old.fingerprint===proof.fingerprint
  &&old.localDate===proof.localDate&&old.futureDate===proof.futureDate
  &&old.localTime===proof.localTime&&Number.isFinite(age)
  &&age>=0&&age<7200000,'PREFLIGHT_MISSING_STALE_OR_CHANGED');
 proof.status='QA_SYNTHETIC_WRITE_STARTED';await save(proof);
 const {coach,a,b,clientA,clientB,chosen,appointments,commands,today,future}=plan;
 // No broad grant, no DB table writes. These use the SAME production commands.
 for(let i=0;i<commands.length;i++){
  const cmd=commands[i],r=await rpc(ctx,coach.jwt,'iberfit_execute_command_v26',{p_command:cmd});
  assert(r.status===200&&r.body?.kind==='ack','APPOINTMENT_CREATE_ACK_'+i+'_'+r.status);
  proof.checks.push('appointment_created_'+i);await save(proof);
  const typed=await readbackAppointment(ctx,coach.jwt,cmd.entityId,clientA,chosen.id,'propuesta');
  const confirm={...buildConfirmAppointmentCommand({
   clientId:clientA,appointmentId:cmd.entityId},Number(typed.revision)),
   operationId:derivedUuid(ctx.e.GITHUB_RUN_ID,'appointment-confirm-'+i)};
  await canonical(ctx,coach.jwt,confirm);
  const res=await rpc(ctx,coach.jwt,'iberfit_execute_command_v26',{p_command:confirm});
  assert(res.status===200&&res.body?.kind==='ack','APPOINTMENT_CONFIRM_ACK_'+i+'_'+res.status);
  await readbackAppointment(ctx,coach.jwt,cmd.entityId,clientA,chosen.id,'confirmada');
  proof.checks.push('appointment_confirmed_'+i);await save(proof);
 }
 const batch={
  type:'OCURRENCIAS_CREAR_LOTE',
  operationId:derivedUuid(ctx.e.GITHUB_RUN_ID,'occurrence-batch'),
  clientId:clientA,entityId:chosen.id,baseRevision:chosen.revision,
  payload:{targetClientId:clientA,previewConfirmed:true,
   dates:appointments.map((x,i)=>({localDate:x.date,localTime:plan.time,
    appointmentId:commands[i].entityId}))},
 };
 const ack=await u60(ctx,coach.jwt,'CREAR_LOTE',batch);
 assert(ack.status===200&&ack.body?.kind==='ack'&&Number(ack.body.count)===2
   &&ack.body.occurrences?.length===2,'BATCH_NOT_ACK_'+ack.status);
 const occ=ack.body.occurrences.map(x=>x.id);
 assert(occ.every(x=>UUID.test(x))&&occ[0]!==occ[1],'OCCURRENCE_IDENTITIES');
 proof.checks.push('two_dates_persisted');await save(proof);
 const retry=await u60(ctx,coach.jwt,'CREAR_LOTE',batch);
 assert(retry.status===200&&retry.body?.kind==='ack'&&retry.body.duplicate===true,
   'BATCH_IDEMPOTENT_REPLAY');
 proof.checks.push('batch_idempotency');
 const before=await checkedCalendar(ctx,a.jwt,clientA,today,future);
 assert(!before.some(row=>occ.includes(row.id)),
   'UNCONFIRMED_DATE_VISIBLE_TO_CLIENT');
 for(let i=0;i<occ.length;i++){
  const command={type:'OCURRENCIA_CONFIRMAR',operationId:derivedUuid(ctx.e.GITHUB_RUN_ID,'occ-confirm-'+i),
   clientId:clientA,entityId:occ[i],baseRevision:0};
  const r=await u60(ctx,coach.jwt,'TRANSICION',command);
  assert(r.status===200&&r.body?.kind==='ack'&&r.body.status==='confirmada',
    'OCCURRENCE_CONFIRM_NOT_ACK_'+i+'_'+r.status);
  proof.checks.push('occurrence_confirmed_'+i);await save(proof);
 }
 const visible=await checkedCalendar(ctx,a.jwt,clientA,today,future);
 const ownVisible=visible.filter(row=>occ.includes(row.id));
 assert(ownVisible.length===2&&occ.every(id=>ownVisible.some(x=>x.id===id&&x.status==='confirmada')),
   'CLIENT_DATES_NOT_VISIBLE');
 proof.checks.push('client_two_independent_confirmed_dates');
 const forbidden=await u60(ctx,b.jwt,'CALENDARIO',{clientId:clientA,startDate:today,endDate:future,limit:10});
 assert(denied(forbidden),'CLIENT_B_OWNER_ISOLATION');
 const detail=await rpc(ctx,a.jwt,'iberfit_occurrence_detail_v1',{
  p_client_id:clientA,p_occurrence_id:occ[0]});
 assert(detail.status===200&&detail.body?.kind==='private-occurrence'
  &&detail.body?.occurrence?.id===occ[0]&&detail.body?.occurrence?.clientId===clientA
  &&Array.isArray(detail.body?.prescriptionSnapshot?.queue),'CLIENT_PRIVATE_DETAIL_INVALID');
 const foreignDetail=await rpc(ctx,b.jwt,'iberfit_occurrence_detail_v1',{
  p_client_id:clientA,p_occurrence_id:occ[0]});
 assert(denied(foreignDetail),'CLIENT_B_PRIVATE_DETAIL_EXPOSED');
 proof.checks.push('owner_scoped_private_detail_and_idor_denied');
 const executionId=derivedUuid(ctx.e.GITHUB_RUN_ID,'first-execution');
 const start={type:'OCURRENCIA_INICIAR',operationId:derivedUuid(ctx.e.GITHUB_RUN_ID,'occ-start'),
  clientId:clientA,entityId:occ[0],baseRevision:1,payload:{executionId}};
 const started=await u60(ctx,a.jwt,'TRANSICION',start);
 assert(started.status===200&&started.body?.kind==='ack'&&started.body?.status==='en_curso',
   'CLIENT_CANNOT_START_'+started.status);
 proof.checks.push('first_dated_execution_started');await save(proof);
 const startRetry=await u60(ctx,a.jwt,'TRANSICION',start);
 assert(startRetry.status===200&&startRetry.body?.kind==='ack'&&startRetry.body?.duplicate===true,
   'CLIENT_RETRY_STARTED_TWICE');
 const futureAttempt=await u60(ctx,a.jwt,'TRANSICION',{
  type:'OCURRENCIA_INICIAR',operationId:derivedUuid(ctx.e.GITHUB_RUN_ID,'future-start-rejection'),
  clientId:clientA,entityId:occ[1],baseRevision:1,
  payload:{executionId:derivedUuid(ctx.e.GITHUB_RUN_ID,'future-execution')}});
 assert(futureAttempt.status===200&&futureAttempt.body?.kind==='rejected'
  &&futureAttempt.body?.reason==='START_WINDOW_INVALID','FUTURE_DATE_STARTED');
 proof.checks.push('future_date_cannot_start_and_ack_idempotent');
 const block=detail.body.prescriptionSnapshot.blocks?.[0];
 const exerciseId=String(block?.exerciseId||'');
 assert(exerciseId.length>0&&Number.isInteger(chosen.sets)&&chosen.sets>0,'FIRST_EXERCISE_INVALID');
 const initial={[exerciseId+':1']:{reps:10,loadKg:20}};
 const progress=await u60(ctx,a.jwt,'TRANSICION',{
  type:'OCURRENCIA_GUARDAR_PROGRESO',operationId:derivedUuid(ctx.e.GITHUB_RUN_ID,'occ-progress'),
  clientId:clientA,entityId:occ[0],baseRevision:2,
  payload:{executionId,executionBaseRevision:1,results:initial,skippedSets:{}}});
 assert(progress.status===200&&progress.body?.kind==='ack'&&
  Number(progress.body.executionRevision)===2,'CLIENT_SET_PROGRESS_NOT_SAVED');
 proof.checks.push('saved_first_set_real_server');await save(proof);
 const all={...initial};
 for(let i=2;i<=chosen.sets;i++)all[exerciseId+':'+i]={reps:8,loadKg:22};
 const done=await u60(ctx,a.jwt,'TRANSICION',{
  type:'OCURRENCIA_COMPLETAR',operationId:derivedUuid(ctx.e.GITHUB_RUN_ID,'occ-finish'),
  clientId:clientA,entityId:occ[0],baseRevision:2,
  payload:{executionId,executionBaseRevision:2,results:all,skippedSets:{},
   feedback:{sessionRpe:7,comment:'U71 QA synthetic training',pain:false}}});
 assert(done.status===200&&done.body?.kind==='ack'&&done.body.status==='completada',
   'CLIENT_DATED_EXECUTION_NOT_COMPLETED');
 proof.checks.push('first_execution_completed_and_confirmed');await save(proof);
 const coachCalendar=await checkedCalendar(ctx,coach.jwt,clientA,today,future);
 const ownCoachDates=coachCalendar.filter(row=>occ.includes(row.id));
 assert(ownCoachDates.length===2
  &&ownCoachDates.some(x=>x.id===occ[0]&&x.status==='completada')
  &&ownCoachDates.some(x=>x.id===occ[1]&&x.status==='confirmada'),
    'COACH_READBACK_NOT_INDEPENDENT');
 const coachDetail=await rpc(ctx,coach.jwt,'iberfit_occurrence_detail_v1',{
  p_client_id:clientA,p_occurrence_id:occ[0]});
 assert(coachDetail.status===200&&coachDetail.body?.executionBody?.status==='completada'
  &&coachDetail.body?.executionBody?.occurrenceId===occ[0],
    'COACH_EXECUTION_DETAIL_NOT_COMMITTED');
 proof.checks.push('coach_verifies_completed_execution_future_untouched');
 proof.status='QA_HOSTED_AUTHENTICATED_E2E_SUCCESS';proof.writesApplied=true;
 await save(proof);
 process.stdout.write('IBERFIT_U71_QA_HOSTED_COACH_CLIENT_COACH_DATED_E2E_PASS\n');
}
if(process.argv[1]?.endsWith('/qa_u60_real_dated_journey.mjs')){
 main().catch(error=>{
  process.stderr.write('IBERFIT_U71_FAIL_CLOSED:'+String(error?.message||'UNKNOWN').replace(/[^A-Za-z0-9_:]/g,'').slice(0,130)+'\n');
  process.exitCode=1;
 });
}
