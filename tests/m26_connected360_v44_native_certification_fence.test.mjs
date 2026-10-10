import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeMigration,findCreatedTables} from '../scripts/ci/check_migration_security_policy.mjs';

const sql=readFileSync(new URL('../supabase/migrations/20261010223000_connected360_block_unverified_native_certification_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/rollbacks/20261010223000_connected360_block_unverified_native_certification_v1.rollback.sql',import.meta.url),'utf8');

test('Native certification must be fenced server-side, not by browser metadata',()=>{
  assert.deepEqual(findCreatedTables(sql),[]);
  assert.deepEqual(analyzeMigration(sql),[]);
  assert.match(sql,/create trigger m26_wearable_connections_certification_guard_v1[\s\S]*?before insert or update on public\.m26_wearable_connections_v44/iu);
  assert.match(sql,/language plpgsql security invoker set search_path=''/iu);
  assert.match(sql,/new\.metadata->>'mode'/u);
  assert.match(sql,/='certified_native'/u);
  for (const claim of ['automatic','sourceTimeVerified','sourceIdentityVerified']){
    assert.ok(sql.includes("new.metadata ? '"+claim+"'"));
    assert.ok(sql.includes("new.metadata->'"+claim+"' is distinct from 'false'::jsonb"));
  }
  assert.match(sql,/M26_NATIVE_CERTIFICATION_NOT_VERIFIED/u);
  assert.match(sql,/errcode='42501'/u);
  assert.doesNotMatch(sql,/\bsecurity definer\b|\bdisable trigger\b|\bdrop table\b|\bdelete from\b|\btruncate\b/iu);
});
test('Production migration does not alter prior wearables, grants or revoke behavior',()=>{
  assert.doesNotMatch(sql,/\bupdate public\.m26_wearable_|\binsert into public\.m26_wearable_/iu);
  assert.doesNotMatch(sql,/\bdo\s+\$[A-Za-z_]/iu);
  assert.match(sql,/Preflight is performed as a separately audited read-only QA\/PROD query/u);
  assert.match(sql,/CREATE TRIGGER fails atomically/u);
  assert.match(sql,/Existing v44 confirmed_import metadata \{mode,automatic:false\} remains valid/u);
  assert.match(rollback,/Emergency rollback ONLY after an independently certified replacement fence/u);
  assert.doesNotMatch(rollback,/\bcascade\b/iu);
});
