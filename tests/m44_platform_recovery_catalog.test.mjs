import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readFile} from 'node:fs/promises';
import {CATEGORIES,SCHEMA,validatePlatformCatalog,
 comparePlatformCatalog,certifyPlatformCatalog} from '../scripts/ops/m44_platform_recovery_compare.mjs';

const fakeHash=n=>n.toString(16).padStart(64,'0');
function catalog(){return Object.fromEntries([
 ['schema',SCHEMA],...CATEGORIES.map((x,i)=>[x,fakeHash(i+1)])
]);}
test('SQL contract returns only SHA256 summaries, no user rows or function bodies',async()=>{
 const sql=await readFile('scripts/ops/m44_platform_recovery_catalog.sql','utf8');
 assert.match(sql,/sha256\(/i);
 for(const category of CATEGORIES)assert.match(sql,new RegExp("'"+category+"'"));
 for(const name of ['pg_roles','pg_auth_members','pg_class','pg_default_acl',
  'pg_proc','pg_policies','pg_trigger','pg_extension','storage.buckets',
  'supabase_migrations.schema_migrations'])assert.ok(sql.includes(name),name);
 assert.doesNotMatch(sql,/\b(DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE|ALTER\s+ROLE|INSERT\s+INTO|UPDATE\s+public\.)\b/i);
 assert.doesNotMatch(sql,/rolpassword|auth\.users\s+u\b|storage\.objects\s+o\b/i);
});
test('exact catalog parity is only a necessary property, not platform recovery certificate',()=>{
 const src=catalog(),dst={...src};
 const x=certifyPlatformCatalog(src,dst);
 assert.equal(x.catalogParity,true);
 assert.equal(x.platformRecoveryVerified,false);
 assert.equal(x.requiresIndependentRestore,true);
});
test('role grants, policies, function owners and migration drift deny parity individually',()=>{
 for(const cat of CATEGORIES){
  const a=catalog(),b={...a,[cat]:fakeHash(999)};
  const result=comparePlatformCatalog(a,b);
  assert.equal(result.catalogParity,false,cat);
  assert.deepEqual(result.mismatchCategories,[cat]);
  assert.throws(()=>certifyPlatformCatalog(a,b),new RegExp('M44_PLATFORM_CATALOG_MISMATCH:'+cat));
 }
});
test('reject malformed digests, unsigned manifests and invented categories',()=>{
 for(const x of [
  null,[],{}, {...catalog(),schema:'evil'},
  {...catalog(),roles:'x'.repeat(64)}, {...catalog(),roles:'a'.repeat(63)},
  {...catalog(),extra:'a'.repeat(64)}
 ])assert.throws(()=>validatePlatformCatalog(x),/M44_PLATFORM_CATALOG_/);
});
test('classification errors do not disclose hashes or record payloads',()=>{
 const a=catalog(),b={...a,policies:fakeHash(819)};
 try{certifyPlatformCatalog(a,b);assert.fail('must reject')}
 catch(e){assert.match(e.message,/M44_PLATFORM_CATALOG_MISMATCH:policies/);
  assert.doesNotMatch(e.message,/0000000000000000|storage\.objects|@/);}
});
