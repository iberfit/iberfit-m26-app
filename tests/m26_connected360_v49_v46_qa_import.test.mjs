import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnected360V46QaImporter} from '../src/m26/wearables/v46-qa-import.js';

const owner='11111111-1111-4111-8111-111111111111';
const client='22222222-2222-4222-8222-222222222222';
const grant='33333333-3333-4333-8333-333333333333';
const acquiredAt='2026-10-12T14:00:00Z',at=Date.parse(acquiredAt);
function local(){
  return {provider:'health_connect',ownerId:owner,clientId:client,
    persisted:false,automatic:false,linked:false,metrics:['generalHeartRate','exerciseSessions'],
    envelope:{schema:'iberfit.connected360.qa.v46.explicit.v1',
      heartRateDaily:[{date:'2026-10-12',aggregationTimeZone:'America/Santiago',
        windowStartedAt:'2026-10-12T03:00:00Z',windowEndedAt:acquiredAt,acquiredAt,
        sampleCount:250,minBpm:60,maxBpm:165}],
      exerciseEvidence:[{observationKey:'a'.repeat(64),sport:'running',
        startedAt:'2026-10-12T10:00:00Z',endedAt:'2026-10-12T11:00:00Z',acquiredAt,
        heartRateSamples:50,avgBpm:140,minBpm:100,maxBpm:165,
        distanceMeters:8000}],
    },
  };
}
function setup({online=true,reauthorize=async()=>({grantId:grant})}={}){
  let current={role:'client',ownerId:owner,clientId:client};
  const events=[];
  const importer=createConnected360V46QaImporter({
    transport:{importConnected360QaV46:async(token,grantId,payload)=>{
      events.push({op:'write',token,grantId,payload});
      return {ok:true,persisted:true,automatic:false,inserted:
        payload.heartRateDaily.length+payload.exerciseEvidence.length,
        updated:0,unchanged:0};
    }},
    remoteSync:{reauthorize:async x=>{events.push({op:'authorize',...x});return reauthorize(x);},
      currentAuthorization:async x=>{events.push({op:'status',...x});return {grantId:grant};}},
    getIdentity:()=>current,getToken:async()=> 'qa-synthetic-session-token',
    isOnline:()=>online,now:()=>at,refreshState:async()=>{},
  });
  return {importer,events,setIdentity:x=>{current=x;}};
}
test('QA read alone does not authorize or persist any biometric data',()=>{
  const h=setup();
  const info=h.importer.capture(local());
  assert.deepEqual(info,{generalHeartRate:1,exerciseSessions:1,persisted:false});
  assert.equal(h.events.length,0);
  h.importer.destroy();
});
test('Separate exercise consent never silently persists any heart rate',async()=>{
  const h=setup();
  h.importer.capture(local());
  const result=await h.importer.commit({exerciseSessions:true});
  assert.equal(result.inserted,1);
  const w=h.events.find(x=>x.op==='write').payload;
  assert.equal(w.heartRateDaily.length,0);
  assert.equal(w.exerciseEvidence.length,1);
  assert.equal(Object.hasOwn(w.exerciseEvidence[0],'heartRateSamples'),false);
  assert.equal(Object.hasOwn(w.exerciseEvidence[0],'avgBpm'),false);
  assert.equal(h.events.find(x=>x.op==='authorize').scopes.join(','),'exerciseSessions');
  assert.equal(h.importer.hasPreview(),false);
});
test('General heart rate only never persists workouts',async()=>{
  const h=setup();h.importer.capture(local());
  const out=await h.importer.commit({generalHeartRate:true});
  assert.equal(out.inserted,1);
  const w=h.events.find(x=>x.op==='write').payload;
  assert.equal(w.heartRateDaily.length,1);
  assert.equal(w.exerciseEvidence.length,0);
});
test('Full consent sends two categories exactly once and remains manual',async()=>{
  const h=setup();h.importer.capture(local());
  const v=await h.importer.commit({generalHeartRate:true,exerciseSessions:true});
  assert.equal(v.inserted,2);assert.equal(v.automatic,false);
  assert.equal(h.events.filter(x=>x.op==='write').length,1);
  assert.deepEqual(h.events.find(x=>x.op==='authorize').scopes,
    ['generalHeartRate','exerciseSessions']);
  await assert.rejects(h.importer.commit({generalHeartRate:true}),
    /M26_V46_QA_PREVIEW_REQUIRED/u);
});
test('No confirmation, offline, revoked preview and account switch fail closed',async()=>{
  const h=setup();h.importer.capture(local());
  await assert.rejects(h.importer.commit(),/EXPLICIT_CONSENT/u);
  h.setIdentity({role:'client',ownerId:'44444444-4444-4444-8444-444444444444',clientId:client});
  await assert.rejects(h.importer.commit({generalHeartRate:true}),/SESSION_CHANGED/u);
  assert.equal(h.events.length,0);
  h.importer.destroy();
  const offline=setup({online:false});offline.importer.capture(local());
  await assert.rejects(offline.importer.commit({generalHeartRate:true}),/ONLINE_REQUIRED/u);
  assert.equal(offline.events.length,0);
});
test('Grant replacement mid-flow prevents transmission',async()=>{
  const h=setup({reauthorize:async()=>({grantId:'77777777-7777-4777-8777-777777777777'})});
  h.importer.capture(local());
  await assert.rejects(h.importer.commit({generalHeartRate:true}),/GRANT_STALE/u);
  assert.equal(h.events.filter(x=>x.op==='write').length,0);
});
test('QA transport never widens native Health Connect permission in production',()=>{
  const t=readFileSync(new URL('../src/m26/supabase-transport.js',import.meta.url),'utf8');
  assert.match(t,/runtime\.qaOnly===true&&runtime\.canary===true/u);
  assert.match(t,/runtime\.projectRef===M26_QA_PROJECT_REF&&provider==='health_connect'/u);
  assert.match(t,/M26_HEALTH_V46_PRODUCTION_DENIED/u);
  assert.match(t,/importConnected360QaV46/u);
  const c=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(c,/qa-v46-evidence-confirm/u);
  assert.match(c,/qaV46Importer\.commit\(selected\)/u);
  assert.match(c,/qaV46Importer\.destroy\(\)/u);
});
