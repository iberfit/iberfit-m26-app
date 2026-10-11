import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createM26Transport,M26_QA_PROJECT_REF,M26_PRODUCTION_PROJECT_REF} from '../src/m26/supabase-transport.js';
import {analyzeMigration,findCreatedTables} from '../scripts/ci/check_migration_security_policy.mjs';

const migration=readFileSync(new URL('../supabase/qa-migrations/20261011162000_connected360_v45_explicit_native_writer_qa.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261011162000_connected360_v45_explicit_native_writer_qa.rollback.sql',import.meta.url),'utf8');
const GRANT='33333333-3333-4333-8333-333333333333';
const CLIENT='11111111-1111-4111-8111-111111111111';
const TOKEN='synthetic-test-token-not-a-secret';
const payload={records:[{
  clientId:CLIENT,provider:'health_connect',date:'2026-10-11',
  quality:'limitada',sourceRecordCount:1,metrics:{steps:7500},
  provenance:{schema:'iberfit.connected360.qa.provenance.v45.preview',
    acquiredAt:'2026-10-11T14:00:00.000Z',measuredAt:null,
    sourceUpdatedAt:null,sourceIdentity:null,timeZone:null,
    aggregationTimeZone:'America/Santiago',aggregation:'daily',
    sourceTimestampVerified:false,automaticSyncCertified:false},
}]};
const runtime=(qa)=>({
  enabled:true,qaOnly:qa,canary:qa,
  host:qa?'m26-canary.iberfit.cl':'app.iberfit.cl',
  projectRef:qa?M26_QA_PROJECT_REF:M26_PRODUCTION_PROJECT_REF,
  url:'https://'+(qa?M26_QA_PROJECT_REF:M26_PRODUCTION_PROJECT_REF)+'.supabase.co',
  publishableKey:'sb_publishable_not_a_real_test_credential',
});

test('V45 QA writer is additive, bounded and never publishes direct table access',()=>{
  assert.deepEqual(findCreatedTables(migration),[]);
  assert.deepEqual(analyzeMigration(migration),[]);
  assert.match(migration,/security definer set search_path=''/iu);
  assert.match(migration,/m26_wearable_v45_import_explicit_qa_v1\(/u);
  assert.match(migration,/grant execute on function public\.m26_wearable_v45_import_explicit_qa_v1\(uuid,jsonb\)\s+to authenticated;/iu);
  assert.match(migration,/revoke all on function public\.m26_wearable_v45_import_explicit_qa_v1\(uuid,jsonb\)\s+from public,anon,authenticated,service_role;/iu);
  assert.doesNotMatch(migration,/grant\s+(?:select|insert|update|delete)\s+on\s+(?:table\s+)?public\.m26_wearable_source_daily_v45/iu);
  assert.doesNotMatch(migration,/alter\s+table\s+public\.m26_wearable_source_daily_v45\s+disable|drop\s+trigger|drop\s+table|truncate\s+table|create\s+policy/iu);
});

test('server validates current JWT Client, revocation generation and bounded preview inside the same fence',()=>{
  const writer=migration.slice(migration.indexOf('create or replace function public.m26_wearable_v45_import_explicit_qa_v1('));
  const lock=writer.indexOf('pg_advisory_xact_lock(');
  const preflight=writer.indexOf('m26_wearable_v45_validate_native_preview_qa_v1(');
  const selectGrant=writer.indexOf('from public.m26_wearable_authorization_sources_v3');
  const mut=writer.indexOf('update public.m26_wearable_source_daily_v45');
  assert.ok(lock>=0&&preflight>lock&&selectGrant>lock&&mut>selectGrant);
  assert.match(writer,/v_owner uuid := \(select auth\.uid\(\)\)/u);
  assert.match(writer,/v_client uuid := public\.iberfit_client_id\(\)/u);
  assert.match(writer,/public\.iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.match(writer,/a\.owner_user_id=v_owner and a\.client_id=v_client/u);
  assert.match(writer,/a\.provider='health_connect' and a\.grant_id=p_grant_id/u);
  assert.match(writer,/for update;/u);
  assert.match(writer,/e\.provider in \('health_connect','\*'\)/u);
  assert.match(writer,/v_cursor>v_grant_cursor/u);
  assert.match(writer,/pg_catalog\.set_config\('iberfit\.connected360\.v45_writer_qa'/u);
  assert.match(writer,/pg_catalog\.set_config\('iberfit\.connected360\.v45_grant_qa'/u);
  assert.doesNotMatch(writer,/pg_catalog\.coalesce\(/u);
});

test('no automatic certification or fabricated sensor timestamps; duplicates and stale acquisitions are safe',()=>{
  assert.match(migration,/new\.source_key is not null/u);
  assert.match(migration,/new\.source_time_zone is not null/u);
  assert.match(migration,/new\.measured_at is not null/u);
  assert.match(migration,/new\.source_updated_at is not null/u);
  assert.match(migration,/new\.automatic_sync_certified is distinct from false/u);
  assert.match(migration,/aggregation_time_zone is not distinct from v_zone/u);
  assert.match(migration,/v_acquired < v_old\.acquired_at/u);
  assert.match(migration,/v_acquired = v_old\.acquired_at/u);
  assert.match(migration,/M26_CONNECTED360_V45_TIMESTAMP_CONFLICT/u);
  assert.match(migration,/v_old\.steps is distinct from v_steps/u);
  assert.match(migration,/active_minutes=null,hrv_ms=null,active_energy_kcal=null/u);
  assert.match(migration,/'persisted',true,'automatic',false/u);
  assert.match(migration,/'sourceTimeVerified',false,'sourceIdentityVerified',false/u);
});

test('rollback shuts the sole QA writer and restores unconditional write rejection without deleting health data',()=>{
  assert.match(rollback,/drop function if exists public\.m26_wearable_v45_import_explicit_qa_v1\(uuid,jsonb\)/u);
  assert.match(rollback,/M26_CONNECTED360_V45_INGEST_UNCERTIFIED/u);
  assert.match(rollback,/revoke all on function public\.m26_wearable_v45_import_explicit_qa_v1/u);
  assert.doesNotMatch(rollback,/\b(?:delete from|truncate|drop table|cascade)\b/iu);
});

test('production cannot call V45 import and QA requires an authenticated bounded payload',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    return new Response(JSON.stringify({ok:true,persisted:true,automatic:false,
      provider:'health_connect',inserted:1,updated:0,unchanged:0,count:1,
      sourceTimeVerified:false,sourceIdentityVerified:false}),{
      status:200,headers:{'content-type':'application/json'},
    });
  };
  const prod=createM26Transport(runtime(false),{fetchImpl});
  await assert.rejects(prod.importConnected360QaV45(TOKEN,GRANT,payload),
    /M26_HEALTH_V45_PRODUCTION_DENIED/u);
  assert.equal(calls.length,0);
  const qa=createM26Transport(runtime(true),{fetchImpl});
  await assert.rejects(qa.importConnected360QaV45(TOKEN,'not-a-grant',payload),
    /M26_HEALTH_V45_IMPORT_INVALID/u);
  assert.equal(calls.length,0);
  const accepted=await qa.importConnected360QaV45(TOKEN,GRANT,payload);
  assert.equal(accepted.persisted,true);
  assert.equal(accepted.automatic,false);
  assert.equal(calls.length,1);
  const call=calls[0];
  assert.equal(new URL(call.url).pathname,
    '/rest/v1/rpc/m26_wearable_v45_import_explicit_qa_v1');
  assert.equal(call.init.method,'POST');
  assert.equal(call.init.headers.authorization,'Bearer '+TOKEN);
  assert.deepEqual(JSON.parse(call.init.body),{
    p_grant_id:GRANT,p_payload:payload,
  });
  assert.doesNotMatch(call.init.body,/sourcePackageName|physicalWatchId|service_role/iu);
});

test('partial or falsely certified database acknowledgments are rejected by transport',async()=>{
  const bad=[
    {ok:true,persisted:true,automatic:true,provider:'health_connect',
      inserted:1,updated:0,unchanged:0,count:1,sourceTimeVerified:false,sourceIdentityVerified:false},
    {ok:true,persisted:true,automatic:false,provider:'health_connect',
      inserted:0,updated:0,unchanged:0,count:0,sourceTimeVerified:false,sourceIdentityVerified:false},
  ];
  let index=0;
  const transport=createM26Transport(runtime(true),{
    fetchImpl:async()=>new Response(JSON.stringify(bad[index++]),{
      status:200,headers:{'content-type':'application/json'},
    }),
  });
  for(let i=0;i<bad.length;i++)
    await assert.rejects(transport.importConnected360QaV45(TOKEN,GRANT,payload),
      /M26_HEALTH_V45_IMPORT_RESPONSE_INVALID/u);
});
