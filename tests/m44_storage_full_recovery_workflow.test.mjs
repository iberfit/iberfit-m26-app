import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
const sql=readFileSync('scripts/ops/m44_storage_metadata_snapshot.sql','utf8');
test('new Storage verifier is protected by pull-request tests and encrypted-only production run',()=>{
 for(const name of ['m44_storage_metadata_parity.test.mjs',
  'm44_storage_metadata_parity.mjs','m44_storage_metadata_snapshot.sql'])
  assert.ok(workflow.includes(name),name);
 assert.match(workflow,/if: github\.event_name != 'pull_request'/);
 assert.match(workflow,/environment: m26-canary-readonly/);
});
test('two live PROD inventories enclose Storage byte download; fail before encrypting',()=>{
 const production=workflow.slice(workflow.indexOf('name: m44-prod-db-storage-encrypted-backup-and-restore'));
 const source=production.indexOf('> \/work/storage-inventory.json');
 const exportBytes=production.indexOf('m44_storage_backup_bytes.mjs export');
 const post=production.indexOf('> \/work/storage-post-inventory.json');
 const guard=production.indexOf('m44_storage_metadata_parity.mjs source');
 const encrypt=production.indexOf('m44_encrypted_backup_archive.mjs encrypt');
 assert.ok(source>0&&source<exportBytes&&exportBytes<post&&post<guard&&guard<encrypt);
 assert.match(workflow,/storage-inventory\.json[\s\S]*storage-post-inventory\.json platform-catalog-source\.json/);
});
test('isolated DB metadata match is required before success marker and after pg_restore',()=>{
 const restore=workflow.indexOf('pg_restore --exit-on-error');
 const query=workflow.indexOf('> \/work/isolated-db-storage-inventory.json');
 const parity=workflow.indexOf('m44_storage_metadata_parity.mjs isolated');
 const marker=workflow.indexOf('IBERFIT_PROD_LOCAL_DB_AND_STORAGE_RESTORE_SUCCESS');
 assert.ok(restore>0&&restore<query&&query<parity&&parity<marker);
 assert.match(workflow.slice(query-480,query),/127\.0\.0\.1/);
 assert.match(workflow,/IBERFIT_SOURCE_CATALOG_ENCRYPTED_PLATFORM_RECOVERY_NOT_YET_VERIFIED/);
});
test('catalog snapshot is read-only, includes same-name overwrite markers',()=>{
 for(const column of ['bucket_id','name','id::text','version','updated_at','metadata->>'])assert.ok(sql.includes(column));
 assert.match(sql,/FROM storage\.objects;/);
 assert.doesNotMatch(sql,/\b(?:delete|update|insert|truncate|alter|drop)\s+/i);
});

test('REAL TRAINING 360 backend candidate requests exactly one encrypted PROD M44 proof only after Canary merge',()=>{
 const yaml=readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
 const section=yaml.slice(yaml.indexOf('\non:'),yaml.indexOf('\npermissions:'));
 const pull=section.slice(section.indexOf('  pull_request:'),section.indexOf('  push:'));
 const push=section.slice(section.indexOf('  push:'),section.indexOf('  workflow_dispatch:'));
 const exact=[
  'supabase/migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql',
  'supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.sql',
 ];
 for(const path of exact){
   assert.ok(push.includes("      - '"+path+"'"),'POSTMERGE_M44_TRIGGER_MISSING:'+path);
   assert.ok(!pull.includes(path),'M44_PROD_TRIGGER_MUST_NOT_RUN_FOR_DRAFT:'+path);
   assert.equal(yaml.split("'"+path+"'").length-1,1,'M44_TRIGGER_MUST_BE_EXACT_ONCE:'+path);
 }
 assert.match(yaml,/if: github\.event_name != 'pull_request'/u);
 assert.match(yaml,/name: iberfit-prod-ciphertext-\$\{\{ github\.run_id \}\}/u);
 assert.match(yaml,/Reopen ciphertext and verify restored Storage bytes in isolated workspace/u);
 assert.doesNotMatch(push,/^\s+- 'supabase\/migrations\/\*\*'/mu);
});
