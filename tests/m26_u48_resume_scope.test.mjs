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
test('U48 resumed existing running requires exact verified scope and no invented appointment',()=>{
 const s=scope();
 const foreign=scope();foreign.sessionId=EXEC;
 assert.equal(u47WriteAuthorized(req(cmd()),foreign),false);
 const withCita=cmd();withCita.payload.appointmentId=EXEC;
 assert.equal(u47WriteAuthorized(req(withCita),s),false);
 assert.equal(u47WriteAuthorized(req(cmd()),s),true);
 assert.equal(u47WriteAuthorized(req({...cmd(),operationId:'50000000-0000-4000-8000-000000000002'}),s),false);
 assert.equal(s.executionId,EXEC);
});
test('U48 never permits non-first protected runs without explicit flag',()=>{
 const s=scope();
 process.env.M26_QA_U48_RUNNING='false';
 assert.equal(u47WriteAuthorized(req(cmd()),s),false);
 process.env.M26_QA_U48_RUNNING='true';
});
