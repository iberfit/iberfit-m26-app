// U74 recovery of ONE previously interrupted QA synthetic browser execution.
// Reads are the only operations in this script. A separate browser, under the
// same project/owner/network whitelist, must perform the remaining actions.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const REF='gjztkdwfmunnzhtvxrsu';
const ORIGIN='https://'+REF+'.supabase.co';
const OLD_RUN='43679537387';
const OLD_SHA='3ee26fb00c98855d53f3c9b5cc923cf60d805a40';
const SOURCE='.tmp/u74-old/evidence.json';
const FIRST='.tmp/u74-first/evidence.json';
const OUTPUT='recovery/u74-existing-resume/evidence.json';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const requireSafe=(truth,code)=>{if(!truth)throw Error('U74_RECOVERY_'+code);};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function checkHistoricFixture(p){
 const f=p?.fixture;
 requireSafe(p?.schema==='iberfit.u71.qa-authenticated-dated-e2e.v1'
  &&p.stage==='prepare-browser'&&p.status==='QA_BROWSER_FIXTURE_READY'
  &&p.project==='QA'&&p.writesApplied===true&&p.prodTouched===false
  &&p.sha===OLD_SHA&&String(p.runId)===OLD_RUN
  &&f&&['clientId','sessionId','occurrenceId','futureOccurrenceId'].every(k=>UUID.test(f[k]))
  &&f.occurrenceId!==f.futureOccurrenceId&&f.stepsExpected===2
  &&f.localDate==='2026-11-15'&&f.futureDate==='2026-11-22','OLD_FIXTURE_INVALID');
 const age=Date.now()-Date.parse(p.createdAt);
 requireSafe(Number.isFinite(age)&&age>=0&&age<72*3600000,'OLD_PROVENANCE_EXPIRED');
 return f;
}
function environment(){
 const e=process.env;
 requireSafe(e.GITHUB_ACTIONS==='true'
  &&['1','2'].includes(e.GITHUB_RUN_ATTEMPT)
  &&e.GITHUB_REF==='refs/heads/feat/iberfit-real-training-360-20261114'
  &&/^[a-f0-9]{40}$/u.test(e.GITHUB_SHA||'')
  &&/^[0-9]+$/u.test(e.GITHUB_RUN_ID||'')
  &&e.M26_PROJECT_REF===REF&&e.M26_QA_ONLY==='true'
  &&new URL(e.M26_SUPABASE_URL).origin===ORIGIN
  &&e.M26_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')
  &&e.M26_QA_CLIENT_A_EMAIL==='qa.rc74.client-a@iberfit.cl'
  &&e.M26_QA_CLIENT_B_EMAIL==='qa.rc74.client-b@iberfit.cl'
  &&e.M26_QA_COACH_EMAIL==='qa.rc74.coach@iberfit.cl','ENVIRONMENT_NOT_SYNTHETIC');
 return e;
}
async function exactHead(e){
 const u='https://api.github.com/repos/iberfit/iberfit-m26-app/git/ref/heads/'+
   encodeURIComponent('feat/iberfit-real-training-360-20261114');
 const r=await fetch(u,{headers:{Authorization:'Bearer '+e.GH_TOKEN,
  Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(12000)});
 requireSafe(r.ok,'HEAD_READ_FAILED');
 const b=await r.json();
 requireSafe(b.object?.sha===e.GITHUB_SHA,'HEAD_DRIFT');
}
async function api(e,path,body,jwt=null){
 const u=new URL(path,ORIGIN);
 requireSafe(u.origin===ORIGIN&&u.username===''&&u.password==='','QA_ENDPOINT');
 const r=await fetch(u,{method:'POST',headers:{
  apikey:e.M26_SUPABASE_PUBLISHABLE_KEY,
  ...(jwt?{authorization:'Bearer '+jwt}:{}),
  'content-type':'application/json',
 },body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(18000)});
 return {status:r.status,body:await r.json().catch(()=>null)};
}
const rpc=(e,jwt,name,args)=>api(e,'/rest/v1/rpc/'+name,args,jwt);
async function jwt(e,label){
 const r=await api(e,'/auth/v1/token?grant_type=password',{
  email:e['M26_QA_'+label+'_EMAIL'],password:e['M26_QA_'+label+'_PASSWORD']});
 requireSafe(r.status===200&&typeof r.body?.access_token==='string','QA_AUTH_'+label);
 return r.body.access_token;
}
async function inspection(e,p,mode){
 const f=checkHistoricFixture(p);
 const [coach,a,b]=await Promise.all([jwt(e,'COACH'),jwt(e,'CLIENT_A'),jwt(e,'CLIENT_B')]);
 const [roleCoach,roleA,ownerA,ownerB]=await Promise.all([
  rpc(e,coach,'iberfit_current_role_v26',{}),
  rpc(e,a,'iberfit_current_role_v26',{}),
  rpc(e,a,'iberfit_client_id',{}),rpc(e,b,'iberfit_client_id',{}),
 ]);
 requireSafe(roleCoach.status===200&&roleCoach.body==='coach'
  &&roleA.status===200&&['client','cliente'].includes(roleA.body)
  &&ownerA.status===200&&ownerA.body===f.clientId
  &&ownerB.status===200&&ownerB.body!==f.clientId,'OWNER_IDENTITY_DRIFT');
 const calendar=await rpc(e,coach,'iberfit_occurrence_api_u60_v1',{
  p_action:'CALENDARIO',p_payload:{
   clientId:f.clientId,startDate:f.localDate,endDate:f.futureDate,limit:50,
  }});
 requireSafe(calendar.status===200&&calendar.body?.kind==='calendar'
  &&calendar.body.hasMore!==true&&Array.isArray(calendar.body.occurrences),'CALENDAR_UNBOUNDED');
 const one=calendar.body.occurrences.find(x=>x.id===f.occurrenceId);
 const two=calendar.body.occurrences.find(x=>x.id===f.futureOccurrenceId);
 requireSafe(one?.clientId===f.clientId&&one?.sessionId===f.sessionId
  &&two?.clientId===f.clientId&&two?.sessionId===f.sessionId
  &&two.status==='confirmada'&&one.status===(mode==='verify'?'completada':'en_curso'),
  'DATES_SCOPE_OR_STATUS_CHANGED');
 const details=await rpc(e,coach,'iberfit_occurrence_detail_v1',{
  p_client_id:f.clientId,p_occurrence_id:f.occurrenceId});
 const d=details.body?.executionBody;
 requireSafe(details.status===200&&details.body?.kind==='private-occurrence'
  &&d&&UUID.test(d.id)&&d.occurrenceId===f.occurrenceId
  &&d.clientId===f.clientId&&d.sessionId===f.sessionId
  &&d.status===(mode==='verify'?'completada':'en_curso')
  &&d.results&&typeof d.results==='object'&&!Array.isArray(d.results)
  &&Object.keys(d.results).length===(mode==='verify'?2:1)
  &&d.skippedSets&&Object.keys(d.skippedSets).length===0
  &&Array.isArray(d.queue)&&d.queue.reduce((n,x)=>n+Number(x.sets||0),0)===2,
  'EXECUTION_NOT_EXACTLY_RECOVERABLE');
 const denied=await rpc(e,b,'iberfit_occurrence_api_u60_v1',{
  p_action:'CALENDARIO',p_payload:{clientId:f.clientId,startDate:f.localDate,
   endDate:f.futureDate,limit:10}});
 requireSafe([401,403,404].includes(denied.status)
  ||(denied.status===200&&['rejected','conflict'].includes(denied.body?.kind)
    &&/DENIED|FORBIDDEN|ACCESS|ROLE|OWNER|NOT_FOUND|NOT_ALLOWED/u.test(denied.body?.reason||'')),
 'CLIENT_B_READ_EXPOSED');
 return {f,executionId:d.id,
  fingerprint:digest({oneStatus:one.status,twoStatus:two.status,
   occurrenceRevision:one.revision,executionRevision:d.revision,
   keys:Object.keys(d.results).sort(),executionId:d.id}),
  resultCount:Object.keys(d.results).length};
}
async function main(){
 const mode=process.argv[2];
 requireSafe(['preflight','admit','verify'].includes(mode),'MODE');
 const e=environment();
 requireSafe(e.GITHUB_RUN_ATTEMPT===(mode==='preflight'?'1':'2'),'ATTEMPT_SCOPE');
 await exactHead(e);
 const source=JSON.parse(await readFile(SOURCE,'utf8'));
 const original=checkHistoricFixture(source);
 if(mode==='preflight'){
  const state=await inspection(e,source,mode);
  await mkdir('recovery/u74-existing-resume',{recursive:true});
  await writeFile(OUTPUT,JSON.stringify({
   schema:'iberfit.u74.qa.recover-existing.v1',status:'READ_ONLY_READY',project:'QA',
   sha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,sourceRunId:OLD_RUN,
   sourceSha:OLD_SHA,sourceDigest:digest(source.fixture),
   clientId:original.clientId,occurrenceId:original.occurrenceId,
   futureOccurrenceId:original.futureOccurrenceId,
   executionId:state.executionId,serverFingerprint:state.fingerprint,
  },null,2)+'\n',{mode:0o600});
  process.stdout.write('IBERFIT_U74_EXISTING_QA_READONLY_RECOVERY_READY\n');
  return;
 }
 const first=JSON.parse(await readFile(FIRST,'utf8'));
 requireSafe(first.schema==='iberfit.u74.qa.recover-existing.v1'
  &&first.status==='READ_ONLY_READY'&&first.project==='QA'
  &&first.sha===e.GITHUB_SHA&&first.runId===e.GITHUB_RUN_ID
  &&first.sourceRunId===OLD_RUN&&first.sourceSha===OLD_SHA
  &&first.sourceDigest===digest(source.fixture)
  &&first.clientId===original.clientId
  &&first.occurrenceId===original.occurrenceId
  &&first.futureOccurrenceId===original.futureOccurrenceId,'SIGNED_FIRST_PROOF_INVALID');
 const state=await inspection(e,source,mode);
 requireSafe(state.executionId===first.executionId,'EXECUTION_CHANGED');
 if(mode==='admit'){
  requireSafe(state.fingerprint===first.serverFingerprint,'SERVER_STATE_MOVED');
  process.stdout.write('IBERFIT_U74_EXISTING_QA_RECOVERY_ADMITTED_NO_WRITES\n');
 }else{
  requireSafe(state.resultCount===2&&state.fingerprint!==first.serverFingerprint,
    'RECOVERY_NOT_COMMITTED');
  process.stdout.write('IBERFIT_U74_EXISTING_QA_COACH_READBACK_AND_CLIENT_B_DENIED\n');
 }
}
if(process.argv[1]?.endsWith('qa_u74_existing_recovery.mjs')){
 main().catch(e=>{process.stderr.write('IBERFIT_U74_EXISTING_FAIL_CLOSED:'+String(e.message).slice(0,120)+'\n');process.exitCode=1;});
}
