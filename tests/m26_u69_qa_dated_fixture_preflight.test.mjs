import test from 'node:test';
import assert from 'node:assert/strict';
import {QA,candidateList} from '../scripts/remote-gates/qa_u60_dated_fixture_preflight.mjs';
const client='11111111-1111-4111-8111-111111111111';
const session='22222222-2222-4222-8222-222222222222';
const plan='33333333-3333-4333-8333-333333333333';
const data=(overrides={})=>({data:{m26Entities:[
 {entityType:'planning',entityId:plan,status:'publicado',
  body:{startDate:'2026-11-01',endDate:'2026-12-22'}},
 {entityType:'session',entityId:session,clientId:client,revision:2,status:'disponible',
  body:{cycleId:plan,deliveryModality:'guiada_en_app',visibleToClient:true,
   clientVisibilityLevel:'full',durationMinutes:40,
   blocks:[{exerciseId:'qa-exercise',sets:2}],...overrides}},
]}});
test('U69 fixed QA target with one published, guided eligible source',()=>{
 assert.equal(QA,'gjztkdwfmunnzhtvxrsu');
 assert.equal(candidateList(data(),'2026-11-04').length,1);
 assert.equal(candidateList(data(),'2027-01-03').length,0);
});
test('U69 never plans from private/draft/other modality',()=>{
 for(const body of [{visibleToClient:false},{deliveryModality:'presencial'},
  {clientVisibilityLevel:'none'},{cycleId:'bad'},
  {blocks:[]},{blocks:[{exerciseId:'qa',sets:0}]},
  {blocks:[{exerciseId:'qa',sets:1},{exerciseId:'qa',sets:1}]}])
  assert.equal(candidateList(data(body),'2026-11-04').length,0);
});
test('U69 never exports sensitive fixture details',()=>{
 const testSource=candidateList(data(),'2026-11-04');
 assert.equal(testSource.length,1);
 assert.equal(testSource[0].id,session);
 assert.equal(testSource[0].clientId,client);
 const s=JSON.stringify(testSource);
 assert.equal(s.includes('email'),false);
 assert.equal(s.includes('password'),false);
});
