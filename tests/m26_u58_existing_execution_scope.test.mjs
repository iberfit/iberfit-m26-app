import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  createU58ExecutionScope,permittedU58ExecutionWrite,inspectU58CanonicalHistory,U58_EXISTING_QA_SESSION_TITLE,
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
    assert.equal(permittedU58ExecutionWrite(req(finish),state),true);
    assert.equal(permittedU58ExecutionWrite(req(finish),state),false);
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


test('U58 selectors must correspond to actual V3 live Client and confirmed-history markup',async()=>{
  const {readFile}=await import('node:fs/promises');
  const ui=await readFile(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');
  const history=await readFile(new URL('../src/m26/rc39/completed-session-history.js',import.meta.url),'utf8');
  const qa=await readFile(new URL('../qa/coach-webauthn-recurring/u58-existing-session-client.mjs',import.meta.url),'utf8');
  assert.match(ui,/data-session-action="complete-set"/u);
  assert.match(ui,/data-session-action="next"/u);
  assert.match(ui,/data-session-rest-focus/u);
  assert.match(ui,/data-session-live-state=/u);
  assert.match(history,/data-m43-session-history/u);
  assert.match(history,/data-m43-completed-session/u);
  assert.match(qa,/\[data-session-action="complete-set"\]/u);
  assert.match(qa,/\[data-session-action="next"\]/u);
  assert.doesNotMatch(qa,/data-session-focus-dock|m27-session-focus-primary/u,
    'Removed focus-dock selectors must never be reintroduced into the Client V3 QA path');
});

function canonical(id,status='completada',session=other){
  return {entityType:'session_execution',entityId:id,clientId,status,
    body:{id,status,clientId,sessionId:session}};
}
function legacy(id,status=null){
  return {id,revision:2,feedback:{},results:[],
    ...(status?{executionStatus:status}:{})};
}
function check(canonicalEntities,historicalExecutions){
  return inspectU58CanonicalHistory({canonicalEntities,historicalExecutions,
    clientId,sessionId});
}
test('U58S reconciles sanitized legacy history with terminal canonical statuses',()=>{
  const a=canonical(executionId,'completada');
  const b=canonical('66666666-6666-4666-8666-666666666666','cancelada');
  const r=check([a,b],[legacy(a.entityId),legacy(b.entityId)]);
  assert.equal(r.ok,true);
  assert.equal(r.canonicalCount,2);
  assert.equal(r.reconciledHistory,2);
  assert.equal(r.cancelledCount,1);
  assert.equal(check([],[]).ok,true,'A truly empty canonical and legacy history is valid');
});
test('U58S rejects target replay, unpaired legacy records and active executions',()=>{
  assert.equal(check([canonical(executionId,'completada',sessionId)],
    [legacy(executionId)]).reason,'U58_TARGET_SESSION_ALREADY_EXECUTED');
  assert.equal(check([],[legacy(executionId)]).reason,'U58_HISTORY_WITHOUT_CANONICAL_TERMINAL');
  assert.equal(check([canonical(executionId,'en_curso')],[legacy(executionId)]).reason,
    'U58_NONTERMINAL_CANONICAL_EXECUTION');
  assert.equal(check([canonical(executionId,'cierre_rechazado')],[legacy(executionId)]).ok,false,
    'A rejected close is not completed without canonical cancellation');
  assert.equal(check([canonical(executionId,'completada')],[]).ok,false,
    'Missing historical counterpart cannot be guessed away');
  assert.equal(check(null,[]).ok,false,'Absent canonical collection is not permission');
});
test('U58S refuses forged legacy completion and canonical identity mismatch',()=>{
  assert.equal(check([canonical(executionId,'cancelada')],[legacy(executionId,'cerrada_confirmada')]).ok,false);
  assert.equal(check([canonical(executionId,'completada')],[legacy(executionId,'cierre_rechazado')]).ok,false);
  assert.equal(check([canonical(executionId,'cancelada')],[legacy(executionId,'cierre_rechazado')]).ok,true);
  assert.equal(check([canonical(executionId,'completada')],[legacy(other)]).ok,false);
  assert.equal(check([canonical(executionId,'completada')],[legacy(executionId),legacy(executionId)]).ok,false);
  assert.equal(check([{...canonical(executionId,'completada'),clientId:other}],[legacy(executionId)]).ok,false);
  assert.equal(check([{...canonical(executionId,'completada'),body:{id:executionId,status:'en_curso',sessionId:other}}],[legacy(executionId)]).ok,false);
});
test('U58S one-shot only on trusted Canary first push and no raw history in assertion failures',async()=>{
  const {readFile}=await import('node:fs/promises');
  const workflow=await readFile(new URL('../.github/workflows/coach-webauthn-recurring.yml',import.meta.url),'utf8');
  const helper=await readFile(new URL('../qa/coach-webauthn-recurring/u58-existing-session-client.mjs',import.meta.url),'utf8');
  assert.match(workflow,/startsWith\(github\.event\.head_commit\.message, 'SIGNATURE U58S:'\)/u);
  assert.match(workflow,/github\.run_attempt == 1/u);
  assert.match(helper,/inspectU58CanonicalHistory/u);
  assert.doesNotMatch(helper,/expect\(liveLocks|expect\(already/u);
});
