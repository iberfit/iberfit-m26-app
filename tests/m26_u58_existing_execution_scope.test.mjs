import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  createU58ExecutionScope,permittedU58ExecutionWrite,U58_EXISTING_QA_SESSION_TITLE,
} from '../qa/coach-webauthn-recurring/u58-execution-policy.mjs';

const clientId='11111111-1111-4111-8111-111111111111';
const sessionId='22222222-2222-4222-8222-222222222222';
const executionId='33333333-3333-4333-8333-333333333333';
const other='44444444-4444-4444-8444-444444444444';
const operationId='55555555-5555-4555-8555-555555555555';
const ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
function scope(){return createU58ExecutionScope({
  clientId,sessionId,sessionTitle:U58_EXISTING_QA_SESSION_TITLE,
  confirmedNoPriorExecution:true,
});}
function command(type='SESION_INICIAR',id=operationId){
  return {type,clientId,operationId:id,entityType:type==='SESION_INICIAR'?'session':'session_execution',
    entityId:type==='SESION_INICIAR'?sessionId:executionId,baseRevision:2,
    payload:type==='SESION_INICIAR'?{executionId}:{}};
}
function req(cmd,options={}){
  return {url:()=>String(options.origin||ORIGIN)+
    '/rest/v1/rpc/'+(options.rpc||'iberfit_execute_command_v26'),
    method:()=>options.method||'POST',postDataJSON:()=>({p_command:cmd}),
    headers:()=>({authorization:options.auth||'Bearer synthetic.access-token'})};
}
function withFlag(fn){
  const old=process.env.M26_QA_U58_EXECUTE;
  try{process.env.M26_QA_U58_EXECUTE='true';fn();}
  finally{
    if(old===undefined)delete process.env.M26_QA_U58_EXECUTE;
    else process.env.M26_QA_U58_EXECUTE=old;
  }
}
test('U58 defaults fail closed; exact verified QA fixture required',()=>{
  assert.throws(()=>createU58ExecutionScope({
    clientId,sessionId,sessionTitle:'Otro entrenamiento',confirmedNoPriorExecution:true,
  }),/U58_FIXTURE_UNVERIFIED/);
  assert.throws(()=>createU58ExecutionScope({
    clientId,sessionId,sessionTitle:U58_EXISTING_QA_SESSION_TITLE,
    confirmedNoPriorExecution:false,
  }),/U58_FIXTURE_UNVERIFIED/);
  const state=scope();
  const old=process.env.M26_QA_U58_EXECUTE;
  try{
    delete process.env.M26_QA_U58_EXECUTE;
    assert.equal(permittedU58ExecutionWrite(req(command()),{...state,enabled:true}),false);
    process.env.M26_QA_U58_EXECUTE='true';
    assert.equal(permittedU58ExecutionWrite(req(command()),state),false);
  }finally{
    if(old===undefined)delete process.env.M26_QA_U58_EXECUTE;
    else process.env.M26_QA_U58_EXECUTE=old;
  }
});
test('U58 accepts one start, idempotent replay and four separately observed results',()=>{
  withFlag(()=>{
    const state=scope();state.enabled=true;
    assert.equal(permittedU58ExecutionWrite(req(command()),state),true);
    assert.equal(permittedU58ExecutionWrite(req(command(),{rpc:'iberfit_command_preflight_v26'}),state),true);
    assert.equal(permittedU58ExecutionWrite(req(command()),state),true);
    assert.equal(permittedU58ExecutionWrite(req(command()),state),false);
    assert.equal(permittedU58ExecutionWrite(req(command('SESION_INICIAR',other)),state),false);
    const save=command('EJECUCION_GUARDAR_PROGRESO',other);
    assert.equal(permittedU58ExecutionWrite(req(save),state),true);
    assert.equal(permittedU58ExecutionWrite(req({...save,baseRevision:3}),state),false);
    const finish=command('EJECUCION_COMPLETAR','66666666-6666-4666-8666-666666666666');
    assert.equal(permittedU58ExecutionWrite(req(finish),state),false);
    state.reviewedFourSets=true;
    assert.equal(permittedU58ExecutionWrite(req(finish),state),true);
    assert.equal(state.finished,true);
    assert.equal(permittedU58ExecutionWrite(req(
      command('EJECUCION_GUARDAR_PROGRESO','77777777-7777-4777-8777-777777777777'),
    ),state),false);
  });
});
test('U58 blocks foreign clients, production origin, wrong execution and arbitrary RPCs',()=>{
  withFlag(()=>{
    const s=scope();s.enabled=true;
    const cmd=command();
    for(const bad of [
      req({...cmd,clientId:other}),
      req({...cmd,entityId:other}),
      req({...cmd,payload:{executionId:other}},{origin:'https://pjhmrhejsoofmouedavw.supabase.co'}),
      req(cmd,{origin:'https://pjhmrhejsoofmouedavw.supabase.co'}),
      req(cmd,{auth:'Bearer service_role'}),
      req(cmd,{method:'GET'}),
      req(cmd,{rpc:'any_unapproved_rpc'}),
    ])assert.equal(permittedU58ExecutionWrite(bad,s),false);
    assert.equal(s.typeCounts.size,0);
    assert.equal(permittedU58ExecutionWrite(req(cmd),s),true);
    assert.equal(permittedU58ExecutionWrite(req(
      {...command('EJECUCION_PAUSAR',other),entityId:other},
    ),s),false);
  });
});
