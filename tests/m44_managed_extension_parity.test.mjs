import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {M44_SOURCE_EXTENSIONS,planM44ManagedExtensionParity,certifyM44ManagedExtensionParity} from '../scripts/ops/m44_managed_extension_parity.mjs';
const ready=()=>M44_SOURCE_EXTENSIONS.map(e=>({name:e.name,schema_name:e.schema,gin_trgm_ready:true}));
test('M44 source extension parity is exact and read-only when already complete',()=>{
 const p=planM44ManagedExtensionParity(ready());
 assert.equal(p.ready,true);assert.deepEqual(p.installSql,[]);
 assert.equal(certifyM44ManagedExtensionParity(ready()).ginTrgmReady,true);
});
test('M44 installs only allowlisted dependencies and never changes managed core',()=>{
 const rows=ready().filter(x=>!['pg_trgm','uuid-ossp','pgcrypto'].includes(x.name));
 const p=planM44ManagedExtensionParity(rows);
 assert.deepEqual(p.missing,['uuid-ossp','pgcrypto','pg_trgm']);
 assert.equal(p.installSql.length,3);
 for(const sql of p.installSql){assert.match(sql,/^CREATE EXTENSION IF NOT EXISTS /);assert.match(sql,/ WITH SCHEMA extensions$/);}
 assert.doesNotMatch(JSON.stringify(p),/DROP|ALTER|GRANT|public|secret/i);
});
test('M44 rejects wrong schemas, duplicate or unknown extension records, invalid formats',()=>{
 assert.throws(()=>planM44ManagedExtensionParity(null),/INVENTORY_INVALID/);
 assert.throws(()=>planM44ManagedExtensionParity([...ready(),ready()[0]]),/INVENTORY_INVALID/);
 assert.throws(()=>planM44ManagedExtensionParity([...ready(),{name:'attacker',schema_name:'public'}]),/INVENTORY_INVALID/);
 assert.throws(()=>planM44ManagedExtensionParity(ready().map(x=>x.name==='pg_trgm'?{...x,schema_name:'public'}:x)),/SCHEMA_DRIFT/);
});
test('M44 blocks missing core extension and missing gin_trgm_ops despite valid inventory',()=>{
 assert.throws(()=>planM44ManagedExtensionParity(ready().filter(x=>x.name!=='supabase_vault')),/CORE_EXTENSION_MISSING/);
 assert.throws(()=>certifyM44ManagedExtensionParity(ready().map(x=>({...x,gin_trgm_ready:false}))),/NOT_VERIFIED/);
 assert.throws(()=>certifyM44ManagedExtensionParity(ready().filter(x=>x.name!=='pg_trgm')),/NOT_VERIFIED/);
});
test('M44 manager checks seal before extension DDL and calls parity before restoreData',()=>{
 const source=readFileSync('scripts/ops/m44_managed_real_recovery.mjs','utf8');
 assert.match(source,/if\(!sealed\|\|clonedData\|\|!activeClone\|\|!qaPaused\)/);
 assert.ok(source.indexOf('await prepareM44ManagedExtensions();')<source.indexOf('await restoreData(conn);'));
 assert.ok(source.indexOf('await downloadArchive();')<source.indexOf('await prepareM44ManagedExtensions();'));
 assert.doesNotMatch(source,/sup\(PROD\s*,\s*[^,]*,\s*\{\s*method:\s*['"](?:POST|PATCH|DELETE)/);
});
