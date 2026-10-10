import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20261010231000_connected360_certified_oauth_fence_v2.sql',import.meta.url),'utf8');
const frontend=readFileSync(new URL('../src/m26/wearables/device-hub.js',import.meta.url),'utf8');
const v1=readFileSync(new URL('../supabase/migrations/20261010223000_connected360_block_unverified_native_certification_v1.sql',import.meta.url),'utf8');

test('backend protects all labels the device hub might advertise as automatic',()=>{
  assert.match(frontend,/\['certified_native','certified_oauth'\]/u);
  assert.match(migration,/create or replace function public\.m26_wearable_connection_certification_guard_v1\(\)/u);
  assert.match(migration,/\^\(certified_\|verified_\)/u);
  assert.match(migration,/M26_NATIVE_CERTIFICATION_NOT_VERIFIED/u);
  assert.match(migration,/new\.metadata->'automatic' is distinct from 'false'::jsonb/u);
  assert.match(migration,/new\.metadata->'sourceTimeVerified' is distinct from 'false'::jsonb/u);
  assert.match(migration,/new\.metadata->'sourceIdentityVerified' is distinct from 'false'::jsonb/u);
  assert.match(migration,/security invoker set search_path=''/u);
});
test('existing trigger and V44 authorization remain unchanged',()=>{
  assert.match(v1,/create trigger m26_wearable_connections_certification_guard_v1/u);
  assert.doesNotMatch(migration,/\b(create|drop|alter)\s+(trigger|table|policy|role)\b/iu);
  assert.doesNotMatch(migration,/\bsecurity definer\b|\bdo\s+\$|\bupdate public\.m26_wearable_|delete from|truncate\b/iu);
  assert.match(migration,/begin;[\s\S]*commit;\s*$/u);
});
