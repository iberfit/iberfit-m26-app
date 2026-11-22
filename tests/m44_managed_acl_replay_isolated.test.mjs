import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {selectAppOnlyPrivilegeToc,certifyManagedAppAclCensus} from '../scripts/ops/m44_managed_acl_replay_isolated.mjs';
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
 const replay=s.indexOf("await replayACL();");
 assert.ok(a>0&&pause>a&&resume>pause&&seal>resume&&replay>seal);
 assert.doesNotMatch(s.slice(s.indexOf("async function main()"),resume),/await assertSealed\(\)/);
 assert.match(s,/MANAGEMENT_HTTP_'\+r.status\+'_PHASE_'\+m44Phase/);
});
test('Unprotected direct execution rejects without network or changes',()=>{
 const r=spawnSync(process.execPath,['scripts/ops/m44_managed_acl_replay_isolated.mjs'],{
  env:{PATH:process.env.PATH},encoding:'utf8',timeout:6000});
 assert.equal(r.status,1);assert.match(r.stderr,/M44_MANAGED_ACL_PROTECTED_CONTEXT_REQUIRED/);
});
