import test from 'node:test';
import assert from 'node:assert/strict';
import {newU47Scope,u47WriteAuthorized} from '../qa/coach-webauthn-recurring/u47-running-policy.mjs';
const ID='4d244c01-8966-40f1-8cc7-9e6ec46d1708';
const CLIENT='10000000-0000-4000-8000-000000000471';
const EXEC='30000000-0000-4000-8000-000000000473';
const TITLE='QA U47 · Running 40738135729-1';
const old=process.env.M26_QA_U48_RUNNING;process.env.M26_QA_U48_RUNNING='true';
process.on('exit',()=>{if(old===undefined)delete process.env.M26_QA_U48_RUNNING;else process.env.M26_QA_U48_RUNNING=old});
const cmd=(type='SESION_INICIAR')=>({type,operationId:'50000000-0000-4000-8000-000000000001',
  entityType:'session',entityId:ID,clientId:CLIENT,baseRevision:2,payload:{executionId:EXEC}});
const req=(x,origin='https://gjztkdwfmunnzhtvxrsu.supabase.co')=>({
 method:()=> 'POST',headers:()=>({authorization:'Bearer qa.synthetic.jwt'}),
 url:()=>origin+'/rest/v1/rpc/iberfit_execute_command_v26',
 postDataJSON:()=>({p_command:x}),
});
const scope=()=>Object.assign(newU47Scope({stage:'execute',clientId:CLIENT,title:TITLE}),
 {sessionId:ID,serverPublicationConfirmed:true,historyClean:true,enabled:true});
test('U48 one-shot flag cannot publish or mutate any other QA prescription',()=>{
 const s=scope();
 assert.equal(u47WriteAuthorized(req({...cmd(),type:'SESION_PUBLICAR'}),s),false);
 assert.equal(u47WriteAuthorized(req({...cmd(),entityId:EXEC}),s),false);
 assert.equal(u47WriteAuthorized(req(cmd(),'https://pjhmrhejsoofmouedavw.supabase.co'),s),false);
 assert.equal(s.uniqueByOperation.size,0);
});
test('U48 cannot start the already ACKed running a second time',()=>{
 const s=scope();
 const foreign=scope();foreign.sessionId=EXEC;
 assert.equal(u47WriteAuthorized(req(cmd()),foreign),false);
 const withCita=cmd();withCita.payload.appointmentId=EXEC;
 assert.equal(u47WriteAuthorized(req(withCita),s),false);
 assert.equal(u47WriteAuthorized(req(cmd()),s),false);
 assert.equal(u47WriteAuthorized(req({...cmd(),operationId:'50000000-0000-4000-8000-000000000002'}),s),false);
 assert.equal(s.executionId,null);
 assert.equal(s.uniqueByOperation.size,0);
 assert.equal(s.typeCounts.get('SESION_INICIAR')||0,0);
});
test('U48 may only continue the verified existing execution ID, not a new or foreign one',()=>{
 const s=scope();
 s.executionId=EXEC; // Only after independent authoritative bootstrap/DB validation.
 const progress={...cmd('EJECUCION_GUARDAR_PROGRESO'),entityType:'session_execution',
   entityId:EXEC,baseRevision:1,operationId:'50000000-0000-4000-8000-000000000031',
   payload:{progressSnapshot:{sessionId:ID,clientId:CLIENT}}};
 assert.equal(u47WriteAuthorized(req(progress),s),true);
 assert.equal(u47WriteAuthorized(req({...progress,operationId:'50000000-0000-4000-8000-000000000032',entityId:ID}),s),false);
 assert.equal(u47WriteAuthorized(req({...progress,operationId:'50000000-0000-4000-8000-000000000033',payload:{progressSnapshot:{sessionId:ID,clientId:EXEC}}}),s),false);
 assert.equal(s.typeCounts.get('EJECUCION_GUARDAR_PROGRESO'),1);
 assert.equal(s.typeCounts.get('SESION_INICIAR')||0,0);
});
test('U48 never permits non-first protected runs without explicit flag',()=>{
 const s=scope();
 process.env.M26_QA_U48_RUNNING='false';
 assert.equal(u47WriteAuthorized(req(cmd()),s),false);
 process.env.M26_QA_U48_RUNNING='true';
});


test('U48 Coach readback is sequenced before U55 offline builder with no secondary Coach publication',async()=>{
 const fs=await import('node:fs');
 const spec=fs.readFileSync(new URL('../qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs',import.meta.url),'utf8');
 const recovery=fs.readFileSync(new URL('../qa/coach-webauthn-recurring/u48-running-recovery.mjs',import.meta.url),'utf8');
 assert.ok(spec.indexOf("await certifyU48ExistingRunning({browser")>0);
 assert.ok(spec.indexOf("await certifyU48ExistingRunning({browser")<spec.indexOf('u56Scope.title=await certifyOfflineCoachAuthoring('));
 assert.match(recovery,/data-coach-client-workspace/);
 assert.match(recovery,/independentCoachMfaReadback:true/);
 assert.doesNotMatch(recovery,/SESION_PUBLICAR/);
});
