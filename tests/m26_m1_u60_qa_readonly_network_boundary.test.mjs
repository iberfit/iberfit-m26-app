import test from 'node:test';
import assert from 'node:assert/strict';
import {isQaReadonlyDatedRequest} from '../qa/rc64/secure-current-source-auth.mjs';
const id='10000000-0000-4000-8000-000000000001';
const oid='20000000-0000-4000-8000-000000000001';
function req(body,method='POST'){
  return {method:()=>method,postDataJSON:()=>body};
}
const calendar={p_action:'CALENDARIO',
  p_payload:{clientId:id,startDate:'2026-11-11',endDate:'2026-11-22',limit:50}};
test('U60 visual QA network gate allows only bounded read-only calendar queries',()=>{
  assert.equal(isQaReadonlyDatedRequest(req(calendar),'iberfit_occurrence_api_u60_v1'),true);
  for(const p_action of ['TRANSICION','CAMBIO','CREAR_LOTE','OCURRENCIA_INICIAR']){
    assert.equal(isQaReadonlyDatedRequest(req({...calendar,p_action}),'iberfit_occurrence_api_u60_v1'),false);
  }
  for(const payload of [
    {...calendar.p_payload,limit:101},
    {...calendar.p_payload,clientId:'bad'},
    {...calendar.p_payload,startDate:'2026-12-03'},
    {...calendar.p_payload,extra:'danger'},
  ])assert.equal(isQaReadonlyDatedRequest(req({...calendar,p_payload:payload}),'iberfit_occurrence_api_u60_v1'),false);
  assert.equal(isQaReadonlyDatedRequest(req(calendar,'GET'),'iberfit_occurrence_api_u60_v1'),false);
});
test('U60 visual QA may read private owner ID but cannot issue arbitrary RPC or malformed detail',()=>{
  const detail={p_client_id:id,p_occurrence_id:oid};
  assert.equal(isQaReadonlyDatedRequest(req(detail),'iberfit_occurrence_detail_v1'),true);
  for(const body of [
    {...detail,p_action:'TRANSICION'}, {p_client_id:'bad',p_occurrence_id:oid},
    {p_client_id:id},{...detail,p_occurrence_id:5},
  ])assert.equal(isQaReadonlyDatedRequest(req(body),'iberfit_occurrence_detail_v1'),false);
  assert.equal(isQaReadonlyDatedRequest(req(detail),'iberfit_execute_command_v26'),false);
  assert.equal(isQaReadonlyDatedRequest({method:()=> 'POST',postDataJSON:()=>{throw Error('bad');}},'iberfit_occurrence_detail_v1'),false);
});
