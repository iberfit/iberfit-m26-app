import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCompletedHistoryForClient} from '../src/m26/domain/client-completed-history-merge.js';
const clientId='00000000-0000-4000-8000-000000000001',userId='00000000-0000-4000-8000-000000000002';
const record='00000000-0000-4000-8000-000000000003';
function state(){return {identity:{id:userId,clientId,role:'client'},
 hydration:{status:'ready',confirmedAt:'2026-10-31T03:00:00Z'},
 lastAck:null,collections:{sessions:[],sessionExecutions:[],trainingCycles:[]}};}
function session(){return {entityType:'session',entityId:record,clientId,status:'completada',revision:1,
 updatedAt:'2026-10-31T02:59:00Z',body:{id:record,clientId,status:'completada',revision:1,
 title:'Sesión confirmada',visibleToClient:true,blocks:[{id:'b1',type:'strength',sets:3,reps:8}]}};}
test('merge keeps completed Client session from authenticated QA safe projection',()=>{
 const s=state(),result=projectCompletedHistoryForClient({
 state:s,ownerId:userId,clientId,confirmedAt:s.hydration.confirmedAt,lastAck:null,sections:{session:[session()]}});
 assert.equal(result.sessions.length,1);
 assert.equal(result.sessions[0].id,record);
 assert.equal(result.sessions[0].title,'Sesión confirmada');
 assert.equal(s.collections.sessions.length,0); // pure
 assert.equal(Object.prototype.hasOwnProperty.call(result.sessions[0],'body'),false);
});
test('account switch, refresh or ACK change invalidates a previous history load',()=>{
 const s=state();const q={state:s,ownerId:userId,clientId,confirmedAt:s.hydration.confirmedAt,lastAck:null,sections:{session:[session()]}};
 assert.throws(()=>projectCompletedHistoryForClient({...q,clientId:'other'}),/HYDRATION_OR_OWNER_CHANGED/);
 assert.throws(()=>projectCompletedHistoryForClient({...q,confirmedAt:'2026-10-31T03:05:00Z'}),/HYDRATION_OR_OWNER_CHANGED/);
 s.lastAck={revision:1};
 assert.throws(()=>projectCompletedHistoryForClient(q),/HYDRATION_OR_OWNER_CHANGED/);
});
test('raw cross-client record is never introduced into hydrated collection',()=>{
 const s=state(),foreign={...session(),clientId:'00000000-0000-4000-8000-000000000004'};
 assert.throws(()=>projectCompletedHistoryForClient({state:s,ownerId:userId,clientId,
 confirmedAt:s.hydration.confirmedAt,sections:{session:[foreign]}}),/ROW_OWNER_INVALID/);
});

test('explicit completed-history commit restores execution results and preserves Client privacy',()=>{
 const s=state(),executionId='00000000-0000-4000-8000-000000000004';
 const execution={entityType:'session_execution',entityId:executionId,clientId,
  status:'completada',revision:4,updatedAt:'2026-10-31T02:59:01Z',
  body:{id:executionId,clientId,sessionId:record,revision:4,status:'completada',
   results:[{setIndex:1,reps:8,loadKg:22,rpe:7,coachPrivateNote:'DO_NOT_EXPOSE'}],
   feedback:{sessionRpe:7,coachPrivateNote:'DO_NOT_EXPOSE'}}};
 const before=JSON.stringify(s.collections);
 const projected=projectCompletedHistoryForClient({state:s,ownerId:userId,clientId,
  confirmedAt:s.hydration.confirmedAt,lastAck:null,
  sections:{session:[session()],session_execution:[execution]}});
 assert.equal(JSON.stringify(s.collections),before,'pure projection until final atomic commit');
 assert.equal(projected.sessions.length,1);
 assert.equal(projected.sessionExecutions.length,1);
 assert.equal(projected.sessionExecutions[0].sessionId,record);
 assert.equal(projected.sessionExecutions[0].results[0].reps,8);
 assert.equal(projected.sessionExecutions[0].results[0].loadKg,22);
 assert.equal(projected.sessionExecutions[0].feedback.sessionRpe,7);
 assert.doesNotMatch(JSON.stringify(projected),/DO_NOT_EXPOSE|coachPrivateNote/);
});
test('execution history from another Client cannot be committed even if the session belongs to the owner',()=>{
 const s=state(),foreign='00000000-0000-4000-8000-000000000005';
 const execution={entityType:'session_execution',entityId:'00000000-0000-4000-8000-000000000004',
  clientId:foreign,status:'completada',revision:4,updatedAt:'2026-10-31T02:59:01Z',
  body:{id:'00000000-0000-4000-8000-000000000004',clientId:foreign,revision:4,status:'completada',results:[]}};
 assert.throws(()=>projectCompletedHistoryForClient({state:s,ownerId:userId,clientId,
  confirmedAt:s.hydration.confirmedAt,lastAck:null,
  sections:{session:[session()],session_execution:[execution]}}),/ROW_OWNER_INVALID/);
 assert.equal(s.collections.sessionExecutions.length,0);
});
