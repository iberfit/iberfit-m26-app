import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyConnected360DocumentReview as verify,connected360DocumentDecisionParams as decide,verifyConnected360DocumentDecisionReceipt as receipt} from '../src/m26/wearables/document-consent-contract.js';
const clientId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',reportId='33333333-3333-4333-8333-333333333333',operationId='44444444-4444-4444-8444-444444444444';
const now=new Date('2026-11-28T12:00:00Z'),opts={clientId,requestId,now},draftSha256='a'.repeat(64),evidenceSha256='b'.repeat(64);
const fixture=()=>({schema:'iberfit.connected360.document-review.v1',requestId,reportId,reportRevision:1,clientId,provider:'health_connect',periodStart:'2026-11-21',periodEnd:'2026-11-27',draftSha256,evidenceSha256,revision:0,decision:'pending',preview:{reportTitle:'Informe semanal',coachName:'Entrenador',reportType:'weekly',evidence:{schema:'iberfit.connected360.report-observations.v1',provider:'health_connect',periodStart:'2026-11-21',periodEnd:'2026-11-27',coverage:'observed-only',observedDays:3,disciplines:[{sport:'running',observedDays:2},{sport:'swimming',observedDays:1}],evidenceSha256}}});
test('review verifies minimized preview, immutable nested evidence and both hashes for explicit decision',()=>{
 const v=verify(fixture(),opts);assert.ok(Object.isFrozen(v.preview.evidence.disciplines[0]));
 const params=decide(v,{...opts,decision:'accepted',confirmed:true,operationId});
 assert.deepEqual(params,{p_request:requestId,p_expected_revision:0,p_operation:operationId,p_decision:'accepted',p_draft_sha:draftSha256,p_evidence_sha:evidenceSha256});
 assert.throws(()=>decide(v,{...opts,decision:'accepted',operationId}));
});
test('scope, period, state and exact DTO reject foreign, unknown or stale responses',()=>{
 for(const change of [{requestId:reportId},{clientId:reportId},{draftSha256:'A'.repeat(64)},{provider:'garmin'},{periodStart:'2026-11-20'},{periodEnd:'2026-11-28'},{periodStart:'2026-11-31'},{revision:1},{reportRevision:0},{ownerId:clientId},{decision:'__proto__'}])assert.throws(()=>verify({...fixture(),...change},opts));
 assert.throws(()=>verify(fixture(),{...opts,requestId:reportId}));
});
test('evidence proof must match provider, dates, digest, partial coverage and observed day arithmetic',()=>{
 for(const change of [{provider:'apple_health'},{periodEnd:'2026-11-26'},{evidenceSha256:draftSha256},{coverage:'complete'},{observedDays:0},{observedDays:8},{observedDays:4},{disciplines:[{sport:'running',observedDays:4}]},{disciplines:[{sport:'running',observedDays:2},{sport:'running',observedDays:2}]},{disciplines:[{sport:'interval_running',observedDays:3}]},{grantId:reportId}]){
  const v=fixture();Object.assign(v.preview.evidence,change);assert.throws(()=>verify(v,opts));
 }
 const v=fixture();v.provider='apple_health';v.preview.evidence.provider='apple_health';assert.equal(verify(v,opts).provider,'apple_health');
});
test('receipt-only decline and withdrawal survive disconnected source but cannot accept or resurrect',()=>{
 const v={...fixture(),preview:null};const op={...opts,operationId,confirmed:true};
 assert.throws(()=>decide(v,{...op,decision:'accepted'}));assert.equal(decide(v,{...op,decision:'declined'}).p_expected_revision,0);
 const accepted={...v,decision:'accepted',revision:1};assert.equal(decide(accepted,{...op,decision:'withdrawn'}).p_expected_revision,1);
 for(const [decision,revision] of [['declined',1],['withdrawn',2]])for(const intent of ['accepted','declined','withdrawn'])assert.throws(()=>decide({...v,decision,revision},{...op,decision:intent}));
});
test('acknowledgment exact identity and revision, no stale acceptance on withdrawal',()=>{
 const params=decide(fixture(),{...opts,decision:'accepted',confirmed:true,operationId});
 const result={requestId,operationId,revision:1,decision:'accepted',duplicate:false};assert.deepEqual(receipt(result,params),result);
 for(const change of [{requestId:reportId},{operationId:reportId},{revision:0},{revision:2},{decision:'withdrawn'},{duplicate:1},{extra:true}])assert.throws(()=>receipt({...result,...change},params));
});
