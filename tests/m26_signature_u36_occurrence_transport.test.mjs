import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createM26Transport,M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN,
} from '../src/m26/supabase-transport.js';

const cid='10000000-0000-4000-8000-000000000101';
const sid='10000000-0000-4000-8000-000000000102';
const oid='10000000-0000-4000-8000-000000000103';
const requestLog=[];
let responseBody;
const transport=createM26Transport({
  enabled:true,qaOnly:true,projectRef:M26_QA_PROJECT_REF,
  url:M26_QA_SUPABASE_ORIGIN,publishableKey:'pk_fake_for_contract_test',version:'qa-u36',
  timeoutMs:12000,
},{
  fetchImpl:async (url,opts)=>{
    requestLog.push({url,opts,body:JSON.parse(opts.body)});
    return {
      ok:true,status:200,headers:{get:()=> 'application/json'},
      json:async()=>responseBody,
    };
  },
});

test('U36 transport remains inert until explicitly invoked, uses exact QA URL and bearer JWT',async()=>{
  assert.equal(requestLog.length,0);
  responseBody={kind:'calendar',clientId:cid,count:0,hasMore:false,occurrences:[],nextCursor:null};
  const result=await transport.occurrenceCalendar('qa_signed_jwt',{
    clientId:cid,startDate:'2026-10-25',endDate:'2026-11-15',limit:50,
  });
  assert.equal(result.count,0);
  assert.equal(requestLog.length,1);
  assert.equal(requestLog[0].url,M26_QA_SUPABASE_ORIGIN+'/rest/v1/rpc/iberfit_occurrence_api_v1');
  assert.equal(requestLog[0].opts.headers.authorization,'Bearer qa_signed_jwt');
  assert.equal(requestLog[0].body.p_action,'CALENDARIO');
  assert.equal(requestLog[0].body.p_payload.clientId,cid);
  await assert.rejects(transport.occurrenceCalendar(null,{clientId:cid}),
    /M26_AUTH_REQUIRED/);
  await assert.rejects(transport.occurrenceCalendar('jwt',{clientId:cid,role:'admin'}),
    /M26_OCCURRENCE_CALENDAR_FILTER_INVALID/);
  assert.equal(requestLog.length,1,'invalid or unauthenticated read never sends HTTP');
});

test('U36 writes never silently fall back to legacy commands or retry on their own',async()=>{
  const cmd={type:'OCURRENCIA_CONFIRMAR',operationId:oid,clientId:cid,
    entityId:sid,baseRevision:0};
  responseBody={kind:'ack',operationId:oid,entityId:sid,remoteRevision:1};
  const before=requestLog.length;
  const response=await transport.occurrenceCommand('qa_signed_jwt',cmd);
  assert.equal(response.kind,'ack');
  assert.equal(requestLog.length,before+1);
  assert.equal(requestLog.at(-1).body.p_action,'TRANSICION');
  assert.equal(requestLog.at(-1).body.p_payload.entityId,sid);
  await assert.rejects(transport.occurrenceCommand('qa_signed_jwt',{
    ...cmd,type:'SESION_INICIAR',
  }),/M26_OCCURRENCE_COMMAND_FORBIDDEN/);
  await assert.rejects(transport.occurrenceCommand('qa_signed_jwt',{
    ...cmd,operationId:'not-a-uuid',
  }),/M26_OCCURRENCE_COMMAND_INVALID/);
  assert.equal(requestLog.length,before+1,'invalid commands never cause HTTP side effects');
});

test('U36 Client calendar refuses malformed projections instead of inventing optimistic results',async()=>{
  responseBody={kind:'calendar',count:2,hasMore:false,occurrences:[]};
  await assert.rejects(transport.occurrenceCalendar('qa_signed_jwt',{
    clientId:cid,startDate:'2026-10-25',endDate:'2026-11-15',
  }),/M26_OCCURRENCE_CALENDAR_RESPONSE_INVALID/);
});
