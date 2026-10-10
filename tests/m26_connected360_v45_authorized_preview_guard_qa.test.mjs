import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeMigration,findCreatedTables} from '../scripts/ci/check_migration_security_policy.mjs';

const source=readFileSync(new URL('../supabase/qa-migrations/20261010174000_connected360_v45_authorized_preview_guard_qa.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261010174000_connected360_v45_authorized_preview_guard_qa.rollback.sql',import.meta.url),'utf8');
test('QA-only migration is a single read-only RPC with no table or trigger changes',()=>{
  assert.deepEqual(findCreatedTables(source),[]);
  assert.deepEqual(analyzeMigration(source),[]);
  assert.equal((source.match(/create or replace function/gu)||[]).length,1);
  assert.equal((source.match(/\bcommit;/gu)||[]).length,1);
  assert.match(source,/security invoker set search_path=''/u);
  assert.doesNotMatch(source,/\b(?:insert\s+into|update\s+public\.|delete\s+from|create\s+policy|create\s+trigger|alter\s+table|truncate|drop\s+table|security\s+definer)\b/iu);
  assert.match(source,/The existing v45 insert\/update BLOCKING TRIGGER remains enabled/u);
});
test('authenticated-only, RLS-scoped grant and cursor are required without service keys',()=>{
  assert.match(source,/v_owner uuid := \(select auth\.uid\(\)\)/u);
  assert.match(source,/v_client uuid := public\.iberfit_client_id\(\)/u);
  assert.match(source,/public\.iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.match(source,/public\.m26_wearable_authorization_sources_v3/u);
  assert.match(source,/a\.owner_user_id=v_owner and a\.client_id=v_client/u);
  assert.match(source,/a\.provider='health_connect' and a\.grant_id=p_grant_id/u);
  assert.match(source,/public\.m26_wearable_revocation_events_v2/u);
  assert.match(source,/e\.provider in \('health_connect','\*'\)/u);
  assert.match(source,/v_latest_revocation>v_grant_cursor/u);
  assert.match(source,/revoke all on function[\s\S]*?from public,anon,authenticated,service_role;/u);
  assert.match(source,/grant execute on function[\s\S]*?to authenticated;/u);
  assert.doesNotMatch(source,/grant execute[\s\S]*?to (?:anon|public|service_role);/iu);
});
test('native preview cannot impersonate a certified sensor or inject cross-account readings',()=>{
  assert.match(source,/v_row->>'clientId' is distinct from v_client::text/u);
  assert.match(source,/v_row->>'provider' is distinct from 'health_connect'/u);
  assert.match(source,/v_row->>'quality' is distinct from 'limitada'/u);
  for(const field of ['measuredAt','sourceUpdatedAt','sourceIdentity','timeZone']){
    assert.match(source,new RegExp("v_provenance->'"+field+"' is distinct from 'null'::jsonb",'u'));
  }
  assert.match(source,/v_provenance->'sourceTimestampVerified' is distinct from 'false'::jsonb/u);
  assert.match(source,/v_provenance->'automaticSyncCertified' is distinct from 'false'::jsonb/u);
  assert.match(source,/v_row->>'date' = any\(v_dates\)/u);
  assert.match(source,/v_acquired < pg_catalog\.now\(\)-interval '20 minutes'/u);
  assert.match(source,/v_acquired > pg_catalog\.now\(\)\+interval '5 minutes'/u);
  assert.match(source,/v_key=any\(v_granted_scopes\)/u);
  assert.doesNotMatch(source,/jsonb_object_length/u);
});
test('responses explicitly prove only validation, never linked/persisted/automatic',()=>{
  assert.match(source,/'validated',v_count,'persisted',false/u);
  assert.match(source,/'automatic',false,'sourceTimeVerified',false/u);
  assert.match(source,/'sourceIdentityVerified',false/u);
  assert.doesNotMatch(source,/'automatic',true|'persisted',true/u);
  assert.match(rollback,/drop function if exists public\.m26_wearable_v45_validate_native_preview_qa_v1\(uuid,jsonb\)/u);
  assert.doesNotMatch(rollback,/\b(?:delete|truncate|drop table|alter table|cascade)\b/iu);
});
