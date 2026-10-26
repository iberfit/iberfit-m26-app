import test from 'node:test';
import assert from 'node:assert/strict';
import {createOccurrenceCoordinator} from '../src/m26/workflows/occurrence-coordinator.js';
import {buildOccurrenceScopedCommand} from '../src/m26/domain/occurrence-commands.js';

const COACH='10000000-0000-4000-8000-000000000100';
const CLIENT_USER='10000000-0000-4000-8000-000000000101';
const CLIENT='10000000-0000-4000-8000-000000000102';
const OTHER='10000000-0000-4000-8000-000000000103';
const SESSION='10000000-0000-4000-8000-000000000104';
const A='10000000-0000-4000-8000-000000000105';
const B='10000000-0000-4000-8000-000000000106';
const OP='10000000-0000-4000-8000-000000000107';
let actor={userId:COACH,role:'coach',accessToken:'jwt'};
const make=({transport,enabled=true,maxPages=12}={})=>
  createOccurrenceCoordinator({transport,getAuthContext:async()=>actor,enabled,maxPages});
const cmd=(type='OCURRENCIA_CONFIRMAR',o=A,op=OP)=>
  buildOccurrenceScopedCommand({
    type,operationId:op,clientId:CLIENT,occurrenceId:o,
    baseRevision:0,
  });
const item=(id,localDate='2026-10-27',extra={})=>({
  id,sessionId:SESSION,clientId:CLIENT,appointmentId:A,localDate,
  revision:1,status:'confirmada',...extra,
});
const noop={occurrenceCalendar:async()=>{},occurrenceCommand:async()=>{}};

test('U40 is dormant by default; no RPC traffic without explicit opt-in',async()=>{
  let calls=0;
  const svc=createOccurrenceCoordinator({transport:{
    occurrenceCalendar:async()=>{calls++;},
    occurrenceCommand:async()=>{calls++;},
  },getAuthContext:async()=>actor});
  await assert.rejects(svc.calendar({
    clientId:CLIENT,startDate:'2026-10-25',endDate:'2026-11-01',
  }),/U40_API_NOT_ENABLED/);
  await assert.rejects(svc.send(cmd()),/U40_API_NOT_ENABLED/);
  assert.equal(calls,0);
});

test('U40 server-paginated calendar aggregates only scoped, ordered records',async()=>{
  actor={userId:COACH,role:'coach',accessToken:'jwt'};
  const q=[];
  const svc=make({transport:{...noop,occurrenceCalendar:async(token,query)=>{
    q.push({token,query});
    return q.length===1
      ?{kind:'calendar',clientId:CLIENT,count:1,hasMore:true,
        nextCursor:{localDate:'2026-10-27',id:A},occurrences:[item(A)]}
      :{kind:'calendar',clientId:CLIENT,count:1,hasMore:false,
        nextCursor:null,occurrences:[item(B,'2026-10-28')]};
  }}});
  const data=await svc.calendar({
    clientId:CLIENT,startDate:'2026-10-25',endDate:'2026-11-20',limit:3,
  });
  assert.equal(data.count,2);
  assert.equal(data.timeZone,'America/Santiago');
  assert.deepEqual(q[1].query.afterDate,'2026-10-27');
  assert.deepEqual(q[1].query.afterId,A);
  assert.ok(Object.isFrozen(data.occurrences)&&Object.isFrozen(data.occurrences[0]));
});

test('U40 rejects private rows, cross-client reads and cursor replay',async()=>{
  actor={userId:CLIENT_USER,role:'cliente',clientId:CLIENT,accessToken:'jwt'};
  let calls=0;
  const rpc={...noop,occurrenceCalendar:async()=>{
    calls++;return {kind:'calendar',clientId:CLIENT,count:1,
      hasMore:false,occurrences:[item(A,undefined,{prescriptionSnapshot:{secret:1}})]};
  }};
  const svc=make({transport:rpc});
  await assert.rejects(svc.calendar({
    clientId:OTHER,startDate:'2026-10-25',endDate:'2026-11-01',
  }),/U40_CLIENT_SCOPE_FORBIDDEN/);
  assert.equal(calls,0);
  await assert.rejects(svc.calendar({
    clientId:CLIENT,startDate:'2026-10-25',endDate:'2026-11-01',
  }),/U40_CALENDAR_PRIVATE_DATA/);
  const repeat=make({transport:{...noop,occurrenceCalendar:async()=>({
    kind:'calendar',clientId:CLIENT,count:1,hasMore:true,
    nextCursor:{localDate:'2026-10-27',id:A},occurrences:[item(A)],
  })}});
  await assert.rejects(repeat.calendar({
    clientId:CLIENT,startDate:'2026-10-25',endDate:'2026-11-01',
  }),/U40_CALENDAR_CURSOR_INVALID/);
  const proposal=make({transport:{...noop,occurrenceCalendar:async()=>({
    kind:'calendar',clientId:CLIENT,count:1,hasMore:false,
    occurrences:[item(A,undefined,{status:'planificada'})],
  })}});
  await assert.rejects(proposal.calendar({
    clientId:CLIENT,startDate:'2026-10-25',endDate:'2026-11-01',
  }),/U40_CLIENT_CALENDAR_PRIVACY_DRIFT/);
});

test('U40 confirms only validated ACKs; no new start IDs on an uncertain write',async()=>{
  actor={userId:COACH,role:'coach',accessToken:'jwt'};
  let sends=0,failFirst=true,lastCommand;
  const svc=make({transport:{...noop,occurrenceCommand:async(token,command)=>{
    sends++;lastCommand=command;
    if(failFirst){failFirst=false;throw new Error('network_cut_after_commit_unknown');}
    return {kind:'ack',operationId:command.operationId,entityId:command.entityId,
      remoteRevision:1,duplicate:true};
  }}});
  await assert.rejects(svc.send(cmd()),/network_cut/);
  assert.equal(await svc.hasUncertain({clientId:CLIENT,occurrenceId:A}),true);
  await assert.rejects(svc.send(cmd('OCURRENCIA_CONFIRMAR',A,B)),
    /U40_UNCERTAIN_COMMAND_REQUIRES_RECONCILIATION/);
  assert.equal(sends,1);
  const result=await svc.retryUncertain({clientId:CLIENT,occurrenceId:A});
  assert.equal(sends,2);
  assert.equal(result.kind,'ack');
  assert.equal(result.duplicate,true);
  assert.equal(lastCommand.operationId,OP,'retry uses exact same operationId');
  assert.equal(await svc.hasUncertain({clientId:CLIENT,occurrenceId:A}),false);
});

test('U40 authorization changes, corrupted ACKs and conflict need deliberate recovery',async()=>{
  actor={userId:CLIENT_USER,role:'cliente',clientId:CLIENT,accessToken:'jwt'};
  const svc=make({transport:{...noop,occurrenceCommand:async()=>{
    actor={userId:COACH,role:'coach',accessToken:'different'};
    return {kind:'ack',operationId:OP,entityId:A,remoteRevision:1};
  }}});
  assert.throws(()=>cmd('OCURRENCIA_INICIAR',A,OP),/U39_INVALID_UUID/);
  const valid=buildOccurrenceScopedCommand({
    type:'OCURRENCIA_INICIAR',operationId:OP,clientId:CLIENT,
    occurrenceId:A,baseRevision:0,executionId:B,
  });
  await assert.rejects(svc.send(valid),/U40_AUTH_IDENTITY_CHANGED/);
  actor={userId:CLIENT_USER,role:'cliente',clientId:CLIENT,accessToken:'jwt'};
  assert.equal(await svc.hasUncertain({clientId:CLIENT,occurrenceId:A}),true);
  await assert.rejects(svc.send(cmd('OCURRENCIA_CANCELAR')),/U40_ACTOR_NOT_ALLOWED/);
  const rejected=make({transport:{...noop,occurrenceCommand:async()=>({
    kind:'conflict',reason:'REVISION_MISMATCH',operationId:OP,remoteRevision:5,
  })}});
  const result=await rejected.send(cmd());
  assert.equal(result.kind,'conflict');
});

test('U40 rejects canonical mutation and duplicate operation UUID with changed payload',async()=>{
  actor={userId:COACH,role:'coach',accessToken:'jwt'};
  const svc=make({transport:{...noop,occurrenceCommand:async(_token,c)=>({
    kind:'ack',operationId:c.operationId,entityId:c.entityId,remoteRevision:1,
  })}});
  await assert.rejects(svc.send({
    ...cmd(),payload:{},type:'SESION_INICIAR',
  }),/U40_LEGACY_COMMAND_FORBIDDEN/);
  await assert.rejects(svc.send({...cmd(),payload:{role:'admin'}}),
    /U40_INVALID_COMMAND_PAYLOAD/);
  await svc.send(cmd());
  await assert.rejects(svc.send(cmd('OCURRENCIA_CONFIRMAR',B,OP)),
    /U40_OPERATION_ID_REUSED/);
});
