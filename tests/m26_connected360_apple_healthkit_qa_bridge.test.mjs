import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createAppleHealthQaNativeChannel,
  normalizeAppleQaWorkouts,
  isAppleHealthQaNativeAvailable,
} from '../src/m26/wearables/apple-qa-native-channel.js';

const client={role:'client',clientId:'qa-client',ownerId:'authenticated-owner'};
function harness({origin='https://m26-canary.iberfit.cl',answer,token='valid-web-token-qa',who=client}={}){
  const listeners=new Set(),sent=[];
  let identity=who;
  const scope={
    location:{origin},
    crypto:{randomUUID:()=> 'local-qa-request-20261011'},
    setTimeout,clearTimeout,
    addEventListener:(name,fn)=>{if(name==='iberfit:connected360-apple-qa')listeners.add(fn)},
    removeEventListener:(name,fn)=>{if(name==='iberfit:connected360-apple-qa')listeners.delete(fn)},
    webkit:{messageHandlers:{iberfitConnected360AppleQa:{
      postMessage:command=>{
        sent.push(command);
        if(answer)queueMicrotask(()=>{
          const payload=answer(command);
          if(payload)for(const fn of [...listeners])fn({detail:payload});
        });
      },
    }}},
  };
  const channel=createAppleHealthQaNativeChannel({
    scope,getIdentity:()=>identity,getToken:async()=>token,timeoutMs:200,
  });
  return {scope,channel,sent,listeners,setIdentity:value=>{identity=value;}};
}
const iso=new Date().toISOString(),today=iso.slice(0,10);
const row={provider:'apple_health',date:today,steps:8100,sleepMinutes:422,
  restingHeartRate:58,stepsReadFailed:false,sleepReadFailed:false,
  restingHeartRateReadFailed:false,aggregationTimeZone:'America/Santiago',
  acquiredAt:iso,sourceTimestampVerified:false,automaticSyncCertified:false};
const ok=command=>({
  schema:'iberfit.connected360.apple.qa.read.v1',
  requestId:command.requestId,provider:'apple_health',
  records:[row],readPermissionStatus:'not_disclosed',
  persisted:false,linked:false,
});

test('authenticated client makes bounded Canary local-only request; no credentials cross into Swift',async()=>{
  const h=harness({answer:ok});
  const result=await h.channel.readLocal();
  assert.equal(result.provider,'apple_health');
  assert.equal(result.rows[0].metrics.steps,8100);
  assert.equal(result.rows[0].metrics.sleepMinutes,422);
  assert.equal(result.rows[0].sourceTimestampVerified,false);
  assert.equal(result.readPermissionStatus,'not_disclosed');
  assert.equal(result.persisted,false);
  assert.equal(result.linked,false);
  assert.deepEqual(result.requestedMetrics,['steps','sleepMinutes','restingHeartRate']);
  assert.equal(h.sent.length,1);
  assert.equal(h.sent[0].action,'health.readDaily');
  assert.equal(h.sent[0].days,7);
  assert.doesNotMatch(JSON.stringify(h.sent),/authenticated-owner|qa-client|valid-web-token|grantId|sourceUpdatedAt/u);
  assert.equal(h.listeners.size,0);
});

test('normal Safari/browser or other origin cannot use Apple QA channel',async()=>{
  const untrusted=harness({origin:'https://app.iberfit.cl',answer:ok});
  assert.equal(isAppleHealthQaNativeAvailable(untrusted.scope),false);
  await assert.rejects(untrusted.channel.readLocal(),/BRIDGE_UNAVAILABLE/u);
  assert.equal(untrusted.sent.length,0);
  for(const who of [null,{role:'coach',clientId:'qa-client',ownerId:'authenticated-owner'},
    {role:'client',clientId:'qa-client',ownerId:''}]){
    const h=harness({answer:ok,who});
    await assert.rejects(h.channel.readLocal(),/CLIENT_REQUIRED/u);
    assert.equal(h.sent.length,0);
  }
});

test('same Client but different signed-in account is invalidated after OS reply',async()=>{
  const h=harness({answer:command=>{
    h.setIdentity({...client,ownerId:'another-authenticated-user'});
    return ok(command);
  }});
  await assert.rejects(h.channel.readLocal(),/SESSION_CHANGED/u);
  assert.equal(h.listeners.size,0);
});

test('native response cannot claim a linked Apple Watch, server write or read grant',async()=>{
  for(const modify of [
    x=>({...x,persisted:true}),
    x=>({...x,linked:true}),
    x=>({...x,readPermissionStatus:'granted'}),
    x=>({...x,records:[{...row,automaticSyncCertified:true}]}),
    x=>({...x,records:[{...row,sourceTimestampVerified:true}]}),
    x=>({...x,records:[{...row,steps:350000}]}),
    x=>({...x,records:[{...row,stepsReadFailed:'false'}]}),
    x=>({...x,records:Array.from({length:8},()=>row)}),
  ]){
    const h=harness({answer:c=>modify(ok(c))});
    await assert.rejects(h.channel.readLocal(),/RESPONSE_INVALID/u);
  }
});

test('partial OS errors preserve successful metrics without inventing permission status',async()=>{
  const h=harness({answer:c=>({...ok(c),records:[{
    ...row,steps:null,stepsReadFailed:true,sleepMinutes:422,
  }]})});
  const result=await h.channel.readLocal();
  assert.equal(result.rows[0].metrics.steps,undefined);
  assert.equal(result.rows[0].failedMetrics.steps,true);
  assert.equal(result.rows[0].metrics.sleepMinutes,422);
  assert.equal(result.readPermissionStatus,'not_disclosed');
});

test('timeout and destruction retire callbacks, allowing recovery after abort',async()=>{
  const h=harness();
  const promise=h.channel.readLocal();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.sent.length,1);
  h.channel.destroy();
  await assert.rejects(promise,/DISPOSED/u);
  assert.equal(h.listeners.size,0);
  const timed=harness();
  await assert.rejects(timed.channel.readLocal(),/TIMEOUT/u);
  assert.equal(timed.listeners.size,0);
  await assert.rejects(timed.channel.readLocal({days:8}),/REQUEST_INVALID/u);
});

test('native QA host has strict Canary main-frame origin, one local approval, no server write or Release',()=>{
  const source=readFileSync('native/apple/QAApp/IBERFITCanaryClientQAView.swift','utf8');
  const app=readFileSync('native/apple/QAApp/IBERFITConnected360QAApp.swift','utf8');
  const policy=readFileSync('src/m26/wearables/free-policy.js','utf8');
  const controller=readFileSync('src/m26/wearables/controller.js','utf8');
  assert.match(app,/#if !DEBUG/u);
  assert.match(app,/IBERFITCanaryClientQAView/u);
  assert.match(source,/#if DEBUG/u);
  assert.match(source,/frameInfo.isMainFrame/u);
  assert.match(source,/m26-canary\.iberfit\.cl/u);
  assert.match(source,/parts\.port == nil/u);
  assert.match(source,/oneReadApproved = false/u);
  assert.match(source,/reader\.readDailyOnce\(days: days\)/u);
  assert.match(source,/reader\.requestExplicitDailyAccess/u);
  assert.match(source,/readPermissionStatus": "not_disclosed"/u);
  assert.match(source,/persisted": false/u);
  assert.match(source,/linked": false/u);
  assert.match(source,/state\.invalidate\(\)/u);
  assert.match(source,/case "health.invalidate":/u);
  assert.match(controller,/appleQaNative\.destroy\(\)/u);
  assert.doesNotMatch(source,/service_role|SUPABASE_SERVICE|URLSession|importConnected360QaV45/u);
  assert.match(policy,/apple_health:policy\(\{[^]*?productionAllowed:false/u);
  assert.match(controller,/appleQaNative\.readLocal\(\{days:7\}\)/u);
  assert.match(controller,/appleQaNative\.destroy\(\)/u);
});

test('logout actively revokes the pending one-shot HealthKit approval in the native host',async()=>{
  const h=harness();
  const pending=h.channel.readLocal();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.sent.length,1);
  h.channel.destroy();
  await assert.rejects(pending,/M26_APPLE_QA_DISPOSED/u);
  assert.equal(h.sent.length,2);
  assert.equal(h.sent[1].schema,'iberfit.connected360.apple.qa.request.v1');
  assert.equal(h.sent[1].action,'health.invalidate');
  assert.equal(h.sent[1].days,undefined);
  assert.doesNotMatch(JSON.stringify(h.sent[1]),/authenticated-owner|qa-client|token|grant|email/u);
  assert.equal(h.listeners.size,0);
});

test('iPhone consent only stays valid for two minutes after the local native button',()=>{
  const swift=readFileSync('native/apple/QAApp/IBERFITCanaryClientQAView.swift','utf8');
  const lease=readFileSync('native/apple/QAApp/IBERFITAppleQAReadLease.swift','utf8');
  assert.match(swift,/IBERFITAppleQAReadLease\.isCurrent\(/u);
  assert.match(swift,/approvedAtUptime = ProcessInfo\.processInfo\.systemUptime/u);
  assert.match(swift,/M26_APPLE_QA_LOCAL_APPROVAL_EXPIRED/u);
  assert.match(swift,/approvedAtUptime = nil/u);
  assert.match(lease,/maxAgeSeconds: TimeInterval = 120/u);
  assert.match(lease,/elapsed >= 0 && elapsed <= maxAgeSeconds/u);
  assert.match(swift,/reader\.revokeLocalReadApproval\(\)/u);
});


const workoutAt=Date.parse('2026-11-28T15:00:00Z');
const workoutReply={schema:'iberfit.connected360.apple.qa.workouts.v1',provider:'apple_health',
  days:30,mayHaveMore:false,persisted:false,linked:false,readPermissionStatus:'not_disclosed',
  records:[{sport:'running',startedAt:'2026-11-28T12:00:00Z',endedAt:'2026-11-28T12:40:00Z',activeSeconds:1800,distanceMeters:5000},
  {sport:'swimming',startedAt:'2026-11-27T12:00:00Z',endedAt:'2026-11-27T12:40:00Z',activeSeconds:1200,distanceMeters:1000}]};
test('Apple workout preview preserves civil days and active pace by discipline without source IDs',()=>{
  const result=normalizeAppleQaWorkouts(workoutReply,{at:workoutAt,days:30});
  assert.deepEqual(result.rows.map(r=>[r.day,r.activePaceSeconds,r.paceUnitMeters]),[['2026-11-28',360,1000],['2026-11-27',120,100]]);
  assert.equal(result.persisted,false);
  for(const invalid of [
    {...workoutReply,persisted:true},
    {...workoutReply,records:[{...workoutReply.records[0],id:'native-uuid'}]},
    {...workoutReply,records:[{...workoutReply.records[0],averageHeartRate:148}]},
    {...workoutReply,records:[{...workoutReply.records[0],activeSeconds:5000}]},
    {...workoutReply,records:[...workoutReply.records].reverse()},
    {...workoutReply,records:Array.from({length:61},()=>workoutReply.records[0])},
  ])assert.throws(()=>normalizeAppleQaWorkouts(invalid,{at:workoutAt,days:30}),/RESPONSE_INVALID/u);
});
test('Apple workout bridge sends only local bounded action and rejects a daily response',async()=>{
  const current={...workoutReply,records:[]};
  const h=harness({answer:c=>({...current,requestId:c.requestId})});
  const value=await h.channel.readWorkouts();
  assert.equal(value.rows.length,0);
  assert.deepEqual(h.sent[0],{schema:'iberfit.connected360.apple.qa.request.v1',requestId:'local-qa-request-20261011',action:'health.readWorkouts',days:30});
  const bad=harness({answer:ok});await assert.rejects(bad.channel.readWorkouts(),/RESPONSE_INVALID/u);
  await assert.rejects(h.channel.readWorkouts({days:31}),/REQUEST_INVALID/u);
});
test('native workout read uses independent approval and never sends source UUID or biometrics',()=>{
  const source=readFileSync('native/apple/QAApp/IBERFITCanaryClientQAView.swift','utf8');
  assert.match(source,/func authorizeWorkoutsOnce\(/u);
  assert.match(source,/requestExplicitWorkoutAccess\(includeHeartRate: false\)/u);
  assert.match(source,/case "health.readWorkouts":/u);
  assert.match(source,/workoutReader.invalidate\(\)/u);
  const read=source.slice(source.indexOf('func receiveWorkouts'),source.indexOf('func receiveRead'));
  assert.doesNotMatch(read,/workout\.id|workout\.averageHeartRate|URLSession/u);
});
