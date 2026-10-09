import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createConnected360QaNativeChannel,
  isConnected360QaNativeAvailable,
} from '../src/m26/wearables/qa-native-channel.js';

const REQUESTED_ID={role:'client',clientId:'qa-client-01',ownerId:'qa-owner-01'};
function fixture({
  origin='https://m26-canary.iberfit.cl',
  identity=REQUESTED_ID,
  token='qa-user-session-strong',
  reply,
}={}){
  const listeners=new Set(),messages=[];
  const channel={
    addEventListener(type,fn){if(type==='message')listeners.add(fn);},
    removeEventListener(type,fn){if(type==='message')listeners.delete(fn);},
    postMessage(raw){
      messages.push(JSON.parse(raw));
      if(typeof reply==='function'){
        queueMicrotask(()=>{
          const payload=reply(JSON.parse(raw));
          if(payload!==undefined)
            for(const fn of [...listeners])fn({data:JSON.stringify(payload)});
        });
      }
    },
  };
  let current=identity,accessToken=token;
  const scope={
    location:{origin},crypto:{randomUUID:()=> 'security-qa-request-000000000001'},
    setTimeout,clearTimeout,IBERFIT_CONNECTED360_QA:channel,
  };
  const client=createConnected360QaNativeChannel({
    scope,getIdentity:()=>current,getToken:async()=>accessToken,
    timeoutMs:500,
  });
  return {scope,client,messages,listeners,
    setIdentity:id=>{current=id;},
    setToken:t=>{accessToken=t;}};
}
const row={provider:'health_connect',date:'2026-10-08',
  acquiredAt:'2026-10-08T18:12:00Z',steps:5200,sleepMinutes:412,restingHeartRate:56};
const ok=message=>({schema:'iberfit.connected360.qa.read.v1',
  requestId:message.requestId,provider:'health_connect',persisted:false,
  grantedMetrics:['steps','sleepMinutes','restingHeartRate'],records:[row]});

test('authenticated Client reads local Android data with no token or clientId sent to native',async()=>{
  const f=fixture({reply:ok});
  const result=await f.client.readLocal({days:7,metrics:['steps','sleepMinutes','restingHeartRate']});
  assert.equal(result.persisted,false);
  assert.equal(result.linked,false);
  assert.equal(result.rows.length,1);
  assert.deepEqual(result.rows[0].metrics,{steps:5200,sleepMinutes:412,restingHeartRate:56});
  assert.equal(result.rows[0].acquiredAt,'2026-10-08T18:12:00.000Z');
  const req=f.messages[0];
  assert.equal(req.action,'health.readDaily');
  assert.deepEqual(req.metrics,['steps','sleepMinutes','restingHeartRate']);
  assert.equal(req.requestId,'security-qa-request-000000000001');
  assert.doesNotMatch(JSON.stringify(req),/qa-client-01|qa-owner-01|qa-user-session|authorizationGrant|sourceUpdatedAt/);
  assert.equal(f.listeners.size,0,'listeners cleaned after response');
});

test('non-Client, no session, or a normal browser never obtains health data',async()=>{
  for(const who of [{role:'coach',clientId:'qa-client-01',ownerId:'owner'},
    {role:'client',clientId:'',ownerId:'owner'},null]){
    const f=fixture({identity:who,reply:ok});
    await assert.rejects(f.client.readLocal(),/CLIENT_REQUIRED/);
    assert.equal(f.messages.length,0);
  }
  const f=fixture({token:'',reply:ok});
  await assert.rejects(f.client.readLocal(),/SESSION_REQUIRED/);
  assert.equal(f.messages.length,0);
  const normal=fixture({origin:'https://app.iberfit.cl',reply:ok});
  assert.equal(isConnected360QaNativeAvailable(normal.scope),false);
  await assert.rejects(normal.client.readLocal(),/BRIDGE_UNAVAILABLE/);
  assert.equal(normal.messages.length,0);
});

test('post-response account switch fails closed and never returns old client data',async()=>{
  const f=fixture({reply:(message)=>{
    f.setIdentity({...REQUESTED_ID,clientId:'qa-other-client'});
    return ok(message);
  }});
  await assert.rejects(f.client.readLocal(),/SESSION_CHANGED/);
  assert.equal(f.listeners.size,0);
});

test('forged response, wrong schema, excessive rows and unrequested metrics all fail closed',async()=>{
  for(const modify of [
    x=>({...x,persisted:true}),
    x=>({...x,provider:'apple_health'}),
    x=>({...x,records:Array.from({length:8},()=>row)}),
    x=>({...x,records:[{...row,sleepMinutes:45000}]}),
    x=>({...x,records:[{...row,clientId:'attacker'}]}),
  ]){
    const f=fixture({reply:m=>modify(ok(m))});
    if(modify.toString().includes('clientId')){
      // Unknown fields may exist, but must never be surfaced in the vetted rows.
      const result=await f.client.readLocal();
      assert.equal(result.rows[0].clientId,undefined);
    }else{
      await assert.rejects(f.client.readLocal(),/RESPONSE_INVALID/);
    }
  }
});

test('unsupported native actions, denied OS read, and empty days do not simulate a connected device',async()=>{
  const fail=fixture({reply:m=>({schema:'iberfit.connected360.qa.error.v1',
    requestId:m.requestId,error:'M26_HEALTH_LOCAL_APPROVAL_REQUIRED'})});
  await assert.rejects(fail.client.readLocal(),/M26_HEALTH_LOCAL_APPROVAL_REQUIRED/);
  const none=fixture({reply:m=>({...ok(m),records:[]})});
  const value=await none.client.readLocal();
  assert.deepEqual(value.rows,[]);
  assert.equal(value.linked,false);
  assert.equal(value.persisted,false);
});

test('malformed requests and missing secure random never reach native',async()=>{
  const f=fixture({reply:ok});
  for(const args of [{days:31},{days:0},{metrics:['steps','hrvMs']},{metrics:[]}]){
    await assert.rejects(f.client.readLocal(args),/REQUEST_INVALID/);
  }
  f.scope.crypto.randomUUID=undefined;
  await assert.rejects(f.client.readLocal(),/RANDOM_REQUIRED/);
  assert.equal(f.messages.length,0);
});

test('bridge remains QA-only and productionAllowed=false; native requires explicit one-shot local approval',()=>{
  const source=readFileSync('native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360SecureWebViewActivity.kt','utf8');
  const controller=readFileSync('src/m26/wearables/controller.js','utf8');
  const policy=readFileSync('src/m26/wearables/free-policy.js','utf8');
  assert.match(source,/Connected360OriginGate\.trusted/);
  assert.match(source,/oneReadApproved = false/);
  assert.match(source,/if \(readInFlight \|\| !oneReadApproved\)/);
  assert.match(source,/IberfitHealthConnectReader\(client\)/);
  assert.match(source,/grantedMetrics\(metrics\)/);
  assert.match(source,/readDaily\(permitted, days\)/);
  assert.match(source,/\.put\("grantedMetrics", JSONArray\(permitted\.sorted\(\)\)\)/);
  assert.match(source,/FLAG_DEBUGGABLE/);
  assert.doesNotMatch(source,/addJavascriptInterface|SUPABASE_SERVICE_KEY/);
  assert.match(controller,/qaNative\.readLocal\(\{days:7\}\)/);
  assert.match(controller,/isConnected360QaNativeAvailable/);
  assert.match(policy,/health_connect:policy\(\{[^]*?productionAllowed:false/);
});

test('logout immediately cancels a pending native read and drops late health responses',async()=>{
  const f=fixture({reply:undefined});
  const pending=f.client.readLocal();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(f.messages.length,1);
  assert.equal(f.listeners.size,1);
  f.client.destroy();
  await assert.rejects(pending,/M26_HEALTH_QA_DISPOSED/);
  assert.equal(f.listeners.size,0);
  await assert.rejects(f.client.readLocal(),/M26_HEALTH_QA_DISPOSED/);
});

test('destroy while session refresh is pending never sends any native request',async()=>{
  let release;
  const waitForToken=new Promise(resolve=>{release=resolve;});
  const f=fixture({reply:ok});
  const client=createConnected360QaNativeChannel({
    scope:f.scope,
    getIdentity:()=>REQUESTED_ID,
    getToken:()=>waitForToken,
    timeoutMs:500,
  });
  const pending=client.readLocal();
  client.destroy();
  release('qa-user-session-strong');
  await assert.rejects(pending,/M26_HEALTH_QA_DISPOSED/);
  assert.equal(f.messages.length,0);
});

test('partial Android permission yields only granted metrics; denied fields remain absent',async()=>{
  const f=fixture({reply:message=>({...ok(message),
    grantedMetrics:['steps'],
    records:[{provider:'health_connect',date:'2026-10-08',
      acquiredAt:'2026-10-08T18:12:00Z',steps:5200}],
  })});
  const read=await f.client.readLocal();
  assert.deepEqual(read.grantedMetrics,['steps']);
  assert.deepEqual(read.rows[0].metrics,{steps:5200});
  assert.equal(read.rows[0].metrics.sleepMinutes,undefined);
  assert.equal(read.rows[0].metrics.restingHeartRate,undefined);
});

test('forged native grant scope list fails before exposing any health record',async()=>{
  const f=fixture({reply:message=>({...ok(message),grantedMetrics:['hrvMs']})});
  await assert.rejects(f.client.readLocal(),/M26_HEALTH_QA_RESPONSE_INVALID/);
  const repeated=fixture({reply:message=>({...ok(message),grantedMetrics:['steps','steps']})});
  await assert.rejects(repeated.client.readLocal(),/M26_HEALTH_QA_RESPONSE_INVALID/);
});
