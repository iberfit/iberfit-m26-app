import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnected360ProductionSync} from '../src/m26/wearables/v46-production-sync.js';
import {createConnected360V46ProdNativeChannel,isConnected360ProdNativeAvailable}
  from '../src/m26/wearables/v46-prod-native-channel.js';

const OWNER='11111111-1111-4111-8111-111111111111';
const CLIENT='22222222-2222-4222-8222-222222222222';
const GRANT='33333333-3333-4333-8333-333333333333';
const observed='2026-10-12T14:00:00Z';
const clock=Date.parse(observed);
function fixture({
  enabled=true,authorized=true,scopes=['generalHeartRate','exerciseSessions'],
  switchOwnerOnRead=false,midreadRevoke=false,
}={}){
  let identity={role:'client',ownerId:OWNER,clientId:CLIENT};
  let state={authorized,grantId:authorized?GRANT:null,revocationCursor:0,scopes};
  const writes=[],events=[];
  const data={schema:'iberfit.connected360.v46.ingest.v1',
    heartRateDaily:[{date:'2026-10-12',aggregationTimeZone:'America/Santiago',
      windowStartedAt:'2026-10-12T03:00:00Z',windowEndedAt:observed,
      acquiredAt:observed,sampleCount:700,minBpm:53,maxBpm:171}],
    exerciseEvidence:[{observationKey:'a'.repeat(64),sport:'running',
      startedAt:'2026-10-12T10:00:00Z',endedAt:'2026-10-12T10:45:00Z',
      acquiredAt:observed,heartRateSamples:25,avgBpm:130,minBpm:100,maxBpm:155,
      distanceMeters:6000}],
  };
  const transport={
    connected360ProductionCapabilities:async()=>{
      events.push('capabilities');
      return {ok:true,serverEnabled:enabled};
    },
    wearableAuthorizationStatus:async()=>{
      events.push('status');
      return {...state,scopes:[...state.scopes]};
    },
    authorizeConnected360Production:async(_token,{expectedCursor,expectedGrant,scopes})=>{
      events.push('authorize');
      assert.equal(expectedCursor,0);
      assert.equal(expectedGrant,state.grantId);
      state={authorized:true,grantId:GRANT,revocationCursor:0,
        scopes:[...new Set([...state.scopes,...scopes])]};
      return {ok:true,provider:'health_connect',grantId:GRANT,
        revocationCursor:0,scopes:[...state.scopes]};
    },
    importConnected360Production:async(_token,grant,payload)=>{
      events.push('import');
      writes.push({grant,payload});
      return {ok:true,persisted:true,automatic:false,inserted:
        payload.heartRateDaily.length+payload.exerciseEvidence.length,
        updated:0,unchanged:0};
    },
  };
  const native={
    readLocal:async({metrics})=>{
      events.push('read');
      if(switchOwnerOnRead)identity={...identity,ownerId:'44444444-4444-4444-8444-444444444444'};
      if(midreadRevoke)state={...state,authorized:false,grantId:null,scopes:[]};
      return {ownerId:OWNER,clientId:CLIENT,provider:'health_connect',
        persisted:false,metrics,envelope:data};
    },
    invalidate:()=>events.push('invalidate'),
    destroy:()=>events.push('destroy'),
  };
  const api=createConnected360ProductionSync({
    transport,native,getIdentity:()=>identity,
    getToken:async()=> 'synthetic-production-JWT-for-unit-tests',
    isOnline:()=>true,now:()=>clock,refreshState:async()=>{},
  });
  return {api,events,writes,setState:x=>{state=x;}};
}
test('production refuses to authorize or ingest if the server rollout switch is off',async()=>{
  const x=fixture({enabled:false,authorized:false,scopes:[]});
  await assert.rejects(x.api.authorize(['generalHeartRate']),/NOT_ACTIVATED/u);
  const out=await x.api.sync();
  assert.equal(out.skipped,'release-disabled');
  assert.equal(x.writes.length,0);
  x.api.destroy();
});
test('first-day user consent is independent from Android OS read',async()=>{
  const x=fixture({authorized:false,scopes:[]});
  await x.api.authorize(['generalHeartRate','exerciseSessions']);
  assert.equal(x.events.includes('read'),false);
  const out=await x.api.sync();
  assert.equal(out.ok,true);
  assert.equal(out.inserted,2);
  assert.equal(x.writes[0].grant,GRANT);
  assert.equal(x.writes[0].payload.schema,'iberfit.connected360.v46.ingest.v1');
  assert.ok(x.events.indexOf('authorize')<x.events.indexOf('read'));
  x.api.destroy();
});
test('exercise-only consent never transmits pulse data',async()=>{
  const x=fixture({scopes:['exerciseSessions']});
  const out=await x.api.sync();
  assert.equal(out.inserted,1);
  assert.equal(x.writes[0].payload.heartRateDaily.length,0);
  const exercise=x.writes[0].payload.exerciseEvidence[0];
  for(const field of ['heartRateSamples','avgBpm','minBpm','maxBpm'])
    assert.equal(Object.hasOwn(exercise,field),false);
  x.api.destroy();
});
test('revocation while OS is reading blocks late backend writes',async()=>{
  const x=fixture({midreadRevoke:true});
  await assert.rejects(x.api.sync(),/CONSENT_REVOKED/u);
  assert.equal(x.writes.length,0);
  x.api.destroy();
});
test('switching user while reading cannot export data into next client',async()=>{
  const x=fixture({switchOwnerOnRead:true});
  await assert.rejects(x.api.sync(),/OWNER_CHANGED/u);
  assert.equal(x.writes.length,0);
  x.api.destroy();
});
test('background invalidation permits a subsequent read, unlike logout',async()=>{
  const x=fixture();
  x.api.invalidate();
  assert.ok(x.events.includes('invalidate'));
  const out=await x.api.sync();
  assert.equal(out.ok,true);
  x.api.destroy();
  assert.ok(x.events.includes('destroy'));
  await assert.rejects(x.api.sync(),/DISPOSED/u);
});
test('native channel is pinned to production HTTPS and a private bridge',()=>{
  const base={IBERFIT_CONNECTED360_NATIVE:{postMessage(){},addEventListener(){}},
    location:{origin:'https://app.iberfit.cl'}};
  assert.equal(isConnected360ProdNativeAvailable(base),true);
  assert.equal(isConnected360ProdNativeAvailable({
    ...base,location:{origin:'https://m26-canary.iberfit.cl'},
  }),false);
  assert.equal(isConnected360ProdNativeAvailable({
    ...base,location:{origin:'http://app.iberfit.cl'},
  }),false);
  assert.equal(typeof createConnected360V46ProdNativeChannel,'function');
});
test('production migration enforces closed-by-default, owner scope and erased data',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261012160000_connected360_production_native_e2e_macro.sql',import.meta.url),'utf8');
  for(const x of ['m26_wearable_v46_authorize_prod_v1','m26_wearable_v46_import_prod_v1',
    'm26_wearable_v46_release_control_prod','m26_wearable_v46_cleanup_prod_v1',
    'M26_V46_WORKOUT_HR_SCOPE_DENIED','M26_V46_PRODUCTION_DISABLED','M26_V46_GRANT_REVOKED'])
    assert.ok(sql.includes(x),x);
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/u);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/u);
  assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon/u);
  assert.doesNotMatch(sql,/grant insert on table public\.m26_wearable_/iu);
  assert.doesNotMatch(sql,/source_identity_verified\s*=\s*true/iu);
});

test('production client observation read model is owner-only and does not infer resting HR',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261012160000_connected360_production_native_e2e_macro.sql',import.meta.url),'utf8');
  const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.m26_wearable_v46_my_summary_prod_v1()');
  const end=sql.indexOf('$my_summary$;',start);
  assert.ok(start>=0&&end>start);
  const func=sql.slice(start,end);
  assert.match(func,/public\.iberfit_require_privileged_assurance_v65d/u);
  assert.match(func,/auth\.uid\(\)/u);
  assert.match(func,/public\.iberfit_client_id\(\)/u);
  assert.match(func,/owner_user_id=v_owner AND client_id=v_client/g);
  assert.match(func,/'restingHeartRate',null/u);
  assert.match(func,/'linkedToTraining',false/u);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.m26_wearable_v46_my_summary_prod_v1\(\) FROM PUBLIC,anon/u);
  const t=readFileSync(new URL('../src/m26/supabase-transport.js',import.meta.url),'utf8');
  assert.match(t,/async function connected360ProductionSummary\(token\)/u);
  assert.match(t,/assertConnected360Production\(\)/u);
  assert.match(t,/r\.restingHeartRate!==null/u);
});
test('client UI renders observations only for original signed-in owner and differentiates FC reposo',()=>{
  const c=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(c,/expected\.ownerId!==current\.ownerId/u);
  assert.match(c,/expected\.clientId!==current\.clientId/u);
  assert.match(c,/Connected360ProductionSummary|connected360ProductionSummary/u);
  assert.match(c,/No equivalen a FC en reposo/u);
  assert.match(c,/qaV46Importer\.destroy\(\)/u);
});

test('foreground restart never joins an invalidated native-sync promise',async()=>{
  let releaseToken;
  let first=true;
  const blocked=new Promise(resolve=>{releaseToken=resolve;});
  const writes=[];
  const identity={role:'client',ownerId:OWNER,clientId:CLIENT};
  const scopes=['generalHeartRate'];
  const transport={
    connected360ProductionCapabilities:async()=>({serverEnabled:true}),
    wearableAuthorizationStatus:async()=>({authorized:true,grantId:GRANT,revocationCursor:0,scopes}),
    importConnected360Production:async()=>{writes.push('write');return {inserted:1,updated:0,unchanged:0};},
  };
  const native={readLocal:async()=>({
    provider:'health_connect',ownerId:OWNER,clientId:CLIENT,persisted:false,metrics:scopes,
    envelope:{schema:'iberfit.connected360.v46.ingest.v1',
      heartRateDaily:[{date:'2026-10-12',sampleCount:1}],exerciseEvidence:[]},
  }),invalidate:()=>{}};
  const api=createConnected360ProductionSync({transport,native,getIdentity:()=>identity,
    getToken:()=>first?(first=false,blocked):Promise.resolve('valid-token'),
    isOnline:()=>true,refreshState:async()=>{}});
  const old=api.sync();
  api.invalidate();
  assert.equal((await api.sync()).ok,true);
  releaseToken('valid-token');
  await assert.rejects(old,/M26_V46_PROD_ABORTED/u);
  assert.equal(writes.length,1);
  api.destroy();
});

test('future running, power and recovery variables stay ungranted even with OS scope',async()=>{
  const {CONNECTED360_METRIC_CATALOGUE,CONNECTED360_RELEASED_V46_SCOPES,
    evaluateConnected360V46Scope}=await import('../src/m26/wearables/measurement-capability-contract.js');
  assert.deepEqual(CONNECTED360_RELEASED_V46_SCOPES,['generalHeartRate','exerciseSessions']);
  for(const key of ['runningPace','runningCadence','runningIntervals','trainingLoad',
    'heartRateVariability','cyclingPower','recoveryContext']){
    assert.equal(CONNECTED360_METRIC_CATALOGUE[key].stage,'future');
    assert.equal(evaluateConnected360V46Scope(key,{
      explicitConsent:[key],osPermission:[key],releaseEnabled:true,
    }).reason,'requires-independent-release');
  }
  assert.equal(evaluateConnected360V46Scope('generalHeartRate',{
    explicitConsent:['generalHeartRate'],osPermission:['generalHeartRate'],releaseEnabled:true,
  }).allowed,true);
  assert.equal(evaluateConnected360V46Scope('exerciseSessions',{
    explicitConsent:['exerciseSessions'],osPermission:[],releaseEnabled:true,
  }).reason,'os-permission-required');
});

test('Android production UI hides diagnostic chrome and handles broken network/TLS',()=>{
  const kotlin=readFileSync(new URL('../native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360SecureWebViewActivity.kt',import.meta.url),'utf8');
  assert.match(kotlin,/if \(!production\) root\.addView\(permissions\)/u);
  assert.match(kotlin,/visibility = if \(production\) View\.GONE else View\.VISIBLE/u);
  assert.match(kotlin,/override fun onReceivedError\(/u);
  assert.match(kotlin,/"health\.readDaily" -> \{[\s\S]{0,300}if \(production\)/u);
  assert.match(kotlin,/"health\.permissions" ->/u);
  assert.match(kotlin,/Error de certificado TLS\. Canal bloqueado\./u);
});
