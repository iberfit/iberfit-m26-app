import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnected360V46QaNativeChannel,__connected360V46QaInternals} from '../src/m26/wearables/v46-qa-native-channel.js';
import {readFileSync} from 'node:fs';

const now=Date.parse('2026-10-12T14:00:00Z');
const iso='2026-10-12T14:00:00Z';
const envelope=()=>({
  schema:'iberfit.connected360.qa.v46.explicit.v1',
  heartRateDaily:[{
    date:'2026-10-12',aggregationTimeZone:'America/Santiago',
    windowStartedAt:'2026-10-12T03:00:00Z',windowEndedAt:iso,acquiredAt:iso,
    sampleCount:7821,minBpm:55,maxBpm:175,
  }],
  exerciseEvidence:[{
    observationKey:'a'.repeat(64),sport:'running',
    startedAt:'2026-10-12T10:00:00Z',endedAt:'2026-10-12T11:00:00Z',
    acquiredAt:iso,heartRateSamples:45,minBpm:90,maxBpm:170,avgBpm:135,
    distanceMeters:9000,
  }],
});
const response=(request,opts={})=>({
  schema:'iberfit.connected360.qa.v46.local.v1',
  requestId:request.requestId,provider:'health_connect',
  persisted:false,automatic:false,
  grantedMetrics:['generalHeartRate','exerciseSessions'],
  envelope:envelope(),...opts,
});
function harness({reply=request=>response(request)}={}){
  const callbacks=new Set();
  let identity={role:'client',clientId:'client-a',ownerId:'owner-a'};
  let request=null;
  const channel={
    addEventListener(type,cb){if(type==='message')callbacks.add(cb);},
    removeEventListener(type,cb){if(type==='message')callbacks.delete(cb);},
    postMessage(raw){
      const parsed=JSON.parse(raw);
      if(parsed.action==='health.invalidate')return;
      request=parsed;
      Promise.resolve().then(()=>{
        const result=reply(parsed);
        if(result!==null)for(const cb of [...callbacks])cb({data:JSON.stringify(result)});
      });
    },
  };
  const scope={
    location:{origin:'https://m26-canary.iberfit.cl'},
    IBERFIT_CONNECTED360_QA:channel,
    crypto:{randomUUID:()=> 'aabbccdd-1234-4abe-8123-abcdefabcdef'},
    setTimeout,clearTimeout,
  };
  const api=createConnected360V46QaNativeChannel({
    scope,getIdentity:()=>identity,getToken:async()=> 'fake-a-test-token-long-enough',
    now:()=>now,timeoutMs:1000,
  });
  return {api,channel,getRequest:()=>request,setIdentity:value=>{identity=value;}};
}

test('owner-scoped, local-only V46 response validates daily pulse and workout evidence',async()=>{
  const h=harness();
  const v=await h.api.readLocal();
  assert.equal(h.getRequest().action,'health.readV46');
  assert.equal(h.getRequest().days,7);
  assert.deepEqual(h.getRequest().metrics,['generalHeartRate','exerciseSessions']);
  assert.equal(v.envelope.heartRateDaily[0].sampleCount,7821);
  assert.equal(v.envelope.exerciseEvidence[0].sport,'running');
  assert.equal(v.ownerId,'owner-a');
  assert.equal(v.persisted,false);
  assert.equal(v.automatic,false);
  assert.equal(v.linked,false);
  assert.equal(Object.hasOwn(v,'token'),false);
  h.api.destroy();
});

test('exercise-only permission must not return any pulse measurement',async()=>{
  const h=harness({reply:request=>{
    const e=envelope();
    e.heartRateDaily=[];
    return response(request,{grantedMetrics:['exerciseSessions'],envelope:e});
  }});
  await assert.rejects(h.api.readLocal(),/M26_V46_QA_RESPONSE_INVALID/u);
  h.api.destroy();
});

test('replay, unknown fields, mismatched min/max and too many records fail closed',()=>{
  const clean=__connected360V46QaInternals.cleanEnvelope;
  const modes=['generalHeartRate','exerciseSessions'];
  assert.equal(clean(envelope(),modes,now).exerciseEvidence.length,1);
  const e=envelope();e.exerciseEvidence.push({...e.exerciseEvidence[0]});
  assert.throws(()=>clean(e,modes,now),/M26_V46_QA_RESPONSE_INVALID/u);
  const f=envelope();f.exerciseEvidence[0].restingHeartRate=57;
  assert.throws(()=>clean(f,modes,now),/M26_V46_QA_RESPONSE_INVALID/u);
  const g=envelope();g.heartRateDaily[0].minBpm=190;
  assert.throws(()=>clean(g,modes,now),/M26_V46_QA_RESPONSE_INVALID/u);
  const h=envelope();h.exerciseEvidence[0].observationKey='raw-device-id';
  assert.throws(()=>clean(h,modes,now),/M26_V46_QA_RESPONSE_INVALID/u);
  const j=envelope();j.exerciseEvidence=Array.from({length:11},(_,i)=>({
    ...j.exerciseEvidence[0],observationKey:String(i).padStart(64,'a'),
  }));
  assert.throws(()=>clean(j,modes,now),/M26_V46_QA_RESPONSE_INVALID/u);
});

test('caller cannot request undeclared metrics or use normal PWA origin',async()=>{
  const h=harness();
  await assert.rejects(h.api.readLocal({metrics:['restingHeartRate']}),/M26_V46_QA_METRICS_INVALID/u);
  h.api.destroy();
});

test('Android QA read source never opts into automatic sync or exposes token bridge',()=>{
  const n=readFileSync(new URL('../native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360SecureWebViewActivity.kt',import.meta.url),'utf8');
  assert.match(n,/"health.readV46"/u);
  assert.match(n,/oneReadApproved/u);
  assert.match(n,/Connected360PageFence/u);
  assert.match(n,/Connected360V46QaEnvelope\.build/u);
  assert.match(n,/includeHeartRate = "generalHeartRate" in allowed/u);
  assert.match(n,/\.put\("persisted", false\)/u);
  assert.match(n,/\.put\("automatic", false\)/u);
  assert.doesNotMatch(n,/productionAllowed\s*=\s*true/u);
});
