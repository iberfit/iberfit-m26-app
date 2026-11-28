import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAppleExerciseStatus,appleExerciseConsentParams,verifyAppleExerciseConsentReceipt,appleExerciseImportParams,verifyAppleExerciseImportReceipt,createAppleExerciseCandidateSync} from '../src/m26/wearables/v53-apple-authorization-contract.js';
const old='00000000-0000-4000-8000-000000000001',fresh='00000000-0000-4000-8000-000000000002';
const base={ok:true,provider:'apple_health',serverEnabled:true,authorized:false,reason:'consent-required',grantId:old,revocationCursor:8,scopes:[]};
const active={...base,authorized:true,reason:'authorized',scopes:['exerciseSessions']};
test('stale grant is CAS input, never authorization',()=>{
 assert.equal(verifyAppleExerciseStatus(base).authorized,false);
 assert.throws(()=>appleExerciseConsentParams(base));
 assert.deepEqual(appleExerciseConsentParams(base,{confirmed:true}),{p_expected_grant:old,p_expected_cursor:8,p_confirmed:true});
});
test('disabled, blocked and conflicting permissions forbid authorization',()=>{
 for(const status of [{...base,serverEnabled:false,reason:'release-disabled'},{...base,reason:'connection-blocked'},{...base,reason:'scope-conflict'}]){
  assert.equal(verifyAppleExerciseStatus(status).authorized,false);
  assert.throws(()=>appleExerciseConsentParams(status,{confirmed:true}));
 }
});
test('reject provider mixing, invented scope, malformed or inconsistent status',()=>{
 for(const v of [{...base,provider:'health_connect'},{...base,authorized:true},{...base,revocationCursor:'8'},{...base,revocationCursor:Number.MAX_SAFE_INTEGER+1},{...base,scopes:['generalHeartRate']},{...active,grantId:null},{...active,scopes:['exerciseSessions','generalHeartRate']},{...base,extra:true}])assert.throws(()=>verifyAppleExerciseStatus(v));
});
test('exact acknowledgement permits new grant or idempotent current grant only',()=>{
 const params=appleExerciseConsentParams(base,{confirmed:true});
 const ack={ok:true,provider:'apple_health',grantId:fresh,revocationCursor:8,scopes:['exerciseSessions'],alreadyAuthorized:false};
 assert.equal(verifyAppleExerciseConsentReceipt(ack,params).grantId,fresh);
 assert.equal(verifyAppleExerciseConsentReceipt({...ack,grantId:old,alreadyAuthorized:true},params).grantId,old);
 for(const v of [{...ack,revocationCursor:9},{...ack,grantId:old},{...ack,alreadyAuthorized:true},{...ack,provider:'health_connect'},{...ack,scopes:['exerciseSessions','sleepMinutes']}])assert.throws(()=>verifyAppleExerciseConsentReceipt(v,params));
});

const at=Date.parse('2026-11-28T12:00:00Z');
const workout={observationKey:'a'.repeat(64),sport:'swimming',startedAt:'2026-11-28T10:00:00Z',endedAt:'2026-11-28T11:00:00Z',activeSeconds:3000,distanceMeters:null};
const payload={schema:'iberfit.connected360.v54.apple.ingest.v1',acquiredAt:'2026-11-28T12:00:00Z',exerciseEvidence:[workout]};
test('Apple import candidate preserves null, zero and exact workout fields',()=>{
 const p=appleExerciseImportParams(active,payload,{at});
 assert.equal(p.p_grant_id,old);
 assert.equal(p.p_payload.exerciseEvidence[0].distanceMeters,null);
 assert.equal(appleExerciseImportParams(active,{...payload,exerciseEvidence:[{...workout,distanceMeters:0}]},{at}).p_payload.exerciseEvidence[0].distanceMeters,0);
});
test('Apple import rejects unauthorized, duplicate, invalid dates, coercion and biometric fields',()=>{
 assert.throws(()=>appleExerciseImportParams(base,payload,{at}));
 for(const rows of [[workout,workout],[{...workout,startedAt:'2026-11-31T10:00:00Z'}],[{...workout,activeSeconds:'3000'}],[{...workout,avgBpm:140}],[{...workout,distanceMeters:undefined}],[{...workout,activeSeconds:3602}],[]])
  assert.throws(()=>appleExerciseImportParams(active,{...payload,exerciseEvidence:rows},{at}));
 assert.throws(()=>appleExerciseImportParams(active,payload,{at:at+1200001}));
});
test('Apple import acknowledgement requires all rows and never certifies device identity',()=>{
 const p=appleExerciseImportParams(active,payload,{at});
 const ack={ok:true,provider:'apple_health',persisted:true,inserted:1,updated:0,unchanged:0,sourceIdentityVerified:false,automaticSyncCertified:false};
 assert.equal(verifyAppleExerciseImportReceipt(ack,p).inserted,1);
 for(const r of [{...ack,inserted:0},{...ack,provider:'health_connect'},{...ack,sourceIdentityVerified:true},{...ack,automaticSyncCertified:true},{...ack,updated:1}])assert.throws(()=>verifyAppleExerciseImportReceipt(r,p));
});

const next='00000000-0000-4000-8000-000000000003';
const owner='00000000-0000-4000-8000-000000000004';
const clientId='00000000-0000-4000-8000-000000000005';
const ack={ok:true,provider:'apple_health',persisted:true,inserted:1,updated:0,unchanged:0,sourceIdentityVerified:false,automaticSyncCertified:false};
function syncHarness(){
 let identity={role:'client',ownerId:owner,clientId},status=active,enabled=true,receipt=ack,override=null,readHook=null;
 const reads=[],writes=[],statuses=[];
 const native={readCandidatePage:async args=>{
  reads.push(args);if(readHook)await readHook();
  return {schema:'iberfit.connected360.v54.apple.page.v1',provider:'apple_health',days:args.days,cursor:args.cursor,
   nextCursor:args.cursor===null&&args.days===30?next:null,acquiredAt:payload.acquiredAt,records:[workout],readPermissionStatus:'not_disclosed',persisted:false,...override};
 }};
 const transport={connected360AppleCandidateStatus:async()=>{statuses.push(status);return status;},
  importConnected360AppleCandidate:async(token,s,p)=>{writes.push({token,s,p});return receipt;}};
 const sync=createAppleExerciseCandidateSync({native,transport,getIdentity:()=>identity,getToken:async()=>'test-token-only',canRun:()=>enabled,now:()=>at});
 return {sync,reads,writes,statuses,setStatus:v=>status=v,setReceipt:v=>receipt=v,setPage:v=>override=v,setReadHook:v=>readHook=v,setIdentity:v=>identity=v,setEnabled:v=>enabled=v};
}
test('Apple coordinator advances only after complete ACK, then switches from 30 days to 7',async()=>{
 const h=syncHarness();h.setReceipt({...ack,inserted:0});
 await assert.rejects(h.sync.runPage());
 h.setReceipt(ack);
 assert.equal((await h.sync.runPage()).workoutHistoryPending,true);
 assert.equal(h.reads[0].cursor,null);assert.equal(h.reads[1].cursor,null);
 assert.equal((await h.sync.runPage()).workoutHistoryPending,false);
 assert.equal(h.reads[2].cursor,next);
 await h.sync.runPage();assert.equal(h.reads[3].days,7);
 assert.equal(h.writes.length,4);
});
test('Apple coordinator does not read without current consent or import after revocation',async()=>{
 const h=syncHarness();h.setStatus(base);
 assert.equal((await h.sync.runPage()).skipped,'consent-required');
 assert.equal(h.reads.length,0);
 h.setStatus(active);h.setReadHook(()=>h.setStatus({...base,revocationCursor:9}));
 await assert.rejects(h.sync.runPage(),/CONSENT_CHANGED/u);
 assert.equal(h.writes.length,0);
});
test('Apple coordinator refuses account replacement during native read',async()=>{
 const h=syncHarness();h.setReadHook(()=>h.setIdentity({role:'client',ownerId:fresh,clientId}));
 await assert.rejects(h.sync.runPage(),/OWNER_CHANGED/u);assert.equal(h.writes.length,0);
});
test('Apple coordinator does not write empty pages or claim read permission',async()=>{
 const h=syncHarness();h.setPage({records:[],nextCursor:null});
 const r=await h.sync.runPage();assert.equal(r.observedRows,0);assert.equal(r.readPermissionStatus,'not_disclosed');
 assert.equal(h.writes.length,0);assert.equal(h.statuses.length,2);
});
test('Apple coordinator coalesces simultaneous requests and invalidates pending work',async()=>{
 const h=syncHarness();let release;const hold=new Promise(r=>release=r);h.setReadHook(()=>hold);
 const a=h.sync.runPage(),b=h.sync.runPage();
 release();await Promise.all([a,b]);assert.equal(h.reads.length,1);assert.equal(h.writes.length,1);
 const h2=syncHarness();let resolve;const block=new Promise(r=>resolve=r);h2.setReadHook(()=>block);
 const c=h2.sync.runPage();h2.sync.invalidate();resolve();
 await assert.rejects(c,/INVALIDATED/u);assert.equal(h2.writes.length,0);
});
test('Apple coordinator resets a repeated cursor and refuses malformed or biometric pages',async()=>{
 const h=syncHarness();await h.sync.runPage();
 h.setPage({nextCursor:next});await assert.rejects(h.sync.runPage(),/PAGE_INVALID/u);assert.equal(h.writes.length,1);
 h.setPage({records:[{...workout,avgBpm:150}]});await assert.rejects(h.sync.runPage());assert.equal(h.writes.length,1);
});
test('Apple coordinator aborts when leaving foreground and keeps grant-specific history',async()=>{
 const h=syncHarness();await h.sync.runPage();
 h.setStatus({...active,grantId:fresh,revocationCursor:9});
 await h.sync.runPage();assert.equal(h.reads[1].cursor,null);assert.equal(h.reads[1].days,30);
 h.setReadHook(()=>h.setEnabled(false));
 await assert.rejects(h.sync.runPage(),/INVALIDATED/u);
 assert.equal(h.writes.length,2);
});
