import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isQaReadonlyDatedRequest,isQaScopedDatedSyntheticWrite} from '../qa/rc64/secure-current-source-auth.mjs';
const CLIENT='10000000-0000-4000-8000-000000000001';
const OCC='20000000-0000-4000-8000-000000000001';
const FOREIGN='30000000-0000-4000-8000-000000000001';
const scoped={clientId:CLIENT,occurrenceId:OCC};
const command={type:'OCURRENCIA_INICIAR',
 operationId:'40000000-0000-4000-8000-000000000001',
 clientId:CLIENT,entityId:OCC,baseRevision:1,
 payload:{executionId:'50000000-0000-4000-8000-000000000001'}};
function request(cmd,{host='gjztkdwfmunnzhtvxrsu.supabase.co',method='POST',action='TRANSICION'}={}){
 return {method:()=>method,
  url:()=> 'https://'+host+'/rest/v1/rpc/iberfit_occurrence_api_u60_v1',
  postDataJSON:()=>({p_action:action,p_payload:cmd})};
}
test('U74 allows only the exact U39 payload schema for the signed QA date',()=>{
 assert.equal(isQaScopedDatedSyntheticWrite(request(command),scoped),true);
 for(const type of ['OCURRENCIA_PAUSAR','OCURRENCIA_REANUDAR',
  'OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR']){
  const payload={...command.payload,executionBaseRevision:1};
  if(type==='OCURRENCIA_GUARDAR_PROGRESO'||type==='OCURRENCIA_COMPLETAR')
   Object.assign(payload,{results:{},skippedSets:{}});
  if(type==='OCURRENCIA_COMPLETAR')payload.feedback={};
  assert.equal(isQaScopedDatedSyntheticWrite(request({...command,type,payload}),scoped),true);
 }
 assert.equal(isQaReadonlyDatedRequest(request(command),'iberfit_occurrence_api_u60_v1'),false);
});
test('U74 rejects nested foreign scope, unknown fields, malformed results and oversized writes',()=>{
 const base={...command.payload,executionBaseRevision:1};
 const progress={...command,type:'OCURRENCIA_GUARDAR_PROGRESO',
  payload:{...base,results:{},skippedSets:{}}};
 const complete={...command,type:'OCURRENCIA_COMPLETAR',
  payload:{...progress.payload,feedback:{}}};
 for(const malformed of [
  {...command,type:'OCURRENCIA_PAUSAR',payload:{...base,otherOccurrenceId:FOREIGN}},
  {...command,type:'OCURRENCIA_REANUDAR',payload:{...base,otherClientId:FOREIGN}},
  {...progress,payload:{...progress.payload,otherClientId:FOREIGN}},
  {...progress,payload:{...progress.payload,results:[]}},
  {...progress,payload:{...progress.payload,skippedSets:null}},
  {...progress,payload:{executionId:base.executionId,executionBaseRevision:1}},
  {...complete,payload:{...complete.payload,feedback:[]}},
  {...complete,payload:{...complete.payload,feedback:null}},
  {...complete,payload:{...complete.payload,unexpected:'cross-scope'}},
  {...progress,payload:{...progress.payload,results:{oversized:'x'.repeat(524289)}}},
 ])assert.equal(isQaScopedDatedSyntheticWrite(request(malformed),scoped),false);
});
test('U74 denies other owners, dates, destructive actions, malformed CAS and PROD',()=>{
 for(const bad of [
  {...command,clientId:FOREIGN},{...command,entityId:FOREIGN},
  {...command,type:'OCURRENCIA_CANCELAR'},
  {...command,type:'OCURRENCIAS_CREAR_LOTE'},
  {...command,operationId:'bad'},{...command,baseRevision:-1},
  {...command,payload:{}},{...command,payload:{...command.payload,extra:true}},
  {...command,unexpected:'extra'},{...command,type:'OCURRENCIA_PAUSAR'},
 ])
  assert.equal(isQaScopedDatedSyntheticWrite(request(bad),scoped),false);
 assert.equal(isQaScopedDatedSyntheticWrite(request(command,{host:'pjhmrhejsoofmouedavw.supabase.co'}),scoped),false);
 assert.equal(isQaScopedDatedSyntheticWrite(request(command,{action:'CREAR_LOTE'}),scoped),false);
 assert.equal(isQaScopedDatedSyntheticWrite(request(command,{method:'GET'}),scoped),false);
});
test('U74 requires exact source, explicit second attempt, least privilege and no PROD',()=>{
 const source=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 const workflow=readFileSync('.github/workflows/u74-qa-dated-browser-e2e.yml','utf8');
 const browser=readFileSync('qa/rc64/u74-dated-ui-write.spec.mjs','utf8');
 const policy=readFileSync('qa/rc64/secure-current-source-auth.mjs','utf8');
 assert.match(workflow,/feat\/iberfit-real-training-360-20261114/u);
 assert.match(workflow,/feat\/real-training-360-one-release-20261117/u);
 assert.match(source,/feat\/real-training-360-one-release-20261117/u);
 assert.match(workflow,/20261117_m1_u72_prod_guarded_materialized_v1\.sql/u);
 assert.match(workflow,/src\/m26\/supabase-transport\.js/u);
 assert.match(workflow,/src\/m26\/app\/application\.js/u);
 assert.match(workflow,/src\/m26\/command-bus\.js/u);
 assert.match(workflow,/qa\/rc64\/build-authenticated-surface\.mjs/u);
 assert.match(workflow,/m26_p0_free_progress_ack_deferred_read_qa\.test\.mjs/u);
 assert.match(workflow,/github\.run_attempt == 1/u);
 assert.match(workflow,/github\.run_attempt == 2/u);
 assert.match(workflow,/environment: m26-canary-readonly/u);
 assert.doesNotMatch(workflow,/workflow_dispatch|SUPABASE_SERVICE_ROLE_KEY|IBERFIT_PROD_DATABASE_URL/u);
 assert.match(source,/proof\.status='QA_BROWSER_FIXTURE_READY'/u);
 assert.match(source,/proof\.status='QA_BROWSER_HOSTED_E2E_SUCCESS'/u);
 assert.match(source,/if\(mode==='verify-browser'\)return verifyBrowserWorkout\(ctx\)/u);
 assert.match(source,/currentSha\(ctx\)/u);
 assert.match(source,/original\.runId===ctx\.e\.GITHUB_RUN_ID/u);
 assert.match(policy,/allowQaSyntheticWrite\(request\)===true/u);
 assert.match(browser,/isQaScopedDatedSyntheticWrite\(request,f\)/u);
 assert.match(browser,/expect\(acks\)\.toEqual\(expected\)/u);
 assert.doesNotMatch(browser,/service_role|pjhmrhejsoofmouedavw/u);
});

test('U74 uses UTF-8 byte size, never character count, for synthetic progress writes',()=>{
 const unicode={...command,type:'OCURRENCIA_GUARDAR_PROGRESO',
  payload:{executionId:command.payload.executionId,executionBaseRevision:1,
   results:{observation:'á'.repeat(262200)},skippedSets:{}}};
 assert.equal(isQaScopedDatedSyntheticWrite(request(unicode),scoped),false);
});

test('U74 actual Real Training branch retains signed two-attempt QA boundaries',()=>{
 const wf=readFileSync('.github/workflows/u74-qa-dated-browser-e2e.yml','utf8');
 const js=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 assert.match(wf,/branches:\s*\n\s+- 'feat\/iberfit-real-training-360-20261114'\s*\n\s+- 'feat\/real-training-360-one-release-20261117'\s*\n\s+- 'canary\/rc74-4'/u);
 for(const attempt of [1,2])assert.ok(wf.includes('github.run_attempt == '+attempt));
 for(const action of ['preflight-browser','prepare-browser','verify-browser'])
   assert.ok(wf.includes('qa_u60_real_dated_journey.mjs '+action));
 assert.match(js,/BRANCH_HEAD_MOVED/u);
 assert.match(js,/'canary\/rc74-4'/u);
 assert.match(wf,/if:\s*\$\{\{ github\.run_attempt == 1 \}\}/u);
 assert.match(wf,/if:\s*\$\{\{ github\.run_attempt == 2 \}\}/u);
 assert.match(js,/PREFLIGHT_MISSING_STALE_OR_CHANGED/u);
 assert.match(js,/old\.sha===proof\.sha/u);
 assert.match(js,/old\.runId===proof\.runId/u);
 assert.match(js,/ENV_ISOLATION/u);
 assert.doesNotMatch(wf,/workflow_dispatch|SUPABASE_SERVICE_ROLE_KEY|pjhmrhejsoofmouedavw/u);
});

test('U74 persisted preflight binds same synthetic source, revision, SHA, run and date',()=>{
 const src=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 assert.match(src,/candidateId:plan\.chosen\.id,candidateRevision:plan\.chosen\.revision/u);
 assert.match(src,/UUID\.test\(original\.candidateId\)/u);
 assert.match(src,/old\.candidateId===proof\.candidateId/u);
 assert.match(src,/old\.candidateRevision===proof\.candidateRevision/u);
 assert.match(src,/selectCertifiedDatedCandidate\(candidates,old,today,future,certified\)/u);
 assert.match(src,/CERTIFIED_SOURCE_REVISION_CHANGED/u);
 assert.match(src,/CERTIFIED_SOURCE_DATES_OCCUPIED/u);
});


test('U74 one-PR authenticated no-cita browser workflow is strict branch and two-attempt signed',()=>{
 const wf=readFileSync('.github/workflows/u74-qa-dated-browser-e2e.yml','utf8');
 const code=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 const ui=readFileSync('qa/rc64/u74-dated-ui-write.spec.mjs','utf8');
 assert.ok(wf.includes('feat/m26-autonomous-dates-m44-one-prod-release-20261121')&&code.includes('feat/m26-autonomous-dates-m44-one-prod-release-20261121'));
 for(const marker of ['M26_QA_U74_AUTONOMOUS_NO_APPOINTMENT','github.run_attempt == 2','m26-canary-readonly']) assert.ok(wf.includes(marker));
 for(const marker of ['AUTONOMOUS_BRANCH_DENIED','MODE_EXPLICIT_REQUIRED','two_no_appointment_dates_persisted','AUTONOMOUS_PROOF_MODE_MISMATCH']) assert.ok(code.includes(marker));
 assert.ok(code.includes('?\[{localDate:today},{localDate:future,localTime:plan.time}]'.replace('\\[','[')));
 assert.ok(ui.includes('proof.fixture.appointmentless'));
 assert.doesNotMatch(wf,/workflow_dispatch|SUPABASE_SERVICE_ROLE_KEY|IBERFIT_PROD_DATABASE_URL/u);
});
