import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderClientDeviceHub} from '../src/m26/wearables/device-hub.js';
import {buildWearableViewModel} from '../src/m26/wearables/view-model.js';

const sql=readFileSync('supabase/migrations/20261010003500_connected360_manual_import_truth_v7.sql','utf8');
const legacy=readFileSync('supabase/migrations/20261008192000_connected360_split_authorization_fence_v6.sql','utf8');

test('v7 SQL checks real current RPC definitions, does not mutate existing records',()=>{
  assert.match(sql,/IMPORT_TRUTH_V7_SOURCE_DRIFT/);
  assert.match(sql,/CONNECTION_V7_SOURCE_DRIFT/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.m26_wearable_import_authorized_v2/u);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.m26_wearable_connection_upsert_v44/u);
  assert.doesNotMatch(sql,/\b(?:drop table|truncate|delete from|update public\.m26_wearable_connections_v44)\b/iu);
  assert.doesNotMatch(sql,/\b(?:grant|revoke)\s+(?:all|execute|select|insert|update|delete)\b/iu);
});

test('consented manual import does not claim device linked, automatic sync or known source timestamp',()=>{
  const part=sql.split('CREATE OR REPLACE FUNCTION public.m26_wearable_import_authorized_v2')[1];
  assert.ok(part,'current authorized importer must remain present');
  assert.match(part,/'syncEnabled',false/u);
  assert.match(part,/'lastSyncedAt',null/u);
  assert.match(part,/'mode','confirmed_import','automatic',false/u);
  assert.match(part,/'lastImportedAt',pg_catalog\.now\(\)/u);
  assert.doesNotMatch(part,/'syncEnabled',true/u);
  assert.match(part,/M26_CONNECTED360_GRANT_REVOKED/u);
  assert.match(part,/pg_catalog\.pg_advisory_xact_lock/u);
  assert.match(part,/M26_CONNECTED360_IMPORT_SCOPE_FORBIDDEN/u);
  assert.match(part,/m26_wearable_import_v44/u);
});

test('manual import preserves explicit grant audit but generic sync-off retains pause audit',()=>{
  const p=sql.split('CREATE OR REPLACE FUNCTION public.m26_wearable_connection_upsert_v44')[1]
    .split('CREATE OR REPLACE FUNCTION public.m26_wearable_import_authorized_v2')[0];
  assert.match(p,/when v_status = 'paused' then 'pause'/u);
  assert.match(p,/when v_status = 'revoked' then 'revoke'/u);
  assert.match(p,/when v_sync_enabled or \(v_status = 'active' and v_metadata ->> 'mode' = 'confirmed_import'\) then 'grant'/u);
  assert.match(p,/insert into public\.m26_wearable_consents_v44/u);
  assert.match(legacy,/m26_wearable_import_authorized_v2/u);
});

test('Client device hub never advertises imported files as certified automatic connections',()=>{
  const model=buildWearableViewModel({
    records:[],connections:[{
      provider:'normalized_file',status:'active',
      sync_enabled:false,last_synced_at:null,
      metadata:{mode:'confirmed_import',automatic:false},
      scopes:['steps'],
    }],
    role:'client',now:new Date('2026-10-09T12:00:00Z'),
    scope:{},
  });
  const html=renderClientDeviceHub(model);
  assert.match(html,/Datos incorporados · sin enlace automático/u);
  assert.doesNotMatch(html,/1 fuente vinculada/u);
});
