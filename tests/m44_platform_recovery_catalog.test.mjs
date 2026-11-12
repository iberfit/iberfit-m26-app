import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readFile} from 'node:fs/promises';
import {ACCESS_SCHEMA,ACCESS_CATEGORIES,validateAccessCatalog,compareAccessCatalog} from '../scripts/ops/m44_platform_recovery_compare.mjs';
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
 assert.equal(x.schemaAclVerified,false);
 assert.equal(x.columnAclVerified,false);
 assert.equal(x.effectivePrivilegesVerified,false);
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

test('CLI validates distinct private catalog files without echoing paths or hashes',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const os=await import('node:os'),path=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(path.join(os.tmpdir(),'iberfit-m44-catalog-test-'));
 try{
  const a=path.join(dir,'source.json'),b=path.join(dir,'isolated.json');
  const content=catalog();
  writeFileSync(a,JSON.stringify(content),{mode:0o600});
  writeFileSync(b,JSON.stringify(content),{mode:0o600});
  const run=(...args)=>spawnSync(process.execPath,
   ['scripts/ops/m44_platform_recovery_compare.mjs',...args],{encoding:'utf8',timeout:10000});
  const ok=run(a,b);
  assert.equal(ok.status,0,ok.stderr);
  assert.match(ok.stdout,/IBERFIT_PLATFORM_CATALOG_PARITY_ONLY:true:hosted_auth_NOT_certified\n$/);
  assert.equal(ok.stderr,'');
  const denied=run(a,a);
  assert.notEqual(denied.status,0);
  assert.match(denied.stderr,/DISTINCT_FILES_REQUIRED/);
  assert.doesNotMatch(denied.stderr,new RegExp(dir.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')));
  const changed={...content,role_memberships:fakeHash(222)};
  writeFileSync(b,JSON.stringify(changed),{mode:0o600});
  const mismatch=run(a,b);
  assert.notEqual(mismatch.status,0);
  assert.match(mismatch.stderr,/M44_PLATFORM_CATALOG_MISMATCH:role_memberships/);
  assert.doesNotMatch(mismatch.stderr,/0000000000000000/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('catalog file evidence refuses symlinks, hardlinks and readable-by-others files',async()=>{
 const {mkdtempSync,writeFileSync,symlinkSync,linkSync,unlinkSync,chmodSync,rmSync}=await import('node:fs');
 const os=await import('node:os'),path=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(path.join(os.tmpdir(),'iberfit-m44-catalog-private-'));
 const run=(a,b)=>spawnSync(process.execPath,
  ['scripts/ops/m44_platform_recovery_compare.mjs',a,b],
  {encoding:'utf8',timeout:10000});
 try{
  const source=path.join(dir,'source.json');
  const recovered=path.join(dir,'restored.json');
  const alias=path.join(dir,'alias.json');
  const hard=path.join(dir,'hard.json');
  const body=JSON.stringify(catalog());
  writeFileSync(source,body,{mode:0o600});
  writeFileSync(recovered,body,{mode:0o600});
  assert.equal(run(source,recovered).status,0);
  symlinkSync(recovered,alias);
  const linked=run(source,alias);
  assert.notEqual(linked.status,0);
  assert.match(linked.stderr,/M44_PLATFORM_CATALOG_FILE_INVALID/);
  assert.doesNotMatch(linked.stderr,/alias\.json|source\.json|restored\.json/);
  unlinkSync(alias);
  linkSync(recovered,hard);
  const hardLinked=run(source,recovered);
  assert.notEqual(hardLinked.status,0);
  assert.match(hardLinked.stderr,/M44_PLATFORM_CATALOG_FILE_INVALID/);
  unlinkSync(hard);
  if(process.platform!=='win32'){
   chmodSync(recovered,0o644);
   const shared=run(source,recovered);
   assert.notEqual(shared.status,0);
   assert.match(shared.stderr,/M44_PLATFORM_CATALOG_PRIVATE_MODE_REQUIRED/);
   chmodSync(recovered,0o600);
  }
  assert.equal(run(source,recovered).status,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});


const accessSnapshot=()=>Object.fromEntries([
 ['schema',ACCESS_SCHEMA],...ACCESS_CATEGORIES.map((k,i)=>[k,fakeHash(i+100)])
]);
test('versioned sidecar hashes schema, column and database ACL without exposing identifiers',async()=>{
 const sql=await readFile('scripts/ops/m44_access_acl_supplement_v1.sql','utf8');
 for(const key of ACCESS_CATEGORIES)assert.match(sql,new RegExp("'"+key+"'"));
 for(const key of ['pg_namespace','nspacl','pg_attribute','attacl','pg_database','datacl','current_database()'])
  assert.ok(sql.includes(key),key);
 // Compare privilege *semantics*, not database names that intentionally
 // differ during disaster recovery. No name may enter the digest payload.
 assert.doesNotMatch(sql,/d\.datname\s+AS\s+database_name/);
 assert.match(sql,/WHERE d\.datname=current_database\(\)/);
 assert.match(sql,/sha256\(/);
 assert.doesNotMatch(sql,/\b(?:UPDATE|TRUNCATE|DELETE|DROP|CREATE|ALTER|GRANT|REVOKE)\s+(?:FROM|INTO|TABLE|DATABASE|SCHEMA|ON)\b/i);
 assert.doesNotMatch(sql,/\b(?:rolpassword|auth\.users|vault\.secrets|storage\.objects)\b/i);
});
test('every ACL sidecar drift is detected independently and never certifies platform recovery',()=>{
 const source=accessSnapshot();
 assert.equal(validateAccessCatalog(source),true);
 const pass=compareAccessCatalog(source,{...source});
 assert.equal(pass.aclSupplementParity,true);
 assert.equal(pass.effectivePrivilegesVerified,false);
 assert.equal(pass.platformRecoveryVerified,false);
 for(const key of ACCESS_CATEGORIES){
  const dest={...source,[key]:fakeHash(555)};
  const delta=compareAccessCatalog(source,dest);
  assert.deepEqual(delta.mismatchCategories,[key]);
  assert.equal(delta.aclSupplementParity,false);
  assert.equal(delta.platformRecoveryVerified,false);
 }
 for(const bad of [null,{},[],{...source,schema:SCHEMA},
  {...source,column_acl:'x'.repeat(64)},{...source,unexpected:fakeHash(11)}])
  assert.throws(()=>validateAccessCatalog(bad),/M44_PLATFORM_CATALOG_ACCESS_/);
});
test('legacy catalog CLI retains 2-path format; 4-path sidecar is strict and private',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const os=await import('node:os'),path=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(path.join(os.tmpdir(),'iberfit-m44-access-sidecar-'));
 const files=['src-v1.json','dst-v1.json','src-acl.json','dst-acl.json']
  .map(name=>path.join(dir,name));
 const run=(...args)=>spawnSync(process.execPath,['scripts/ops/m44_platform_recovery_compare.mjs',...args],
  {encoding:'utf8',timeout:10000});
 try{
  for(let i=0;i<2;i++)writeFileSync(files[i],JSON.stringify(catalog()),{mode:0o600});
  for(let i=2;i<4;i++)writeFileSync(files[i],JSON.stringify(accessSnapshot()),{mode:0o600});
  const original=run(...files.slice(0,2));
  assert.equal(original.status,0,original.stderr);
  assert.match(original.stdout,
   /IBERFIT_PLATFORM_CATALOG_PARITY_ONLY:true:hosted_auth_NOT_certified/);
  const all=run(...files);
  assert.equal(all.status,0,all.stderr);
  assert.match(all.stdout,/aclSupplementParity:true:hosted_auth_NOT_certified/);
  const missing=run(...files.slice(0,3));
  assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/INPUT_COUNT_INVALID/);
  const duplicate=run(files[0],files[1],files[2],files[2]);
  assert.notEqual(duplicate.status,0);
  assert.match(duplicate.stderr,/DISTINCT_FILES_REQUIRED/);
  const changed={...accessSnapshot(),schema_acl:fakeHash(887)};
  writeFileSync(files[3],JSON.stringify(changed),{mode:0o600});
  const drift=run(...files);
  assert.notEqual(drift.status,0);
  assert.match(drift.stderr,/M44_PLATFORM_CATALOG_ACCESS_MISMATCH:schema_acl/);
  assert.equal(drift.stderr.includes(dir),false);
  assert.doesNotMatch(drift.stderr,/00000000000000000000000/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('PG17 ACL supplement fixture is strictly isolated and does not depend on secrets',async()=>{
 const y=await readFile('.github/workflows/m44-access-acl-sidecar-synthetic.yml','utf8');
 assert.match(y,/--network none/);
 assert.match(y,/docker port "\$container"/);
 assert.match(y,/docker inspect --format/);
 assert.match(y,/IBERFIT_M44_ACL_SIDECAR_PG17_SCHEMA_COLUMN_DATABASE_DRIFT_VERIFIED/);
 assert.match(y,/IBERFIT_M44_ACL_SIDECAR_RENAMED_RESTORE_PARITY_VERIFIED/);
 assert.match(y,/CREATE DATABASE iberfit_m44_acl_sidecar_restored/);
 assert.match(y,/compareAccessCatalog\(original,renamed\)/);
 for(const key of ACCESS_CATEGORIES)assert.match(y,new RegExp('check_change[^\\n]* '+key));
 assert.doesNotMatch(y,/--network host|ports:|--publish|secrets\.|SUPABASE_ACCESS_TOKEN|IBERFIT_PROD_DATABASE_URL/);
 assert.match(y,/IBERFIT_M44_PLATFORM_RECOVERY_NOT_CERTIFIED/);
});
