import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {extractArchiveRelationAclKeys,compareArchiveRelationCoverage} from '../scripts/ops/m44_offline_acl_archive_coverage.mjs';
const toc=()=>{
 const lines=[';','; Archive created by synthetic fixture','; TOC Entries: 460',';'];
 for(let i=1;i<=131;i++)lines.push(i+'; 0 0 ACL public TABLE app_table_'+i+' postgres');
 for(let i=132;i<=134;i++)lines.push(i+'; 0 0 ACL public SEQUENCE app_seq_'+(i-131)+' postgres');
 for(let i=135;i<=390;i++)lines.push(i+'; 0 0 ACL public FUNCTION app_func_'+i+'() postgres');
 lines.push('391; 0 0 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES postgres');
 return lines.join('\n')+'\n';
};
const rows=()=>[...Array.from({length:131},(_,i)=>({schema_name:'public',relation_name:'app_table_'+(i+1),kind:'r',explicit_acl:true})),
 ...Array.from({length:3},(_,i)=>({schema_name:'public',relation_name:'app_seq_'+(i+1),kind:'S',explicit_acl:true})),
 {schema_name:'public',relation_name:'app_seq_4',kind:'S',explicit_acl:false}];
test('Sanitized offline archive coverage counts exact source app ACLs without names',()=>{
 const t=toc(),x=extractArchiveRelationAclKeys(t);
 assert.equal(x.relationAclEntries,134);assert.equal(x.totalAcl,390);
 const r=compareArchiveRelationCoverage(rows(),t);
 assert.deepEqual([r.sourceRelations,r.sourceExplicitAcl,r.tocRelationAcl],[135,134,134]);
 assert.equal(r.missingInArchive,0);assert.equal(r.archiveObjectsMissingSource,0);
 assert.equal(r.archiveAclOnNullSource,0);assert.equal(r.prodWrites,0);assert.equal(r.sandboxTouched,false);
 assert.equal(r.exactManagedAclParityCertified,false);
});
test('Missing ACL, unknown objects and false default grants are detected, not silently accepted',()=>{
 const data=rows(),t=toc();
 const missing=t.replace('1; 0 0 ACL public TABLE app_table_1 postgres',
  '1; 0 0 ACL public FUNCTION fake_function postgres');
 const r=compareArchiveRelationCoverage(data,missing);
 assert.equal(r.missingInArchive,1);
 const orphan=t.replace('2; 0 0 ACL public TABLE app_table_2 postgres',
  '2; 0 0 ACL public TABLE removed_table postgres');
 const r2=compareArchiveRelationCoverage(data,orphan);
 assert.equal(r2.archiveObjectsMissingSource,1);
 assert.equal(r2.missingInArchive,1);
 const unexpected=[...data];
 unexpected[0]={...unexpected[0],explicit_acl:false};
 assert.equal(compareArchiveRelationCoverage(unexpected,t).archiveAclOnNullSource,1);
});
test('Duplicate or unexpected unparsed TOC relation ACLs fail closed',()=>{
 assert.throws(()=>extractArchiveRelationAclKeys(toc().replace(
  '2; 0 0 ACL public TABLE app_table_2 postgres',
  '2; 0 0 ACL public TABLE app_table_1 postgres')),/TOC_RELATION_ACL_DUPLICATED/);
 assert.throws(()=>extractArchiveRelationAclKeys(toc().replace(
  '2; 0 0 ACL public TABLE app_table_2 postgres',
  '2; 0 0 ACL public TABLE app_table_2 other_role')),/TOC_RELATION_ACL_UNPARSEABLE/);
 assert.throws(()=>compareArchiveRelationCoverage(rows().map((v,i)=>
  i===1?{...v,relation_name:'../invalid'}:v),toc()),/SOURCE_ROW_INVALID/);
});
test('Offline job cannot be launched without protected CI context, or mutate QA/PROD',()=>{
 const source=readFileSync('scripts/ops/m44_offline_acl_archive_coverage.mjs','utf8');
 const workflow=readFileSync('.github/workflows/m44-offline-acl-archive-coverage.yml','utf8');
 assert.doesNotMatch(source,/\/pause|\/restore|\/database\/password|ALTER ROLE|GRANT\s+.*TO|REVOKE\s+.*FROM/);
 assert.match(workflow,/environment: m26-canary-readonly/);
 assert.doesNotMatch(workflow,/restore-free-slots|qa-shared-auth-readonly/);
 assert.match(source,/ARTIFACT_AUTHENTICITY_FAILED/);
 const r=spawnSync(process.execPath,['scripts/ops/m44_offline_acl_archive_coverage.mjs'],
  {env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});
 assert.equal(r.status,1);assert.match(r.stderr,/M44_OFFLINE_ACL_PROTECTED_CONTEXT_REQUIRED/);
});
