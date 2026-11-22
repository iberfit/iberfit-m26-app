import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {selectAppOnlyPrivilegeToc,certifyManagedAppAclCensus,certifyM44AppAclDigests,certifyM44AppAclSemanticReadback} from '../scripts/ops/m44_managed_acl_replay_isolated.mjs';
const example=['; Archive created','; TOC Entries: 7',
'1; 2615 10 TABLE public.clients postgres',
'2; 0 0 ACL public TABLE clients postgres',
'3; 0 0 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES postgres',
'4; 0 0 ACL auth TABLE users postgres',
'5; 0 0 ACL private FUNCTION x postgres',
'6; 0 0 ACL storage TABLE objects postgres',
'7; 0 0 TABLE DATA public.clients postgres',''];
test('Only app public/private grants and defaults can remain active',()=>{
 // Use sufficient repeated synthetic entries to meet intentionally strict minimum.
 const parts=['; Archive synthetic', '; TOC Entries: 125'];
 for(let i=1;i<=120;i++)parts.push(i+'; 0 0 ACL public TABLE synthetic_'+i+' postgres');
 parts.push('121; 0 0 DEFAULT ACL private DEFAULT PRIVILEGES FOR TABLES postgres');
 parts.push('122; 0 0 ACL auth TABLE users postgres');
 parts.push('123; 0 0 ACL storage TABLE objects postgres');
 parts.push('124; 0 0 TABLE DATA public.clients postgres');
 parts.push('125; 0 0 FUNCTION public sensitive postgres');
 const p=selectAppOnlyPrivilegeToc(parts.join('\n'));
 assert.equal(p.grants,120);assert.equal(p.defaults,1);
 assert.equal(p.output.split('\n').filter(s=>/^\d+;/.test(s)).length,121);
 assert.match(p.output,/;122; 0 0 ACL auth /);
 assert.match(p.output,/;124; 0 0 TABLE DATA public/);
 assert.equal(p.platformCertified,false);
});
test('Reject low scope, missing defaults and unsupported scope changes',()=>{
 assert.throws(()=>selectAppOnlyPrivilegeToc(example.join('\n')),/M44_ACL_TOC_|M44_MANAGED_ACL_/);
});
const src=Object.freeze({app_tables:131,rls:131,policies:218,relation_acl:134,function_acl:255,default_acl:6,
 invalid_indexes:0,users:2,storage:137});
test('ACL parity requires matching schema, privileges, Auth and Storage cardinality',()=>{
 const ok=certifyManagedAppAclCensus(src,{...src});
 assert.equal(ok.aclRestored,true);assert.equal(ok.fullPlatformCertified,false);
 for(const key of Object.keys(src)){
  assert.throws(()=>certifyManagedAppAclCensus(src,{...src,[key]:src[key]+1}),/M44_MANAGED_ACL_/);
 }
});
test('M44 app ACL workflow does not mutate PROD or replay data and always restores Free slots',()=>{
 const s=readFileSync('scripts/ops/m44_managed_acl_replay_isolated.mjs','utf8');
 const y=readFileSync('.github/workflows/m44-managed-acl-replay.yml','utf8');
 assert.match(s,/const PROD='pjhmrhejsoofmouedavw'/);
 assert.match(s,/--single-transaction/);assert.match(s,/--exit-on-error/);
 assert.match(s,/await assertSealed\(\);await assertDenied\(\)/);
 assert.match(s,/finally\s*\{/);
 assert.doesNotMatch(s,/await mg\(PROD\s*,\s*['"]\/(?:pause|restore|database\/password)/);
 assert.doesNotMatch(s,/--disable-triggers|session_replication_role|--clean|DROP TABLE/);
 assert.match(y,/restore-free-slots:/);
 assert.match(y,/environment: m26-canary-readonly/);
 assert.match(y,/concurrency:/);
});
test('Do not query paused project service config: prove prior seal and check after resume',()=>{
 const s=readFileSync('scripts/ops/m44_managed_acl_replay_isolated.mjs','utf8');
 const a=s.indexOf("const source=await readCensus(PROD)");
 const pause=s.indexOf("qaPaused=true;await mg(QA,'/pause'");
 const resume=s.indexOf("cloneActivated=true;await mg(TARGET,'/restore'");
 const seal=s.indexOf("await assertSealed();await assertDenied();");
 const firstReadback=s.indexOf("const beforeAclDigests=await readAclDigests(TARGET)");
 assert.ok(a>0&&pause>a&&resume>pause&&seal>resume&&firstReadback>seal);
 assert.doesNotMatch(s.slice(s.indexOf("async function main()"),resume),/await assertSealed\(\)/);
 assert.match(s,/MANAGEMENT_HTTP_'\+r.status\+'_PHASE_'\+m44Phase/);
});

test('Managed supabase_admin default privileges are never re-granted by postgres',()=>{
 const parts=['; Archive synthetic','; TOC Entries: 127'];
 for(let i=1;i<=120;i++)parts.push(i+'; 0 0 ACL public TABLE fixture_'+i+' postgres');
 parts.push('121; 0 0 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES postgres');
 parts.push('122; 0 0 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES supabase_admin');
 parts.push('123; 0 0 ACL public TABLE suspicious supabase_admin');
 parts.push('124; 0 0 ACL auth TABLE users postgres');
 parts.push('125; 0 0 ACL storage TABLE objects postgres');
 parts.push('126; 0 0 TABLE DATA public.clients postgres');
 parts.push('127; 0 0 FUNCTION public fixture postgres');
 assert.throws(()=>selectAppOnlyPrivilegeToc(parts.join('\n')),/APP_OBJECT_OWNER_NOT_POSTGRES/);
 parts[124]='123; 0 0 ACL public TABLE safe postgres';
 const result=selectAppOnlyPrivilegeToc(parts.join('\n'));
 assert.equal(result.grants,121);
 assert.equal(result.defaults,1);
 assert.match(result.output,/;122; 0 0 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES supabase_admin/);
 assert.ok(!result.output.split('\n').some(l=>/^122;/.test(l)));
});
test('Managed default permissions and exact app ACL digests must match before promotion',()=>{
 const keys=['schema_acl','relation_acl','function_acl','column_acl','managed_defaults',
  'postgres_defaults','policy_digest'];
 const baseline=Object.fromEntries(keys.map((k,i)=>[k,String(i+1).repeat(64)]));
 assert.deepEqual(certifyM44AppAclDigests(baseline,{...baseline},{phase:'after'}).matched,7);
 for(const k of keys)assert.throws(()=>certifyM44AppAclDigests(baseline,
  {...baseline,[k]:'a'.repeat(64)},{phase:'after'}),/ACL_DIGEST_PARITY_DRIFT/);
 for(const k of ['managed_defaults','policy_digest'])
  assert.throws(()=>certifyM44AppAclDigests(baseline,
   {...baseline,[k]:'b'.repeat(64)},{phase:'before'}),/MANAGED_BASELINE_DIGEST_DRIFT/);
 assert.equal(certifyM44AppAclDigests(baseline,
  {...baseline,relation_acl:'f'.repeat(64)},{phase:'before'}).matched,2);
 assert.throws(()=>certifyM44AppAclDigests(baseline,
  {...baseline,managed_defaults:'not-a-hash'},{phase:'before'}),/ACL_DIGEST_FORMAT_INVALID/);
});
test('Synthetic M44 exposure probe is excluded from actual app ACL census',()=>{
 const s=readFileSync('scripts/ops/m44_managed_acl_replay_isolated.mjs','utf8');
 const count=s.match(/'relation_acl',\(SELECT count\(\*\) FROM pg_class[^\n]+/);
 assert.ok(count,'Expected relation ACL census');
 assert.match(count[0],/c.relacl IS NOT NULL AND NOT \(n.nspname='public' AND c.relname='m44_recovery_exposure_probe'\)/);
 const appOnly=Object.freeze({...src,relation_acl:src.relation_acl});
 assert.equal(certifyManagedAppAclCensus(src,appOnly).aclRestored,true);
 assert.throws(()=>certifyManagedAppAclCensus(src,{...src,relation_acl:src.relation_acl+1}),
  /ACL_PARITY_DRIFT_RELATION_ACL/);
 assert.throws(()=>certifyManagedAppAclCensus(src,{...src,function_acl:src.function_acl+1}),
  /ACL_PARITY_DRIFT_FUNCTION_ACL/);
});
test('Exact ACL digests are collected after sealed clone and no replay runs',()=>{
 const s=readFileSync('scripts/ops/m44_managed_acl_replay_isolated.mjs','utf8');
 const start=s.indexOf('async function main()');
 const segment=s.slice(start);
 const seal=segment.indexOf('await assertSealed();await assertDenied();');
 const before=segment.indexOf("const beforeAclDigests=await readAclDigests(TARGET)");
 const replay=segment.indexOf('await replayACL();');
 const after=segment.indexOf("const afterAclDigests=await readAclDigests(TARGET)");
 assert.ok(seal>=0&&before>seal&&after>before);
 assert.equal(replay,-1);
 assert.match(s,/managed_defaults/);
 assert.match(s,/m44_recovery_exposure_probe/);
 assert.doesNotMatch(s,/SET ROLE supabase_admin|GRANT supabase_admin TO postgres/);
});
test('A successfully replayed managed sandbox is verified read-only; no non-idempotent REVOKE retries',()=>{
 const source=readFileSync('scripts/ops/m44_managed_acl_replay_isolated.mjs','utf8');
 const main=source.slice(source.indexOf('async function main()'));
 const replay=main.indexOf('await replayACL();');
 const first=main.indexOf("beforeAttestation=certifyM44AppAclSemanticReadback(");
 const second=main.indexOf("const attestation=certifyM44AppAclSemanticReadback(");
 const seal=main.indexOf('await assertSealed();await assertDenied();');
 assert.equal(replay,-1,'No second ACL restore of already-mutated managed clone');
 assert.ok(seal>=0&&first>seal&&second>first);
 assert.match(main,/certifyM44AppAclSemanticReadback\(/);
 assert.match(main,/readRelationSemantics\(PROD\)/);
 assert.match(main,/readRelationSemantics\(TARGET\)/);
 assert.match(main,/M44_MANAGED_EXISTING_APP_ACL_VERIFIED_READONLY/);
 assert.doesNotMatch(main,/await connection\(\)|await archive\(\)|await replayACL\(\)/);
});
const scope=Object.freeze({
 schemas:Object.freeze({count:2,fingerprint:'e'.repeat(64)}),
 functions:Object.freeze({count:255,fingerprint:'f'.repeat(64)})
});
test('A PostgreSQL NULL ACL equivalent to explicit owner-default grants is not a security drift',()=>{
 const keys=['schema_acl','relation_acl','function_acl','column_acl','managed_defaults',
  'postgres_defaults','policy_digest'];
 const srcDig=Object.fromEntries(keys.map(x=>[x,'a'.repeat(64)]));
 const dstDig={...srcDig,relation_acl:'b'.repeat(64)};
 const semantic={count:135,fingerprint:'c'.repeat(64)};
 const compatible=certifyM44AppAclSemanticReadback(src,{...src,relation_acl:133},
  srcDig,dstDig,semantic,{...semantic},scope,scope);
 assert.equal(compatible.effectiveRelationAclEqual,true);
 assert.equal(compatible.physicalRelationAclCountDrift,true);
 assert.equal(compatible.physicalRelationAclArrayDrift,true);
 assert.equal(compatible.otherAclDigestsEqual,true);
 assert.equal(compatible.fullPlatformCertified,false);
});
test('The semantic fingerprint rejects any changed grantor, grantee, privilege or grant option',()=>{
 const keys=['schema_acl','relation_acl','function_acl','column_acl','managed_defaults',
  'postgres_defaults','policy_digest'];
 const dig=Object.fromEntries(keys.map(x=>[x,'a'.repeat(64)]));
 const semantic={count:135,fingerprint:'c'.repeat(64)};
 assert.throws(()=>certifyM44AppAclSemanticReadback(src,src,dig,dig,semantic,
  {...semantic,fingerprint:'d'.repeat(64)},scope,scope),/EFFECTIVE_RELATION_ACL_DRIFT/);
 assert.throws(()=>certifyM44AppAclSemanticReadback(src,src,dig,dig,semantic,
  {...semantic,count:136},scope,scope),/EFFECTIVE_RELATION_ACL_DRIFT/);
 for(const category of ['column_acl','managed_defaults','postgres_defaults','policy_digest']){
  assert.throws(()=>certifyM44AppAclSemanticReadback(src,src,dig,
   {...dig,[category]:'b'.repeat(64)},semantic,semantic,scope,scope),/ACL_DIGEST_PARITY_DRIFT_/);
 }
 assert.throws(()=>certifyM44AppAclSemanticReadback(src,
  {...src,function_acl:src.function_acl+1},dig,dig,semantic,semantic,scope,scope),
  /SECURITY_COUNT_DRIFT_FUNCTION_ACL/);
});
test('schema and function physical array drift is tolerated only after exact semantic equality',()=>{
 const keys=['schema_acl','relation_acl','function_acl','column_acl','managed_defaults',
  'postgres_defaults','policy_digest'];
 const d=Object.fromEntries(keys.map(k=>[k,'a'.repeat(64)]));
 const physical={...d,schema_acl:'b'.repeat(64),function_acl:'c'.repeat(64),
  relation_acl:'d'.repeat(64)};
 const semantic={count:135,fingerprint:'1'.repeat(64)};
 const ok=certifyM44AppAclSemanticReadback(src,{...src,relation_acl:133},
  d,physical,semantic,semantic,scope,scope);
 assert.equal(ok.effectiveSupplementalAclEqual,true);
 assert.equal(ok.physicalSchemaAclArrayDrift,true);
 assert.equal(ok.physicalFunctionAclArrayDrift,true);
 assert.equal(ok.otherAclDigestsEqual,true);
 for(const category of ['schemas','functions']){
  const different={...scope,[category]:{...scope[category],fingerprint:'9'.repeat(64)}};
  assert.throws(()=>certifyM44AppAclSemanticReadback(src,src,d,d,semantic,
   semantic,scope,different),/SUPPLEMENTAL_EFFECTIVE_ACL_DRIFT_/);
  const missing={...scope,[category]:{...scope[category],count:0}};
  assert.throws(()=>certifyM44AppAclSemanticReadback(src,src,d,d,semantic,
   semantic,scope,missing),/SUPPLEMENTAL_EFFECTIVE_FORMAT_/);
 }
 const legacy=readFileSync('scripts/ops/m44_managed_acl_replay_isolated.mjs','utf8');
 assert.match(legacy,/readSupplementalSemantics\(PROD\)/);
 assert.match(legacy,/readSupplementalSemantics\(TARGET\)/);
 assert.match(legacy,/supplementalSemanticSql/);
});
test('Canonical readback is sorted across relation kind and grantor/grantee, not raw aclitem order',()=>{
 const s=readFileSync('scripts/ops/m44_managed_acl_replay_isolated.mjs','utf8');
 assert.match(s,/aclexplode\(coalesce\(c.relacl,/);
 assert.match(s,/acldefault\(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner\)/);
 assert.match(s,/a\.privilege_type,a\.is_grantable/);
 assert.match(s,/ORDER BY schema_name,relation_name,kind/);
 assert.match(s,/m44_recovery_exposure_probe/);
 const main=s.slice(s.indexOf('async function main()'));
 assert.doesNotMatch(main,/await replayACL\(\)|await connection\(\)|await archive\(\)/);
});
test('Unprotected direct execution rejects without network or changes',()=>{
 const r=spawnSync(process.execPath,['scripts/ops/m44_managed_acl_replay_isolated.mjs'],{
  env:{PATH:process.env.PATH},encoding:'utf8',timeout:6000});
 assert.equal(r.status,1);assert.match(r.stderr,/M44_MANAGED_ACL_PROTECTED_CONTEXT_REQUIRED/);
});
