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
