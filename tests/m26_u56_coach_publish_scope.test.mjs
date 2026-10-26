import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedU56SyntheticWrite} from '../qa/coach-webauthn-recurring/u56-qa-publish.mjs';

const CLIENT='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const SESSION='33333333-3333-4333-8333-333333333333';
const OP='44444444-4444-4444-8444-444444444444';
const TITLE='QA U56 · Coach UI 123456-1';
const ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const scope=()=>({enabled:true,clientId:CLIENT,title:TITLE});
const command=()=>({
  type:'SESION_PUBLICAR',entityType:'session',entityId:SESSION,
  operationId:OP,clientId:CLIENT,baseRevision:0,previewAccepted:true,
  payload:{patch:{id:SESSION,clientId:CLIENT,title:TITLE,visibleToClient:true,
    deliveryModality:'guiada_en_app',blocks:[{type:'exercise'},{type:'exercise'}]}},
});
function request(rpc,body,{method='POST',origin=ORIGIN,token='Bearer qa.mock-token'}={}){
  return {method:()=>method,url:()=>origin+'/rest/v1/rpc/'+rpc,
    postDataJSON:()=>body,headers:()=>({authorization:token})};
}
const checked=(cmd=command())=>request('iberfit_command_preflight_v26',{p_command:cmd});
const executed=(cmd=command())=>request('iberfit_execute_command_v26',{p_command:cmd});

test('U56 synthetic write must remain disabled without exact trusted opt-in',()=>{
  const previous=process.env.M26_QA_U56_PUBLISH;
  try{
    delete process.env.M26_QA_U56_PUBLISH;
    assert.equal(allowedU56SyntheticWrite(checked(),scope()),false);
    process.env.M26_QA_U56_PUBLISH='true';
    assert.equal(allowedU56SyntheticWrite(checked(),{...scope(),enabled:false}),false);
  }finally{
    if(previous===undefined)delete process.env.M26_QA_U56_PUBLISH;
    else process.env.M26_QA_U56_PUBLISH=previous;
  }
});

test('U56 authorizes one scoped preflight and one exact command, never a second session',()=>{
  const previous=process.env.M26_QA_U56_PUBLISH;
  try{
    process.env.M26_QA_U56_PUBLISH='true';
    const state=scope(),cmd=command();
    assert.equal(allowedU56SyntheticWrite(checked(cmd),state),true);
    assert.equal(state.sessionId,SESSION);
    assert.equal(allowedU56SyntheticWrite(executed(cmd),state),true);
    assert.equal(state.preflights,1);
    assert.equal(state.executions,1);
    const second={...cmd,entityId:OTHER,payload:{patch:{...cmd.payload.patch,id:OTHER}}};
    assert.equal(allowedU56SyntheticWrite(checked(second),state),false);
    assert.equal(allowedU56SyntheticWrite(executed({...cmd,operationId:OTHER}),state),false);
  }finally{
    if(previous===undefined)delete process.env.M26_QA_U56_PUBLISH;
    else process.env.M26_QA_U56_PUBLISH=previous;
  }
});

test('U56 rejects foreign clients, wrong endpoints, scope escalation and unrelated writes',()=>{
  const previous=process.env.M26_QA_U56_PUBLISH;
  try{
    process.env.M26_QA_U56_PUBLISH='true';
    const cases=[
      checked({...command(),clientId:OTHER}),
      checked({...command(),previewAccepted:false}),
      checked({...command(),type:'SESION_HABILITAR'}),
      checked({...command(),baseRevision:100}),
      checked({...command(),payload:{patch:{...command().payload.patch,title:'Other'}}}),
      checked({...command(),payload:{patch:{...command().payload.patch,blocks:[]}}}),
      request('iberfit_execute_command_v26',{p_command:command()},{method:'GET'}),
      request('iberfit_execute_command_v26',{p_command:command()},{origin:'https://pjhmrhejsoofmouedavw.supabase.co'}),
      request('iberfit_execute_command_v26',{p_command:command()},{token:'Bearer service_role'}),
      request('unexpected_rpc',{p_command:command()}),
    ];
    for(const candidate of cases)assert.equal(allowedU56SyntheticWrite(candidate,scope()),false);
    assert.equal(allowedU56SyntheticWrite(
      request('m26_draft_upsert_v431',{p_payload:{clientId:OTHER,scope:'session-builder',
        draft:{clientId:OTHER,title:TITLE}}}),scope()),false);
    assert.equal(allowedU56SyntheticWrite(
      request('m26_draft_delete_v431',{p_client_id:OTHER,p_scope:'session-builder'}),scope()),false);
    assert.equal(allowedU56SyntheticWrite(
      request('m26_draft_upsert_v431',{p_payload:{clientId:CLIENT,scope:'session-builder',
        draft:{clientId:CLIENT,title:TITLE}}}),scope()),true);
  }finally{
    if(previous===undefined)delete process.env.M26_QA_U56_PUBLISH;
    else process.env.M26_QA_U56_PUBLISH=previous;
  }
});
