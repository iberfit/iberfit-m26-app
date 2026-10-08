import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMemoryKeyValueStore} from '../src/m26/platform/key-value-store.js';
import {createWearableRemoteSync} from '../src/m26/wearables/remote-sync.js';

const UUIDS=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const RECORD={clientId:'client-connected360-qa',provider:'normalized_file',date:'2026-10-08',
 metrics:{steps:1200,activeMinutes:40,sleepMinutes:null,restingHeartRate:null,
 hrvMs:null,activeEnergyKcal:null,workoutMinutes:null},
 quality:'media',sourceUpdatedAt:'2026-10-08T10:00:00Z',sourceRecordCount:1};

test('Consent is never auto-issued by background flush or stale offline data',async()=>{
  let online=false,reauthCount=0,legacy=0,v2=0,linkWrites=0;
  const store=createMemoryKeyValueStore();
  const transport={
    async importWearableSummaries(){legacy++;return {accepted:1,rejected:0,stale:0};},
    async importWearableAuthorized(_token,grant,payload){
      v2++;assert.equal(grant,UUIDS[0]);assert.equal(payload.records[0].clientId,RECORD.clientId);
      return {accepted:1,rejected:0,stale:0};
    },
    async upsertWearableConnection(){linkWrites++;return {ok:true};},
    async wearableAuthorizationStatus(){return {provider:'normalized_file',revocationCursor:4,grantId:null,authorized:false};},
    async reauthorizeWearable(){reauthCount++;return {ok:true,grantId:UUIDS[0],scopes:['steps','activeMinutes']};},
    async revokeWearableConnection(){return {ok:true};},
    async deleteWearableData(){return {ok:true};},
  };
  const remote=createWearableRemoteSync({ownerId:'c360-qa',queueStore:store,transport,
    getToken:async()=>'qa-token',isOnline:()=>online});
  await assert.rejects(remote.stage({clientId:RECORD.clientId,provider:'normalized_file',records:[RECORD]}),
    /M26_CONNECTED360_ONLINE_REAUTHORIZE_REQUIRED/u);
  await store.set('m26:wearable-sync:v44:owner/c360-qa/'+RECORD.clientId+':normalized_file:'+RECORD.date,
    {ownerId:'c360-qa',clientId:RECORD.clientId,provider:'normalized_file',
      record:RECORD,authorizationGrant:null,attempts:0});
  assert.equal(await remote.pendingCount(),1);
  assert.equal(reauthCount,0);
  const authAttempt=remote.reauthorize({provider:'normalized_file',scopes:['steps']});
  await assert.rejects(authAttempt,/M26_CONNECTED360_ONLINE_REAUTHORIZE_REQUIRED/u);
  online=true;
  const consent=await remote.reauthorize({provider:'normalized_file',scopes:['steps','activeMinutes']});
  assert.equal(consent.grantId,UUIDS[0]);assert.equal(reauthCount,1);
  assert.equal(await remote.pendingCount(),0,'pre-grant queue must be discarded, never upgraded');
  await remote.stage({clientId:RECORD.clientId,provider:'normalized_file',records:[RECORD]});
  assert.equal(v2,1);assert.equal(legacy,0);assert.equal(linkWrites,0,
    'generation-bound server RPC updates connections atomically');
  await remote.flush();
  assert.equal(reauthCount,1,'automatic flush must never mint another grant');
});

test('Provider revocation and global erase block even an already issued file grant',async()=>{
  let online=true,number=0,revoked=0,deletes=0;
  const store=createMemoryKeyValueStore();
  const transport={
    async wearableAuthorizationStatus(){return {provider:'normalized_file',revocationCursor:number,grantId:null,authorized:false};},
    async reauthorizeWearable(){return {ok:true,grantId:UUIDS[number],scopes:['steps']};},
    async importWearableAuthorized(_token,grant){assert.equal(grant,UUIDS[number]);return {accepted:1,rejected:0,stale:0};},
    async upsertWearableConnection(){throw Error('legacy-write-not-allowed');},
    async importWearableSummaries(){throw Error('legacy-import-not-allowed');},
    async revokeWearableConnection(){revoked++;number++;return {ok:true};},
    async deleteWearableData(){deletes++;return {ok:true};},
  };
  const remote=createWearableRemoteSync({ownerId:'c360-qa-2',transport,queueStore:store,
    isOnline:()=>online,getToken:async()=>'qa-token'});
  await remote.reauthorize({provider:'normalized_file',scopes:['steps']});
  await remote.revoke({provider:'normalized_file',deleteData:true});
  assert.equal(revoked,1);
  await assert.rejects(remote.stage({clientId:RECORD.clientId,provider:'normalized_file',records:[RECORD]}),
    /M26_WEARABLE_SOURCE_REVOKED/u);
  await remote.reauthorize({provider:'normalized_file',scopes:['steps']});
  await remote.stage({clientId:RECORD.clientId,provider:'normalized_file',records:[RECORD]});
  await remote.deleteAll();
  assert.equal(deletes,1);
  await assert.rejects(remote.stage({clientId:RECORD.clientId,provider:'normalized_file',records:[RECORD]}),
    /M26_WEARABLE_SOURCE_REVOKED/u);
});

test('Postgres reauthorization is CAS, generation-specific, client-scoped and file-only',()=>{
  const migration=readFileSync('supabase/migrations/20261008173000_connected360_explicit_reauthorization_v2.sql','utf8');
  assert.match(migration,/M26_CONNECTED360_CONSENT_VERSION_CONFLICT/u);
  assert.match(migration,/M26_CONNECTED360_GRANT_STALE/u);
  assert.match(migration,/M26_CONNECTED360_GRANT_REVOKED/u);
  assert.match(migration,/m26_wearable_import_authorized_v2/u);
  assert.match(migration,/m26_wearable_reauthorize_v2/u);
  assert.match(migration,/v_provider<>'normalized_file'/u);
  assert.match(migration,/v_grant_id:=pg_catalog.current_setting/u);
  assert.match(migration,/pg_catalog.pg_advisory_xact_lock/u);
  assert.match(migration,/grant execute on function public.m26_wearable_reauthorize_v2\([\s\S]*?to authenticated;/u);
  assert.match(migration,/revoke all on function public.m26_wearable_reauthorize_v2\([\s\S]*?from public,anon;/u);
  assert.doesNotMatch(migration,/\bdrop\s+(?:table|trigger|function|policy)\b/iu);
  assert.doesNotMatch(migration,/\bdo\s+\$/iu);
  assert.match(migration,/insert into public.m26_wearable_revocation_events_v2\(owner_user_id,client_id,provider\)/u);
  assert.match(migration,/m26_wearable_authorization_v2 enable row level security/u);
});

test('Activity source actions require Client confirmation and imported file scope consent',()=>{
  const c=readFileSync('src/m26/wearables/controller.js','utf8');
  const route=readFileSync('src/m26/modules/route-render.js','utf8');
  assert.match(c,/remoteSync\.reauthorize\(\{provider:currentPreview.provider,scopes\}\)/u);
  assert.doesNotMatch(c,/currentPreview\.provider==='normalized_file'/u);
  assert.match(c,/if\(!isOnline\(\)\)throw new Error\('M26_CONNECTED360_ONLINE_REAUTHORIZE_REQUIRED'\)/u);
  assert.match(c,/authorizationGrant:grant/u);
  assert.match(c,/action==='revoke-source'\|\|action==='remove-source-data'/u);
  assert.match(c,/globalThis\.confirm\?\.\(/u);
  assert.match(route,/wearable\.canControl&&wearable\.connections\?\.length/u);
  assert.match(route,/data-wearable-action="revoke-source"/u);
  assert.match(route,/data-wearable-action="remove-source-data"/u);
  const sync=readFileSync('src/m26/wearables/remote-sync.js','utf8');
  assert.match(sync,/if\(groupEntries\[0\]\[1\]\.authorizationGrant\)continue/u);
  assert.match(sync,/authorizationGrant:grant/u);
});

test('A rejected legacy batch is quarantined, never retried automatically, and explicit consent clears it',async()=>{
  const store=createMemoryKeyValueStore();let calls=0,reattempt=0,online=true;
  const transport={
    async importWearableSummaries(){throw Error('legacy file import must never execute');},
    async importWearableAuthorized(){calls++;return {accepted:0,rejected:1,stale:0};},
    async upsertWearableConnection(){return {ok:true};},
    async wearableAuthorizationStatus(){return {provider:'normalized_file',authorized:false,grantId:null,revocationCursor:0};},
    async reauthorizeWearable(){reattempt++;return {ok:true,grantId:UUIDS[0]};},
  };
  const remote=createWearableRemoteSync({ownerId:'c360-failclosed-qa',transport,
    queueStore:store,getToken:async()=>'qa-token',isOnline:()=>online});
  await assert.rejects(remote.stage({clientId:RECORD.clientId,provider:RECORD.provider,
    records:[RECORD],authorizationGrant:UUIDS[0]}),
    /M26_WEARABLE_REMOTE_REJECTED/u);
  assert.equal(calls,1);
  assert.equal(await remote.pendingCount(),1,'data kept for explicit review');
  await remote.flush();
  assert.equal(calls,1,'non-transient invalid input must not be retried in a loop');
  await remote.reauthorize({provider:'normalized_file',scopes:['steps']});
  assert.equal(reattempt,1);
  assert.equal(await remote.pendingCount(),0,'old data cannot inherit the new generation');
});

test('Legacy offline records are erased locally once a different device revoked consent',async()=>{
  const store=createMemoryKeyValueStore();let online=false,uploads=0;
  const transport={
    async wearableAuthorizationStatus(){return {provider:'normalized_file',revocationCursor:5,authorized:false,grantId:null};},
    async importWearableSummaries(){uploads++;throw Error('must-not-upload-stale-batch');},
  };
  const sync=createWearableRemoteSync({ownerId:'c360-cross-device-qa',queueStore:store,
    transport,getToken:async()=>'qa-token',isOnline:()=>online});
  await store.set('m26:wearable-sync:v44:owner/c360-cross-device-qa/'+RECORD.clientId+':normalized_file:'+RECORD.date,
    {ownerId:'c360-cross-device-qa',clientId:RECORD.clientId,provider:'normalized_file',
      record:RECORD,authorizationGrant:null,attempts:0});
  assert.equal(await sync.pendingCount(),1);
  online=true;
  const result=await sync.flush();
  assert.equal(uploads,0);
  assert.equal(result.discarded,1);
  assert.equal(await sync.pendingCount(),0);
  await assert.rejects(sync.stage({clientId:RECORD.clientId,provider:'normalized_file',records:[RECORD]}),
    /M26_WEARABLE_SOURCE_REVOKED/u);
});

test('Ungrantable normalized files are rejected online and offline without a legacy upload',async()=>{
  let online=false,uploads=0;
  const remote=createWearableRemoteSync({ownerId:'c360-no-consent',queueStore:createMemoryKeyValueStore(),
    transport:{async importWearableSummaries(){uploads++;return {accepted:1};}},
    getToken:async()=>'qa-token',isOnline:()=>online});
  for(const state of [false,true]){
    online=state;
    await assert.rejects(remote.stage({clientId:RECORD.clientId,provider:RECORD.provider,records:[RECORD]}),
      /M26_CONNECTED360_ONLINE_REAUTHORIZE_REQUIRED/u);
  }
  assert.equal(uploads,0);
  assert.equal(await remote.pendingCount(),0);
});

test('Legacy ungranted queue is discarded even if the revocation cursor is zero',async()=>{
  const store=createMemoryKeyValueStore();let legacy=0;
  await store.set('m26:wearable-sync:v44:owner/c360-cursor-zero/'+RECORD.clientId+':normalized_file:'+RECORD.date,
    {ownerId:'c360-cursor-zero',clientId:RECORD.clientId,provider:'normalized_file',
      record:RECORD,authorizationGrant:null,attempts:0});
  const remote=createWearableRemoteSync({ownerId:'c360-cursor-zero',queueStore:store,
    transport:{
      async wearableAuthorizationStatus(){return {authorized:false,revocationCursor:0};},
      async importWearableSummaries(){legacy++;return {accepted:1};},
    },getToken:async()=>'qa-token',isOnline:()=>true});
  const result=await remote.flush();
  assert.equal(result.discarded,1);
  assert.equal(legacy,0);
  assert.equal(await remote.pendingCount(),0);
});

test('Repeated confirmation preserves pending data under the unchanged authorization generation',async()=>{
  const store=createMemoryKeyValueStore();let online=false,upload=0;
  const remote=createWearableRemoteSync({ownerId:'c360-repeat',queueStore:store,
    transport:{
      async wearableAuthorizationStatus(){return {authorized:true,grantId:UUIDS[0],
        revocationCursor:0,scopes:['steps','activeMinutes']};},
      async reauthorizeWearable(){throw Error('must not issue redundant grant');},
      async importWearableAuthorized(_token,grant){assert.equal(grant,UUIDS[0]);upload++;return {accepted:1,rejected:0,stale:0};},
    },getToken:async()=>'qa-token',isOnline:()=>online});
  await remote.stage({clientId:RECORD.clientId,provider:RECORD.provider,
    records:[RECORD],authorizationGrant:UUIDS[0]});
  assert.equal(await remote.pendingCount(),1);
  online=true;
  const result=await remote.reauthorize({provider:'normalized_file',scopes:['steps']});
  assert.equal(result.alreadyAuthorized,true);
  assert.equal(await remote.pendingCount(),1,'active-generation queue must remain intact');
  await remote.flush();
  assert.equal(upload,1);
  assert.equal(await remote.pendingCount(),0);
});

test('Server policy requires generation-bound consent for all file writes, even before any revoke',()=>{
  const sql=readFileSync('supabase/migrations/20261008181500_connected360_file_grant_enforcement_v3.sql','utf8');
  assert.match(sql,/v_source='normalized_file' or v_blocked/u);
  assert.match(sql,/M26_CONNECTED360_FILE_CONSENT_REQUIRED/u);
  assert.match(sql,/m26_wearable_authorization_v2/u);
  assert.match(sql,/m26_wearable_revocation_events_v2/u);
  assert.match(sql,/pg_catalog\.current_setting\('iberfit\.connected360\.grant_id',true\)/u);
  assert.doesNotMatch(sql,/\bdrop\s+(?:table|trigger|function|policy)\b/iu);
});

test('Logout during a large authorized import stops following batches and suppresses stale UI refresh',async()=>{
  const store=createMemoryKeyValueStore();
  let online=true,importCalls=0,refreshes=0,releaseFirst,signalFirst;
  const firstStarted=new Promise(resolve=>{signalFirst=resolve;});
  const firstGate=new Promise(resolve=>{releaseFirst=resolve;});
  const rows=Array.from({length:201},(_,i)=>{
    const day=new Date('2025-01-01T00:00:00Z');
    day.setUTCDate(day.getUTCDate()+i);
    return {...RECORD,date:day.toISOString().slice(0,10),
      sourceUpdatedAt:day.toISOString(),metrics:{...RECORD.metrics,steps:1000+i}};
  });
  const remote=createWearableRemoteSync({ownerId:'c360-logout-midflight',queueStore:store,
    transport:{
      async importWearableAuthorized(_token,grant,payload){
        assert.equal(grant,UUIDS[0]);
        importCalls++;
        if(importCalls===1){signalFirst();await firstGate;}
        return {accepted:payload.records.length,rejected:0,stale:0};
      },
    },getToken:async()=>'token-before-logout',isOnline:()=>online,
    refreshState:async()=>{refreshes++;}});
  const staged=remote.stage({clientId:RECORD.clientId,provider:'normalized_file',
    authorizationGrant:UUIDS[0],records:rows});
  await firstStarted;
  const logout=remote.clearOwner();
  releaseFirst();
  await staged;
  await logout;
  assert.equal(importCalls,1,'the remaining batch must never be uploaded after logout');
  assert.equal(refreshes,0,'an old account must not refresh the new UI after logout');
  assert.equal(await remote.pendingCount(),0);
});

test('Revoke during authorized multi-batch upload cancels subsequent batches before revocation commits',async()=>{
  const store=createMemoryKeyValueStore();
  let calls=0,revocations=0,releaseFirst,signalFirst;
  const firstStarted=new Promise(resolve=>{signalFirst=resolve;});
  const firstGate=new Promise(resolve=>{releaseFirst=resolve;});
  const rows=Array.from({length:201},(_,i)=>{
    const day=new Date('2025-01-01T00:00:00Z');
    day.setUTCDate(day.getUTCDate()+i);
    return {...RECORD,date:day.toISOString().slice(0,10),
      sourceUpdatedAt:day.toISOString(),metrics:{...RECORD.metrics,steps:1000+i}};
  });
  const remote=createWearableRemoteSync({ownerId:'c360-revoke-midflight',queueStore:store,
    transport:{
      async importWearableAuthorized(_token,grant,payload){
        assert.equal(grant,UUIDS[0]);
        calls++;
        if(calls===1){signalFirst();await firstGate;}
        return {accepted:payload.records.length,rejected:0,stale:0};
      },
      async revokeWearableConnection(){revocations++;return {ok:true};},
    },getToken:async()=>'token',isOnline:()=>true});
  const staged=remote.stage({clientId:RECORD.clientId,provider:'normalized_file',
    authorizationGrant:UUIDS[0],records:rows});
  await firstStarted;
  const revoked=remote.revoke({provider:'normalized_file',deleteData:true});
  releaseFirst();
  await staged;
  await revoked;
  assert.equal(calls,1,'no later batch may race after a revoke was requested');
  assert.equal(revocations,1);
  assert.equal(await remote.pendingCount(),0);
});

test('Every manual-file provider refuses unconsented stage and discards its ungranted legacy queue',async()=>{
  const providers=['normalized_file','health_connect','samsung_health','apple_health',
    'strava','garmin_connect','fitbit','oura'];
  for(const provider of providers){
    let uploaded=0;
    const record={...RECORD,provider};
    const store=createMemoryKeyValueStore();
    const remote=createWearableRemoteSync({ownerId:'c360-source-'+provider,queueStore:store,
      transport:{
        async wearableAuthorizationStatus(){return {authorized:false,grantId:null,revocationCursor:0};},
        async importWearableSummaries(){uploaded++;return {accepted:1};},
      },getToken:async()=>'qa-token',isOnline:()=>true});
    await assert.rejects(remote.stage({clientId:RECORD.clientId,provider,records:[record]}),
      /M26_CONNECTED360_ONLINE_REAUTHORIZE_REQUIRED/u,provider);
    assert.equal(await remote.pendingCount(),0,provider);
    await store.set('m26:wearable-sync:v44:owner/c360-source-'+provider+'/'+RECORD.clientId+':'+provider+':'+RECORD.date,
      {ownerId:'c360-source-'+provider,clientId:RECORD.clientId,provider,
        record,authorizationGrant:null,attempts:0});
    const result=await remote.flush();
    assert.equal(result.discarded,1,provider);
    assert.equal(uploaded,0,provider);
    assert.equal(await remote.pendingCount(),0,provider);
  }
});

test('Strava CSV data can import after a separate explicit Strava generation, never legacy RC44',async()=>{
  let imports=0;
  const record={...RECORD,provider:'strava'};
  const remote=createWearableRemoteSync({ownerId:'c360-strava-file',queueStore:createMemoryKeyValueStore(),
    transport:{
      async wearableAuthorizationStatus(){return {authorized:false,revocationCursor:0,grantId:null};},
      async reauthorizeWearable(){return {grantId:UUIDS[0],provider:'strava',scopes:['steps','activeMinutes']};},
      async importWearableAuthorized(_token,grant,payload){
        assert.equal(grant,UUIDS[0]);
        assert.equal(payload.records[0].provider,'strava');
        imports++;return {accepted:payload.records.length,rejected:0,stale:0};
      },
      async importWearableSummaries(){throw Error('legacy import forbidden');},
    },getToken:async()=>'qa-token',isOnline:()=>true});
  await remote.reauthorize({provider:'strava',scopes:['steps','activeMinutes']});
  await remote.stage({clientId:RECORD.clientId,provider:'strava',records:[record]});
  assert.equal(imports,1);
  assert.equal(await remote.pendingCount(),0);
});

test('v4 SQL extends revocation fencing and scoped grants to every supported import provider',()=>{
  const sql=readFileSync('supabase/migrations/20261008185500_connected360_all_provider_consent_v4.sql','utf8');
  assert.match(sql,/if v_source is not null then/u);
  assert.match(sql,/v_provider not in \('normalized_file','health_connect'/u);
  assert.match(sql,/a\.provider=v_provider and a\.grant_id=p_grant_id/u);
  assert.match(sql,/e\.provider in\(v_provider,'\*'\)/u);
  assert.match(sql,/v_row->>'provider'<>v_provider/u);
  assert.doesNotMatch(sql,/\bdrop\s+(?:table|trigger|function|policy)\b/iu);
});

test('v5 expands only the authorization provider domain; keeps RC44 consent policy untouched',()=>{
  const sql=readFileSync('supabase/migrations/20261008190500_connected360_authorization_provider_domain_v5.sql','utf8');
  assert.match(sql,/m26_wearable_authorization_v2_provider_check/u);
  assert.match(sql,/provider in \(/u);
  for(const name of ['normalized_file','health_connect','samsung_health','apple_health','strava',
    'garmin_connect','fitbit','oura'])assert.match(sql,new RegExp("'"+name+"'"));
  assert.doesNotMatch(sql,/m26_wearable_consents_v44_policy_version_check/u);
  assert.doesNotMatch(sql,/\bdrop\s+(?:table|function|trigger|policy)\b/iu);
});
