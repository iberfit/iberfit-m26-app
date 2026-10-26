/**
 * M43 authenticated QA-only Coach -> Client acceptance.
 * Fixed isolated QA origin; synthetic actors; never service_role or PROD.
 * Real command RPCs and production domain builders, no in-memory backend.
 * No token, email, ID, personal metrics or raw medical data in evidence.
 */
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {buildCycleCommand} from '../../src/m26/workflows/planning-workflow.js';
import {createExerciseCatalog} from '../../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,acceptSessionPreview,buildPublishSessionCommand} from '../../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet,advanceExecution,finishExecution,buildStartExecutionCommand,buildExecutionCommand} from '../../src/m26/workflows/session-execution.js';
import {verifyM43AtomicGuidedEnablement,assessM43SyntheticFixtureBudget,assessM43StalePausedRecovery,attestCompletedM43Run,m43QaRunMarkers} from './m43-qa-fixture-safety.mjs';

const REF='gjztkdwfmunnzhtvxrsu', BASE='https://'+REF+'.supabase.co';
const required=['M26_PROJECT_REF','M26_QA_ONLY','M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD','M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD'];
for(const name of required)if(!process.env[name])throw Error('M43_QA_ENV_MISSING_'+name);
if(process.env.M26_PROJECT_REF!==REF||process.env.M26_QA_ONLY!=='true'
  ||new URL(process.env.M26_SUPABASE_URL).origin!==BASE)
  throw Error('M43_QA_PRODUCTION_ORIGIN_DENIED');
const RUN_MARKERS=m43QaRunMarkers({runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT});
const KEY=process.env.M26_SUPABASE_PUBLISHABLE_KEY;
if(/service[_-]?role|supabase_secret/iu.test(KEY))throw Error('M43_QA_SECRET_KEY_DENIED');
const evidence={schema:'iberfit.m43.authenticated-real-qa.v1',project:'QA',
  synthetic:true,productionTouched:false,serviceRoleUsed:false,mockBackend:false,
  checks:[],warnings:[],phase:'environment',passed:false,
  provenance:{runId:String(process.env.GITHUB_RUN_ID||''),
    runAttempt:String(process.env.GITHUB_RUN_ATTEMPT||''),
    sourceSha:String(process.env.GITHUB_SHA||'')}};
function check(value,code){if(!value)throw Error('M43_QA_'+code);evidence.checks.push(code);}
async function request(path,{token=null,payload,auth=false}={}){
  const target=new URL(path,BASE);
  if(target.origin!==BASE||target.username||target.password)throw Error('M43_QA_EGRESS_DENIED');
  const response=await fetch(target,{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(20000),
    headers:{apikey:KEY,'content-type':'application/json',origin:'https://m26-canary.iberfit.cl',
      ...(token?{authorization:'Bearer '+token}:{})},
    body:JSON.stringify(payload||{})});
  return {status:response.status,body:await response.json().catch(()=>null)};
}
async function login(email,password){
  const r=await request('/auth/v1/token?grant_type=password',{payload:{email,password}});
  check(r.status===200&&typeof r.body?.access_token==='string','AUTHENTICATION');
  return {token:r.body.access_token};
}
async function rpc(name,session,params={}){
  const r=await request('/rest/v1/rpc/'+name,{token:session.token,payload:params});
  if(r.status<200||r.status>=300)
    throw Error('M43_QA_RPC_'+name.toUpperCase()+'_'+r.status+'_'+String(r.body?.code||'UNKNOWN').slice(0,20));
  return r.body;
}
const bootstrap=session=>rpc('iberfit_bootstrap_v26',session);
const contains=(snapshot,id,entity)=>(snapshot?.data?.m26Entities||[])
  .some(item=>item.entityType===entity&&String(item.entityId)===id);
const baseContains=(snapshot,id,collection)=>(snapshot?.data?.[collection]||[])
  .some(item=>String(item.id)===id);
async function denied(session,cmd,label){
  const r=await request('/rest/v1/rpc/iberfit_command_preflight_v26',{
    token:session.token,payload:{p_command:{...cmd,operationId:randomUUID()}},
  });
  check([401,403].includes(r.status)||r.status===200&&r.body?.kind==='rejected',label+'_DENIED');
  check(r.body?.kind!=='ack',label+'_NOT_AUTHORIZED');
}
async function send(session,body,label){
  const command={operationId:randomUUID(),...body};
  const checkResult=await rpc('iberfit_command_preflight_v26',session,{p_command:command});
  check(checkResult?.kind==='ack',label+'_PREFLIGHT_'+String(checkResult?.reason||checkResult?.kind||'UNKNOWN'));
  const result=await rpc('iberfit_execute_command_v26',session,{p_command:command});
  check(result?.kind==='ack'&&Number(result.remoteRevision)>0,label+'_PERSISTED');
  return {command,result};
}
async function main(){
  const [coach,clientA,clientB]=await Promise.all([
    login(process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD),
    login(process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD),
    login(process.env.M26_QA_CLIENT_B_EMAIL,process.env.M26_QA_CLIENT_B_PASSWORD)]);
  const environment=await rpc('iberfit_environment',clientA);
  check(environment?.environment==='QA'&&environment.realDataAllowed===false
    &&environment.productionBlocked===true,'QA_ISOLATION');
  const [a,b,coachRole]=await Promise.all([
    bootstrap(clientA),bootstrap(clientB),rpc('iberfit_current_role_v26',coach)]);
  // Long-running QA may hold hundreds of genuine synthetic histories from prior
  // certifications. Keep a hard ceiling until a separately authorized, audited
  // ephemeral-fixture cleanup lane exists; never delete history to hide a gate.
  const budget=assessM43SyntheticFixtureBudget(a);
  evidence.fixtureBudget={count:budget.count,total:budget.total,retained:budget.retained,limit:budget.limit,exhausted:budget.exhausted};
  check(!budget.exhausted,'SYNTHETIC_FIXTURE_BUDGET_EXHAUSTED');
  // This run creates TWO synthetic sessions: one RPC-certified and one
  // browser-driven. Never exhaust the isolated fixture budget mid-run.
  check(budget.count<=budget.limit-2,'INTERACTIVE_FIXTURE_BUDGET_RESERVED');
  // The prior browser job can time out after an ACKed PAUSE. Leaving its
  // active-execution lock behind blocks every later synthetic Client run.
  // Keep the server lock; close only an old M43-marked, isolated QA execution
  // through the actual authenticated command bus, preserving audit history.
  const recovery=assessM43StalePausedRecovery(a,{runId:process.env.GITHUB_RUN_ID});
  evidence.fixtureRecovery={kind:recovery.kind,reason:recovery.reason};
  check(recovery.kind!=='blocked','FIXTURE_RECOVERY_'+recovery.reason);
  if(recovery.kind==='recover'){
    check(await attestCompletedM43Run(recovery.priorRunId),
      'PRIOR_SYNTHETIC_WORKFLOW_NOT_COMPLETED');
    const reason='IBERFIT QA M43 · cierre controlado de prueba interrumpida';
    const closed=await send(clientA,{
      type:'EJECUCION_CANCELAR',entityType:'session_execution',
      entityId:recovery.executionId,clientId:recovery.clientId,
      baseRevision:recovery.revision,payload:{reason,patch:{}},
    },'STALE_SYNTHETIC_CANCEL');
    check(closed.result?.kind==='ack','STALE_SYNTHETIC_CANCEL_ACK');
    const observed=await bootstrap(clientA);
    check(observed?.data?.m26Entities?.some(e=>e.entityType==='session_execution'
      && String(e.entityId)===recovery.executionId && e.status==='cancelada'),
      'STALE_SYNTHETIC_EXECUTION_CLOSED');
    // Cancelled sessions are intentionally hidden in the Client projection.
    // Coach bootstrap requires a *separate* privileged WebAuthn assurance;
    // this Client-only repair must never bypass or borrow that privilege.
    // The execution cancellation ACK is atomic: it closes its parent session
    // and releases the server lock in the same transaction. The next Client
    // start below verifies lock release via the real command path.
    check(!observed?.data?.m26Entities?.some(e=>e.entityType==='session'
      && String(e.entityId)===recovery.sessionId),
      'STALE_SYNTHETIC_CANCELLED_SESSION_HIDDEN_FROM_CLIENT');
    check(closed.result?.kind==='ack'&&Number(closed.result.remoteRevision)>recovery.revision,
      'STALE_SYNTHETIC_ATOMIC_CLOSE_ACK');
    evidence.fixtureRecovery={kind:'recovered',reason:'AUTHENTICATED_CANCEL_ACK'};
  }
  const idA=String(a?.user?.clientId||''),idB=String(b?.user?.clientId||'');
  check(/^[a-f0-9-]{36}$/iu.test(idA)&&/^[a-f0-9-]{36}$/iu.test(idB)&&idA!==idB,'TWO_SYNTHETIC_CLIENTS');
  check(String(coachRole).toLowerCase()==='coach','COACH_ROLE');
  check(['client','cliente'].includes(String(a?.user?.role||'').toLowerCase()),'CLIENT_ROLE');
  check((a?.data?.clients||[]).some(x=>String(x.id)===idA&&x.trainingServiceStatus==='active'),'TRAINING_SERVICE_ACTIVE');
  check(await rpc('iberfit_can_manage_iri_private_v1',coach,{p_client_id:idA})===true,'COACH_ASSIGNMENT');
  evidence.phase='authenticated';

  const now=new Date(),end=new Date(now.getTime()+35*86400000);
  const cycle=(id,name)=>({id,clientId:idA,name,goal:'QA multideporte: fuerza, carrera y natación',
    startDate:now.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10),
    modality:'hibrido',weeklyFrequency:3,sessionDurationMinutes:75});
  const planId=randomUUID(),savedId=randomUUID();
  const command=buildCycleCommand(cycle(planId,RUN_MARKERS.publishedCycleTitle));
  await denied(clientA,command,'CLIENT_CANNOT_VALIDATE_PLAN');
  await denied(clientB,command,'FOREIGN_CLIENT_CANNOT_VALIDATE_PLAN');
  const validated=await send(coach,command,'PLAN_VALIDATE');
  const replay=await rpc('iberfit_execute_command_v26',coach,{p_command:validated.command});
  check(replay?.kind==='ack'&&replay.duplicate===true
    &&Number(replay.remoteRevision)===Number(validated.result.remoteRevision),'SERVER_IDEMPOTENCY');
  await send(coach,buildCycleCommand(cycle(savedId,RUN_MARKERS.unpublishedCycleTitle)),
    'SECOND_CYCLE_PRESERVED');
  evidence.phase='two-plans-validated';
  const before=await bootstrap(clientA);
  const leaked=contains(before,savedId,'planning')||baseContains(before,savedId,'trainingCycles');
  if(leaked)evidence.warnings.push('UNPUBLISHED_PLAN_VISIBLE_IN_CLIENT_RAW_BOOTSTRAP');
  const approved=await send(coach,{type:'PLAN_APROBAR',entityType:'planning',
    entityId:planId,clientId:idA,baseRevision:Number(validated.result.remoteRevision),
    payload:{patch:{status:'aprobado',visibleToClient:false}}},'PLAN_APPROVE');
  await send(coach,{type:'PLAN_PUBLICAR',entityType:'planning',
    entityId:planId,clientId:idA,baseRevision:Number(approved.result.remoteRevision),
    previewAccepted:true,payload:{patch:{status:'publicado',visibleToClient:true}}},'PLAN_PUBLISH');
  evidence.phase='plan-published';

  const catalog=createExerciseCatalog([
    {id:'qa-m43-strength',name_es:'Sentadilla con mancuernas',measurement_profile:'strength'},
    {id:'qa-m43-run',name_es:'Carrera continua',measurement_profile:'endurance'},
    {id:'qa-m43-swim',name_es:'Natación crol en piscina',measurement_profile:'endurance'}]);
  const draft=createSessionDraft({clientId:idA,title:RUN_MARKERS.sessionTitle,
    durationMinutes:75,deliveryModality:'guiada_en_app'});
  draft.cycleId=planId;
  addCatalogExercise(draft,'qa-m43-strength',catalog,{sets:1,reps:'8',plannedLoad:'22 kg',
    restSeconds:0,targetRpe:7,targetRir:2});
  addCatalogExercise(draft,'qa-m43-run',catalog,{sets:1,plannedDistanceKm:'5',
    plannedDurationMinutes:'30',plannedPace:'06:00',restSeconds:0,targetRpe:6,targetRir:0});
  addCatalogExercise(draft,'qa-m43-swim',catalog,{sets:1,plannedDistanceM:'400',
    plannedDurationMinutes:'10',plannedPacePer100M:'02:25',poolLengthM:'25',
    restSeconds:0,targetRpe:6,targetRir:0});
  acceptSessionPreview(draft,catalog);
  const publishCommand=buildPublishSessionCommand(draft,catalog,0);
  await denied(clientA,publishCommand,'CLIENT_CANNOT_PUBLISH');
  await denied(clientB,publishCommand,'FOREIGN_CLIENT_CANNOT_PUBLISH');
  const published=await send(coach,publishCommand,'SESSION_PUBLISH');
  // Double tap / lost ACK: replay the identical published command identity.
  // A second publication must not alter the canonical revision or create a session.
  const publishReplay=await rpc('iberfit_execute_command_v26',coach,{p_command:published.command});
  check(publishReplay?.kind==='ack'&&publishReplay.duplicate===true
    &&Number(publishReplay.remoteRevision)===Number(published.result.remoteRevision),
    'SESSION_PUBLISH_IDEMPOTENT_REPLAY');
  // M37 enables reviewed guided sessions atomically during publication.
  // Do not send a redundant SESION_HABILITAR after a confirmed state change.
  // Legacy supervised or non-atomic flows still require explicit enablement.
  let [clientVisible,otherVisible]=await Promise.all([bootstrap(clientA),bootstrap(clientB)]);
  const canonical=clientVisible?.data?.m26Entities?.find(item=>
    item.entityType==='session'&&String(item.entityId)===String(draft.id));
  // M37 requires the publish ACK itself to include atomic enablement. A
  // second command here masked regressions that would strand real Clients on
  // a visible but unstartable session. Fail before any start mutation.
  const enablement=verifyM43AtomicGuidedEnablement({
    canonical,publishedResult:published.result,sessionId:draft.id,clientId:idA,
  });
  check(enablement.ok,'GUIDED_ATOMIC_ENABLEMENT_'+enablement.reason);
  const readyRevision=enablement.revision;
  check(readyRevision===Number(canonical.revision),'CANONICAL_SESSION_REVISION');
  check(contains(clientVisible,draft.id,'session')||baseContains(clientVisible,draft.id,'sessions'),
    'CLIENT_SEES_PUBLISHED_SESSION');
  check(!contains(otherVisible,draft.id,'session')&&!baseContains(otherVisible,draft.id,'sessions'),
    'OTHER_CLIENT_CANNOT_SEE_SESSION');
  evidence.phase='session-published-and-enabled';

  const session={...draft,status:'disponible',deliveryOwnership:'guided_in_app',
    clientVisibilityLevel:'full',visibleToClient:true};
  const execution=createExecution({session,clientId:idA,executionId:randomUUID()});
  const start=buildStartExecutionCommand(execution,{sessionRevision:readyRevision});
  await denied(clientB,start,'FOREIGN_CLIENT_CANNOT_START');
  const started=await send(clientA,start,'CLIENT_START');
  startExecution(execution,{actor:{role:'client',clientId:idA}});
  execution.revision=Number(started.result.executionRevision||1);
  recordSet(execution,session,{reps:8,load:'20 kg',rpe:7,rir:2});advanceExecution(execution);
  recordSet(execution,session,{distanceKm:5,durationMinutes:30,paceMinPerKm:'06:15',rpe:6});
  advanceExecution(execution);
  recordSet(execution,session,{distanceM:400,durationMinutes:10,pacePer100M:'02:30',rpe:7});
  advanceExecution(execution);
  check(execution.status==='awaiting_feedback','THREE_SPORT_RESULTS_RECORDED');
  finishExecution(execution,{sessionRpe:7,pain:false,comment:'QA M43 · sesión sintética finalizada'});
  const completed=await send(clientA,buildExecutionCommand(execution,execution.revision),'CLIENT_FINISH_FEEDBACK');
  const finishReplay=await rpc('iberfit_execute_command_v26',clientA,{p_command:completed.command});
  check(finishReplay?.kind==='ack'&&finishReplay.duplicate===true
    &&Number(finishReplay.remoteRevision)===Number(completed.result.remoteRevision),
    'CLIENT_FINISH_IDEMPOTENT_REPLAY');
  evidence.phase='real-client-execution';

  const [finalA,finalB]=await Promise.all([bootstrap(clientA),bootstrap(clientB)]);
  check(contains(finalA,execution.id,'session_execution')||baseContains(finalA,execution.id,'sessionExecutions'),
    'CLIENT_COMPLETED_HISTORY_VISIBLE');
  check(!contains(finalB,execution.id,'session_execution')&&!baseContains(finalB,execution.id,'sessionExecutions'),
    'FOREIGN_CLIENT_HISTORY_PRIVATE');
  check(!leaked&&!contains(finalA,savedId,'planning')&&!baseContains(finalA,savedId,'trainingCycles'),
    'UNPUBLISHED_SECOND_CYCLE_HIDDEN');
  const raw=finalA?.data?.m26Entities?.find(item=>
    item.entityType==='session_execution'&&String(item.entityId)===execution.id);
  check(Boolean(raw?.body),'CLIENT_HTTP_EXECUTION_RETURNED');
  check(Array.isArray(raw.body.results)&&raw.body.results.length===3,
    'CLIENT_HTTP_THREE_SPORT_METRICS');
  check(!['events','incidents','queue','progressSnapshot','sourceRevision'].some(k=>
    Object.hasOwn(raw.body,k)),'CLIENT_HTTP_EXECUTION_INTERNAL_FIELDS_OMITTED');
  check(Object.keys(raw.body.feedback||{}).every(k=>
    ['sessionRpe','comment','pain','painNotes'].includes(k)),
    'CLIENT_HTTP_FEEDBACK_ALLOWLIST');
  check((finalA?.data?.sessionExecutions||[]).every(e=>
    !['events','incidents','queue','progressSnapshot'].some(k=>Object.hasOwn(e,k))),
    'CLIENT_HTTP_LEGACY_EXECUTION_INTERNAL_FIELDS_OMITTED');
  // A second run-unique published session remains READY for the genuine
  // Client browser to start, pause, record and finish by clicking the product.
  // This is QA-only; no real customer, old session or production data touched.
  const uiDraft=createSessionDraft({
    clientId:idA,title:RUN_MARKERS.interactiveSessionTitle,
    durationMinutes:20,deliveryModality:'guiada_en_app',
  });
  uiDraft.cycleId=planId;
  // A real rest and a second confirmed set are required. With only one set
  // the engine intentionally skips the rest phase; an E2E claiming to test rest
  // must never rely on such an impossible fixture.
  addCatalogExercise(uiDraft,'qa-m43-strength',catalog,{
    sets:2,reps:'8',plannedLoad:'20 kg',restSeconds:45,targetRpe:7,targetRir:2,
  });
  acceptSessionPreview(uiDraft,catalog);
  const uiPublished=await send(coach,buildPublishSessionCommand(uiDraft,catalog,0),
    'INTERACTIVE_SESSION_PUBLISH');
  const [uiClient,uiOther]=await Promise.all([bootstrap(clientA),bootstrap(clientB)]);
  const uiCanonical=uiClient?.data?.m26Entities?.find(item=>
    item.entityType==='session'&&String(item.entityId)===String(uiDraft.id));
  check(verifyM43AtomicGuidedEnablement({
    canonical:uiCanonical,publishedResult:uiPublished.result,
    sessionId:uiDraft.id,clientId:idA,
  }).ok,'INTERACTIVE_SESSION_ATOMIC_ENABLEMENT');
  check(!contains(uiOther,uiDraft.id,'session')&&!baseContains(uiOther,uiDraft.id,'sessions'),
    'INTERACTIVE_SESSION_FOREIGN_PRIVATE');
  // Browser completion MUST occur in the downstream authenticated test,
  // not in this Node writer. Otherwise a fake read-only test can pass.
  check(uiCanonical?.status==='disponible','INTERACTIVE_SESSION_READY_FOR_BROWSER');
  evidence.phase='complete';
  evidence.passed=true;
}
try{await main();}catch(error){
  evidence.errorCode=String(error?.message||'UNKNOWN').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu,'[ID]').slice(0,160);
  process.exitCode=1;
}finally{
  await mkdir('recovery/m43-qa',{recursive:true});
  await writeFile('recovery/m43-qa/coach-client-real-write.json',JSON.stringify(evidence,null,2)+'\n');
  console.log('M43_REAL_QA='+JSON.stringify({passed:evidence.passed,phase:evidence.phase,
    checks:evidence.checks.length,warnings:evidence.warnings.length,error:evidence.errorCode||null}));
}
