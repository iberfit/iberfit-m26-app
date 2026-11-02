import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCanonicalTrainingCollections} from '../src/m26/domain/canonical-training-collections.js';

// The test works only with synthetic client IDs. The source RPC must still
// filter owner, role and revision on the server before emitting {id} rows.
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const S1='00000000-0000-4000-8000-000000000011';
const S2='00000000-0000-4000-8000-000000000012';
const E1='00000000-0000-4000-8000-000000000013';
const P1='00000000-0000-4000-8000-000000000014';
const now='2026-10-31T12:00:00Z';
const sessionBody=(id,title)=>({id,clientId:A,status:'completada',revision:4,title,
  visibleToClient:true,blocks:[{id:'bloque',exercises:[{id:'ejercicio',sets:[{reps:8,kg:25}]}]}]});
const executionBody={id:E1,clientId:A,status:'completada',revision:4,sessionId:S1,
  results:[{exerciseId:'ejercicio',sets:[{reps:8,loadKg:25,rpe:7}]}],
  feedback:{sessionRpe:7,sessionNotes:'Sin dolor'}};
const entity=(type,id,body,clientId=A,revision=4)=>({entityType:type,entityId:id,clientId,
  status:body.status,revision,body,updatedAt:now});
const makeInput=()=>({
 sessions:[{...sessionBody(S2,'Segunda'),updatedAt:now},{...sessionBody(S1,'Primera'),updatedAt:now}],
 sessionExecutions:[{...executionBody,updatedAt:now}],
 trainingCycles:[],
 m26Entities:[entity('session_execution',E1,executionBody),
   entity('session',S1,sessionBody(S1,'Primera')),
   entity('session',S2,sessionBody(S2,'Segunda'))]
});
const compact=input=>({...input,
  sessions:input.sessions.map(x=>({id:x.id})),
  sessionExecutions:input.sessionExecutions.map(x=>({id:x.id}))});

test('full legacy and {id} references yield identical canonical session and execution data',()=>{
  const full=makeInput(), reduced=compact(makeInput());
  const a=reconcileCanonicalTrainingCollections(full);
  const b=reconcileCanonicalTrainingCollections(reduced);
  assert.deepEqual(b.sessions,a.sessions);
  assert.deepEqual(b.sessionExecutions,a.sessionExecutions);
  assert.deepEqual(b.sessionExecutions[0].results,executionBody.results);
  assert.deepEqual(b.sessionExecutions[0].feedback,executionBody.feedback);
  assert.deepEqual(b.sessions[1].blocks,sessionBody(S1,'Primera').blocks);
});

test('legacy order remains stable even when m26Entities are in the reverse order',()=>{
  const source=compact(makeInput());
  const out=reconcileCanonicalTrainingCollections(source);
  assert.deepEqual(out.sessions.map(x=>x.id),[S2,S1]);
  assert.equal(new Set(out.sessions.map(x=>x.id)).size,2);
});

test('compact references cannot override a record owned by another client',()=>{
  const input=compact(makeInput());
  input.sessions=[{id:S1,clientId:B,revision:4}];
  const out=reconcileCanonicalTrainingCollections(input);
  assert.deepEqual(out.sessions[0],{id:S1,clientId:B,revision:4});
  assert.equal(out.sessions[0].blocks,undefined);
  assert.equal(out.sessions[1].id,S2);
});

test('higher legacy revision never rolls back to lower canonical revision',()=>{
  const input=compact(makeInput());
  input.sessionExecutions=[{id:E1,clientId:A,revision:5}];
  const out=reconcileCanonicalTrainingCollections(input);
  assert.deepEqual(out.sessionExecutions,[{id:E1,clientId:A,revision:5}]);
});

test('canonical body with mismatched identity is never used for compact reference',()=>{
  const input=compact(makeInput());
  input.m26Entities[1].body={...sessionBody(S1,'Primera'),clientId:B};
  const out=reconcileCanonicalTrainingCollections(input);
  assert.deepEqual(out.sessions[1],{id:S1});
});

test('orphan references retain their original position without fabricating data',()=>{
  const input=compact(makeInput());
  input.sessions=[{id:P1},...input.sessions];
  const out=reconcileCanonicalTrainingCollections(input);
  assert.equal(out.sessions[0].id,P1);
  assert.equal(out.sessions[0].title,undefined);
  assert.deepEqual(out.sessions.map(x=>x.id),[P1,S2,S1]);
});

test('invalid revision or malformed canonical body never hydrates a reference',()=>{
  const input=compact(makeInput());
  input.m26Entities[0].revision=-2;
  input.m26Entities[1].body=[{id:S1}];
  const out=reconcileCanonicalTrainingCollections(input);
  assert.deepEqual(out.sessionExecutions,[{id:E1}]);
  assert.deepEqual(out.sessions[1],{id:S1});
});

test('reconciliation is immutable and preserves account-specific source collections',()=>{
  const input=compact(makeInput());
  const original=structuredClone(input);
  const out=reconcileCanonicalTrainingCollections(input);
  assert.deepEqual(input,original);
  assert.notEqual(out.sessions,input.sessions);
  assert.notEqual(out.sessionExecutions,input.sessionExecutions);
  assert.equal(out.m26Entities,input.m26Entities);
});
