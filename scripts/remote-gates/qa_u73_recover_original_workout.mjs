/**
 * U73 QA ONLY: complete the precisely identified synthetic run 41948759556
 * after U71 positive hosted start. Prevent duplicate dates or appointments:
 * this recovery cannot create, delete, reschedule or change another run.
 * Phase 1 read-only; phase 2 exact-SHA explicit rerun, scoped JWT only.
 */
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {derivedUuid} from './qa_u60_real_dated_journey.mjs';
const QA='gjztkdwfmunnzhtvxrsu',BASE='https://'+QA+'.supabase.co';
const SOURCE_RUN='41948759556';
const REPO='iberfit/iberfit-m26-app',BRANCH='feat/u60-training360-r50-reconciled-20261104';
const DAY='2026-11-04',FUTURE='2026-11-11';
const PATH='recovery/u73-qa-recover/evidence.json';
const PREV='.tmp/u73-first/evidence.json';
const hash=x=>createHash('sha256').update(String(x)).digest('hex');
function check(v,msg){if(!v)throw Error('U73_'+msg);}
function settings(mode){
 const e=process.env;
 for(const field of ['GITHUB_SHA','GITHUB_REF','GITHUB_REPOSITORY','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GH_TOKEN',
  'M26_QA_ONLY','M26_PROJECT_REF','M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD','M26_QA_CLIENT_A_EMAIL',
  'M26_QA_CLIENT_A_PASSWORD','M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD'])
  check(e[field],'ENV_MISSING_'+field);
 check(e.M26_PROJECT_REF===QA&&e.M26_QA_ONLY==='true'
  &&new URL(e.M26_SUPABASE_URL).origin===BASE,'QA_ONLY');
 check(e.GITHUB_REF==='refs/heads/'+BRANCH&&e.GITHUB_REPOSITORY===REPO
  &&/^[0-9a-f]{40}$/.test(e.GITHUB_SHA),'WRONG_SOURCE');
 check((mode==='preflight'&&e.GITHUB_RUN_ATTEMPT==='1')
   ||(mode==='apply'&&e.GITHUB_RUN_ATTEMPT==='2'),'UNAUTHORIZED_ATTEMPT');
 const key=e.M26_SUPABASE_PUBLISHABLE_KEY;
 check(key.length>20&&!/service.?role|sb_secret/i.test(key),'FORBIDDEN_KEY');
 return {e,key};
}
async function currentHead(ctx){
 const r=await fetch('https://api.github.com/repos/'+REPO+'/git/ref/heads/'+BRANCH,{
  headers:{Authorization:'Bearer '+ctx.e.GH_TOKEN,Accept:'application/vnd.github+json'},
  signal:AbortSignal.timeout(12000)});
 check(r.ok,'GITHUB_HEAD_UNAVAILABLE');
 const v=await r.json();
 check(v.object?.sha===ctx.e.GITHUB_SHA,'BRANCH_MOVED');
}
async function request(ctx,path,body={},token=null){
 const url=new URL(path,BASE);
 check(url.origin===BASE&&!url.username&&!url.password,'TARGET_FORBIDDEN');
 const headers={apikey:ctx.key,'content-type':'application/json',origin:'https://m26-canary.iberfit.cl'};
 if(token)headers.authorization='Bearer '+token;
 const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),
  redirect:'error',signal:AbortSignal.timeout(18000)});
 return {status:r.status,body:await r.json().catch(()=>null)};
}
async function auth(ctx,email,password){
 const r=await request(ctx,'/auth/v1/token?grant_type=password',{email,password});
 check(r.status===200&&r.body?.access_token,'HOSTED_JWT_AUTH');
 return {jwt:r.body.access_token,id:r.body.user?.id};
}
const rpc=(ctx,jwt,name,body)=>request(ctx,'/rest/v1/rpc/'+name,body,jwt);
async function read(ctx,jwt,name,payload={}){
 const r=await rpc(ctx,jwt,name,payload);
 check(r.status===200,'READ_'+name.toUpperCase()+'_HTTP_'+r.status);
 return r.body;
}
const calendar=(ctx,jwt,client)=>read(ctx,jwt,'iberfit_occurrence_api_u60_v1',{
 p_action:'CALENDARIO',p_payload:{clientId:client,startDate:DAY,endDate:FUTURE,limit:10}});
const detail=(ctx,jwt,client,occ)=>read(ctx,jwt,'iberfit_occurrence_detail_v1',{
 p_client_id:client,p_occurrence_id:occ});
async function status(ctx){
 const {e}=ctx;
 const [coach,a,b]=await Promise.all([
  auth(ctx,e.M26_QA_COACH_EMAIL,e.M26_QA_COACH_PASSWORD),
  auth(ctx,e.M26_QA_CLIENT_A_EMAIL,e.M26_QA_CLIENT_A_PASSWORD),
  auth(ctx,e.M26_QA_CLIENT_B_EMAIL,e.M26_QA_CLIENT_B_PASSWORD),
 ]);
 check(new Set([coach.id,a.id,b.id]).size===3,'ACTORS_NOT_DISTINCT');
 const [owner,foreign,role,env]=await Promise.all([
  read(ctx,a.jwt,'iberfit_client_id'),
  read(ctx,b.jwt,'iberfit_client_id'),
  read(ctx,coach.jwt,'iberfit_current_role_v26'),
  read(ctx,a.jwt,'iberfit_environment')]);
 check(owner&&foreign&&owner!==foreign&&role==='coach','IDENTITY_SCOPE');
 check(env?.environment==='QA'&&env.realDataAllowed===false
  &&env.productionBlocked===true,'ENVIRONMENT_NOT_QA');
 const c=await calendar(ctx,a.jwt,owner);
 check(c?.kind==='calendar'&&Array.isArray(c.occurrences)
  &&c.occurrences.length===2,'EXACTLY_TWO_SCOPED_OCCURRENCES');
 const first=c.occurrences.find(x=>x.localDate===DAY);
 const next=c.occurrences.find(x=>x.localDate===FUTURE);
 check(first?.status==='en_curso'&&first.revision===2&&next?.status==='confirmada'
  &&next.executionId==null,'QA_FIXTURE_STATUS_DRIFT');
 check(first.appointmentId&&next.appointmentId&&first.clientId===owner
  &&next.clientId===owner,'APPOINTMENTS_MISSING_OR_FOREIGN');
 const d=await detail(ctx,a.jwt,owner,first.id);
 const execution=derivedUuid(SOURCE_RUN,'first-execution');
 check(d?.kind==='private-occurrence'&&d.occurrence?.id===first.id
  &&d.executionBody?.id===execution&&d.executionBody?.occurrenceId===first.id
  &&d.executionBody?.status==='en_curso'
  &&Number(d.executionBody?.revision)===1,'UNRELATED_EXECUTION_OR_ALREADY_CHANGED');
 const block=d.prescriptionSnapshot?.blocks?.[0],sets=Number(block?.sets);
 check(typeof block?.exerciseId==='string'&&block.exerciseId.length>0
  &&Number.isInteger(sets)&&sets>=1&&sets<=15,'UNKNOWN_PRESCRIPTION');
 const coachView=await calendar(ctx,coach.jwt,owner);
 check(coachView?.occurrences?.some(x=>x.id===first.id&&x.status==='en_curso'),
  'COACH_NOT_AUTHORIZED');
 const foreignRes=await rpc(ctx,b.jwt,'iberfit_occurrence_detail_v1',{
  p_client_id:owner,p_occurrence_id:first.id});
 check([401,403,404].includes(foreignRes.status),'FOREIGN_CLIENT_READ_NOT_DENIED');
 return {ctx,coach,a,b,owner,foreign,first,next,execution,block,sets,
  fingerprint:hash(owner+':'+first.id+':'+execution+':'+SOURCE_RUN)};
}
async function save(proof){
 await mkdir('recovery/u73-qa-recover',{recursive:true});
 await writeFile(PATH,JSON.stringify(proof,null,2)+'\n',{mode:0o600});
}
async function main(){
 const mode=process.argv[2];check(mode==='preflight'||mode==='apply','STAGE');
 const ctx=settings(mode);await currentHead(ctx);
 const current=await status(ctx);
 const proof={schema:'iberfit.u73.qa-exact-synthetic-recovery.v1',
  stage:mode,qaOnly:true,sourceRun:SOURCE_RUN,sourceSha:ctx.e.GITHUB_SHA,
  runId:ctx.e.GITHUB_RUN_ID,createdAt:new Date().toISOString(),
  fingerprint:current.fingerprint,prodTouched:false,noBroadGrant:true,
  noNewAppointments:true,noNewOccurrences:true,
  checks:['three_signed_jwts','owner_only','actual_U71_execution_bound',
   'future_date_unchanged','coach_can_read','foreign_denied'],
  status:'PREPARED'};
 if(mode==='preflight'){
  proof.status='AUTHORIZED_FOR_EXPLICIT_RERUN';await save(proof);
  process.stdout.write('IBERFIT_U73_QA_EXACT_RECOVERY_READ_ONLY_PASS\n');return;
 }
 const previous=JSON.parse(await readFile(PREV,'utf8'));
 const age=Date.now()-Date.parse(previous.createdAt);
 check(previous.schema===proof.schema&&previous.stage==='preflight'
  &&previous.status==='AUTHORIZED_FOR_EXPLICIT_RERUN'
  &&previous.sourceRun===SOURCE_RUN&&previous.sourceSha===proof.sourceSha
  &&previous.runId===proof.runId&&previous.fingerprint===proof.fingerprint
  &&Number.isFinite(age)&&age>=0&&age<7200000,'PRIOR_PROOF_STALE_OR_DIFFERENT');
 proof.status='RECOVERY_STARTED';await save(proof);
 const {owner,first,execution,block,sets,a,coach,next}=current;
 const one={[block.exerciseId+':1']:{reps:10,loadKg:20}};
 const progress=await rpc(ctx,a.jwt,'iberfit_occurrence_api_u60_v1',{
  p_action:'TRANSICION',
  p_payload:{type:'OCURRENCIA_GUARDAR_PROGRESO',
   operationId:derivedUuid(SOURCE_RUN,'occ-progress'),
   clientId:owner,entityId:first.id,baseRevision:2,
   payload:{executionId:execution,executionBaseRevision:1,results:one,skippedSets:{}}}});
 check(progress.status===200&&progress.body?.kind==='ack'
  &&Number(progress.body.executionRevision)===2,'PROGRESS_NOT_ACK_'+progress.status);
 proof.checks.push('one_set_saved');await save(proof);
 const all={...one};
 for(let n=2;n<=sets;n++)all[block.exerciseId+':'+n]={reps:8,loadKg:22};
 const finished=await rpc(ctx,a.jwt,'iberfit_occurrence_api_u60_v1',{
  p_action:'TRANSICION',
  p_payload:{type:'OCURRENCIA_COMPLETAR',
   operationId:derivedUuid(SOURCE_RUN,'occ-finish'),
   clientId:owner,entityId:first.id,baseRevision:2,
   payload:{executionId:execution,executionBaseRevision:2,results:all,
    skippedSets:{},feedback:{sessionRpe:7,comment:'U71 QA synthetic training',pain:false}}}});
 check(finished.status===200&&finished.body?.kind==='ack'
  &&finished.body.status==='completada','EXECUTION_NOT_COMPLETED_'+finished.status);
 proof.checks.push('original_execution_finished');await save(proof);
 const coachRead=await calendar(ctx,coach.jwt,owner);
 check(coachRead.occurrences.length===2
  &&coachRead.occurrences.some(x=>x.id===first.id&&x.status==='completada')
  &&coachRead.occurrences.some(x=>x.id===next.id&&x.status==='confirmada'),
    'COACH_CALENDAR_INTEGRITY');
 const evidence=await detail(ctx,coach.jwt,owner,first.id);
 check(evidence.executionBody?.id===execution&&evidence.executionBody.status==='completada',
   'COACH_DETAIL_MISSING');
 proof.status='QA_SYNTHETIC_RECOVERY_COMPLETED';proof.checks.push('coach_readback');
 await save(proof);
 process.stdout.write('IBERFIT_U73_QA_ORIGINAL_EXECUTION_COMPLETED_AND_COACH_VERIFIED\n');
}
if(process.argv[1]?.endsWith('/qa_u73_recover_original_workout.mjs')){
 main().catch(err=>{
  process.stderr.write('IBERFIT_U73_FAIL_CLOSED:'+String(err?.message||'UNKNOWN')
   .replace(/[^A-Za-z0-9_:]/g,'').slice(0,110)+'\n');
  process.exitCode=1;
 });
}
