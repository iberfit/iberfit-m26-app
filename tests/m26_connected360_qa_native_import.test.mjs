import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnected360QaImporter} from '../src/m26/wearables/qa-native-import.js';

const CLIENT='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const GRANT='33333333-3333-4333-8333-333333333333';
const ACQUIRED='2026-10-09T15:00:00Z';
const NOW=Date.parse(ACQUIRED)+120000;
const row={provider:'health_connect',date:'2026-10-09',acquiredAt:ACQUIRED,
  metrics:{steps:5400,sleepMinutes:418,restingHeartRate:58}};
const preview=(overrides={})=>({
  provider:'health_connect',linked:false,persisted:false,userConfirmedLocalRead:true,
  grantedMetrics:['steps','sleepMinutes','restingHeartRate'],rows:[row],...overrides,
});
function setup({online=true,identity={role:'client',clientId:CLIENT,ownerId:'user-A'},
  grant={grantId:GRANT},rpc={ok:true,accepted:1,stale:0,rejected:0},
  token='client-JWT-for-supabase',afterGrant=()=>{},afterStatus=()=>{},
  currentGrant=grant,
  validation={ok:true,validated:1,persisted:false,automatic:false,
    sourceTimeVerified:false,sourceIdentityVerified:false,provider:'health_connect'},
  afterValidation=()=>{}}={}){
  const state={online,identity,now:NOW,calls:[],writes:[],validations:[]};
  const scope={location:{origin:'https://m26-canary.iberfit.cl'},
    IBERFIT_CONNECTED360_QA:{
      addEventListener(){},postMessage(){},
    }};
  const importer=createConnected360QaImporter({
    scope,isOnline:()=>state.online,now:()=>state.now,
    getIdentity:()=>state.identity,
    getToken:async()=>token,
    remoteSync:{
      reauthorize:async x=>{state.calls.push(x);await afterGrant(state);return grant;},
      currentAuthorization:async x=>{
        state.calls.push({verify:x});await afterStatus(state);return currentGrant;
      },
    },
    transport:{
      validateConnected360QaNativePreview:async(...args)=>{
        state.validations.push(args);
        await afterValidation(state);
        return validation;
      },
      importWearableAuthorized:async(...args)=>{
      state.writes.push(args);
      return rpc;
    }},
    refreshState:async()=>{state.calls.push('refresh');},
  });
  return {importer,state};
}

test('QA capture is ephemeral; no implicit grant or network request before explicit consent',async()=>{
  const {importer,state}=setup();
  assert.deepEqual(importer.capture(preview()),{
    recordCount:1,scopes:['steps','sleepMinutes','restingHeartRate'],
    clientControlled:true,persisted:false,
  });
  assert.equal(importer.hasPreview(),true);
  assert.deepEqual(state.calls,[]);
  assert.deepEqual(state.writes,[]);
  await assert.rejects(importer.commit(),/EXPLICIT_CONSENT_REQUIRED/);
  assert.equal(state.calls.length,0);
});

test('explicit Canary authorization imports exact owner-bound records online, no local queue',async()=>{
  const {importer,state}=setup();
  importer.capture(preview());
  const response=await importer.commit({confirmed:true});
  assert.equal(response.ok,true);
  assert.equal(response.persisted,true);
  assert.equal(response.automatic,false);
  assert.equal(response.imported,1);
  assert.equal(importer.hasPreview(),false);
  assert.deepEqual(state.calls[0],{
    provider:'health_connect',scopes:['steps','sleepMinutes','restingHeartRate'],
  });
  assert.deepEqual(state.calls[1],{
    verify:{provider:'health_connect',scopes:['steps','sleepMinutes','restingHeartRate']},
  });
  assert.deepEqual(state.calls[2],'refresh');
  assert.equal(state.validations.length,1);
  assert.equal(state.validations[0][1],GRANT);
  assert.equal(state.validations[0][2].records[0].provenance.sourceUpdatedAt,null);
  assert.equal(state.validations[0][2].records[0].provenance.automaticSyncCertified,false);
  assert.equal(state.writes.length,1);
  assert.equal(state.writes[0][0],'client-JWT-for-supabase');
  assert.equal(state.writes[0][1],GRANT);
  const record=state.writes[0][2].records[0];
  assert.equal(record.clientId,CLIENT,'Client identity comes from session, never Android');
  assert.equal(record.sourceUpdatedAt,'2026-10-09T15:00:00.000Z');
  assert.equal(record.quality,'limitada');
  assert.deepEqual(record.metrics,row.metrics);
  assert.equal(record.sourceRecordCount,1);
  assert.equal(state.writes[0][2].records.length,1);
  assert.equal(record.acquiredAt,undefined,'V44 schema does not support separate provenance field');
  assert.equal(record.measuredAt,undefined,'unknown sensor timestamp must never be fabricated');
  assert.equal(record.provenance,undefined,'private V45 evidence must not leak to legacy RPC');
});

test('Android source origins are never persisted as certified watches or native timestamps',async()=>{
  const {importer,state}=setup();
  importer.capture(preview({rows:[{...row,contributingOriginCount:2}]}));
  await importer.commit({confirmed:true});
  const preflight=state.validations[0][2];
  const legacy=state.writes[0][2];
  assert.doesNotMatch(JSON.stringify(preflight),/contributingOriginCount|sourcePackageName|physicalWatchId/u);
  assert.doesNotMatch(JSON.stringify(legacy),/contributingOriginCount|sourcePackageName|physicalWatchId/u);
  assert.equal(preflight.records[0].provenance.sourceIdentity,null);
  assert.equal(preflight.records[0].provenance.sourceTimestampVerified,false);
  assert.equal(state.writes.length,1);
});

test('partial permissions never fabricate sleep or resting HR, and never request extra scopes',async()=>{
  const {importer,state}=setup();
  importer.capture(preview({
    grantedMetrics:['steps'],
    rows:[{...row,metrics:{steps:6500}}],
  }));
  await importer.commit({confirmed:true});
  assert.deepEqual(state.calls[0].scopes,['steps']);
  assert.deepEqual(state.writes[0][2].records[0].metrics,{steps:6500});
});

test('logout/switch before grant completion prevents sending data to Supabase',async()=>{
  const f=setup({afterGrant:state=>{state.identity={...state.identity,clientId:OTHER};}});
  f.importer.capture(preview());
  await assert.rejects(f.importer.commit({confirmed:true}),/SESSION_CHANGED/);
  assert.equal(f.state.writes.length,0);
});

test('offline, rejected consent, stale provider or old read cannot upload',async()=>{
  const offline=setup({online:false});
  offline.importer.capture(preview());
  await assert.rejects(offline.importer.commit({confirmed:true}),/ONLINE_REQUIRED/);
  assert.equal(offline.state.calls.length,0);
  const stale=setup({grant:{grantId:null}});
  stale.importer.capture(preview());
  await assert.rejects(stale.importer.commit({confirmed:true}),/GRANT_INVALID/);
  assert.equal(stale.state.writes.length,0);
  const expired=setup();
  expired.importer.capture(preview());
  expired.state.now+=21*60*1000;
  await assert.rejects(expired.importer.commit({confirmed:true}),/PREVIEW_EXPIRED/);
  assert.equal(expired.state.calls.length,0);
});

test('server partial/rejected acknowledgement is never reported as successful import',async()=>{
  for(const rpc of [
    {ok:true,accepted:0,stale:0,rejected:1},
    {ok:true,accepted:0,stale:0,rejected:0},
    {ok:false,accepted:1,stale:0,rejected:0},
  ]){
    const f=setup({rpc});
    f.importer.capture(preview());
    await assert.rejects(f.importer.commit({confirmed:true}),/REMOTE_IMPORT_UNVERIFIED/);
    assert.equal(f.importer.hasPreview(),true,'never erase unacknowledged preview');
    assert.equal(f.state.calls.includes('refresh'),false);
  }
});

test('cannot rebind a preview to another client or use a forged future timestamp',async()=>{
  const f=setup();
  f.importer.capture(preview());
  f.state.identity={...f.state.identity,clientId:OTHER};
  await assert.rejects(f.importer.commit({confirmed:true}),/SESSION_CHANGED/);
  assert.equal(f.state.calls.length,0);
  const t=setup();
  assert.throws(()=>t.importer.capture(preview({rows:[
    {...row,acquiredAt:'2030-01-01T00:00:00Z'}]})),/PREVIEW_EXPIRED/);
  assert.equal(t.importer.hasPreview(),false);
});

test('malformed/replaced preview cannot persist old data or expand permissions',()=>{
  const f=setup();
  f.importer.capture(preview());
  assert.throws(()=>f.importer.capture(preview({
    grantedMetrics:['steps'],rows:[row],
  })),/PREVIEW_SCOPE_INVALID/);
  assert.equal(f.importer.hasPreview(),false);
  assert.throws(()=>f.importer.capture(preview({
    rows:[{...row,date:'2026-02-31'}],
  })),/PREVIEW_INVALID/);
  assert.equal(f.importer.hasPreview(),false);
});

test('role and origin gates make QA importer inaccessible to normal clients and Coaches',()=>{
  for(const identity of [
    {role:'coach',clientId:CLIENT,ownerId:'user-A'},
    {role:'client',clientId:'not-a-uuid',ownerId:'user-A'},
  ]){
    const f=setup({identity});
    assert.throws(()=>f.importer.capture(preview()),/CLIENT_REQUIRED/);
  }
  const f=setup();
  f.importer.destroy();
  assert.throws(()=>f.importer.capture(preview()),/DISPOSED/);
  assert.equal(f.importer.hasPreview(),false);
  const source=readFileSync(new URL('../src/m26/wearables/qa-native-import.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/remoteSync\.stage\(|createBrowserKeyValueStore|localStorage\.setItem/u,
    'Native QA health records must never be queued locally');
  const policy=readFileSync(new URL('../src/m26/wearables/free-policy.js',import.meta.url),'utf8');
  assert.match(policy,/health_connect:policy\(\{[^]*?productionAllowed:false/u);
});

test('QA UI requires an explicitly checked consent input, never a browser-native dialog',()=>{
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(controller,/check\.type='checkbox'/u);
  assert.match(controller,/check\.dataset\.qaHealthConsent='true'/u);
  assert.match(controller,/if\(!qaImporter\.hasPreview\(\)\|\|check\?\.checked!==true\)/u);
  assert.match(controller,/qaImporter\.commit\(\{confirmed:true\}\)/u);
  assert.match(controller,/function onChange\(event\)/u);
  assert.match(controller,/root\.addEventListener\('change',onChange\)/u);
  assert.match(controller,/action==='qa-health-discard'/u);
  assert.match(controller,/qaImporter\.clear\(\)/u);
  assert.match(controller,/qaImporter\.destroy\(\)/u);
  assert.match(controller,/function clearQaSensitiveSurface\(\)/u);
  assert.match(controller,/\[data-qa-health-records\]/u);
  assert.match(controller,/list\.textContent=''/u);
  assert.match(controller,/item\.textContent=row\.date/u);
  assert.match(controller,/details\.hidden=false/u);
  assert.match(controller,/let qaReadEpoch=0/u);
  assert.match(controller,/const epoch=\+\+qaReadEpoch/u);
  assert.match(controller,/if\(epoch!==qaReadEpoch\)return/u);
  assert.match(controller,/qaImporter\.isBusy\(\)/u);
  assert.match(controller,/root\.removeEventListener\('change',onChange\)/u);
  assert.match(controller,/productionAllowed/u);
  assert.doesNotMatch(controller.slice(controller.indexOf("action==='qa-health-confirm'"),
    controller.indexOf("action==='qa-health-discard'")),/globalThis\.confirm\?/u);
});

test('revoke before dispatch or stale server generation must stop the health import',async()=>{
  const stale=setup({currentGrant:{grantId:'44444444-4444-4444-8444-444444444444'}});
  stale.importer.capture(preview());
  await assert.rejects(stale.importer.commit({confirmed:true}),/GRANT_STALE/);
  assert.equal(stale.state.writes.length,0);
  const revoked=setup({afterStatus:()=>{throw Error('M26_WEARABLE_SOURCE_REVOKED');}});
  revoked.importer.capture(preview());
  await assert.rejects(revoked.importer.commit({confirmed:true}),/SOURCE_REVOKED/);
  assert.equal(revoked.state.writes.length,0);
});

test('discard after server consent but before dispatch blocks any further upload',async()=>{
  const f=setup({afterGrant:()=>{f.importer.clear();}});
  f.importer.capture(preview());
  await assert.rejects(f.importer.commit({confirmed:true}),/PREVIEW_DISCARDED/);
  assert.equal(f.state.writes.length,0);
  assert.equal(f.importer.hasPreview(),false);
});

test('session change after consent-status check blocks direct server RPC',async()=>{
  const f=setup({afterStatus:state=>{
    state.identity={...state.identity,clientId:OTHER};
  }});
  f.importer.capture(preview());
  await assert.rejects(f.importer.commit({confirmed:true}),/SESSION_CHANGED/);
  assert.equal(f.state.writes.length,0);
});

test('server v45 preflight denial cannot fall back to an unvalidated v44 write',async()=>{
  const f=setup({validation:{ok:true,validated:1,persisted:true,automatic:false,
    sourceTimeVerified:false,sourceIdentityVerified:false,provider:'health_connect'}});
  f.importer.capture(preview());
  await assert.rejects(f.importer.commit({confirmed:true}),/PREFLIGHT_INVALID_RESPONSE/);
  assert.equal(f.state.writes.length,0);
  assert.equal(f.importer.hasPreview(),true);
});
test('account switch during v45 preflight prevents the final v44 import',async()=>{
  const f=setup({afterValidation:state=>{
    state.identity={...state.identity,clientId:OTHER};
  }});
  f.importer.capture(preview());
  await assert.rejects(f.importer.commit({confirmed:true}),/SESSION_CHANGED/);
  assert.equal(f.state.validations.length,1);
  assert.equal(f.state.writes.length,0);
});
