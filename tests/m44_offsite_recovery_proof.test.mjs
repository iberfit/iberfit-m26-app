import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyIndependentOffsiteRecovery,acquireDriveAccessToken} from '../scripts/ops/m44_offsite_recovery_proof.mjs';
const backupSha='e0a89cff70794dbd77624fceb42932fca521bb11';
const sourceSha='4dde3b098caccf24673e62c01fdfb097c5bd9db3';
const bytes=Buffer.from('synthetic encrypted zip archive fixture — no production data'.repeat(50));
const digest=createHash('sha256').update(bytes).digest('hex');
const nowMs=Date.parse('2026-10-16T04:00:00Z');
const runId=38833678711;
const required=[
 'Export complete PG17 DB and all Storage object bytes to ephemeral private workspace',
 'Encrypt authenticated recovery archive before any upload',
 'Reopen ciphertext and verify restored Storage bytes in isolated workspace',
 'Publish verified encrypted archive for immediate private-drive transfer',
 'Remove all temporary plaintext and ciphertext from runner'
];
function fixture(overrides={}){
 const run={id:runId,repository:{full_name:'iberfit/iberfit-m26-app',id:1306074388},
  name:'IBERFIT M44 Encrypted Offsite Disaster Recovery',
  path:'.github/workflows/m44-encrypted-disaster-recovery.yml',
  head_branch:'canary/rc74-4',head_sha:backupSha,status:'completed',conclusion:'success',
  created_at:'2026-10-16T01:10:30Z'};
 const jobs={total_count:1,jobs:[{name:'m44-prod-db-storage-encrypted-backup-and-restore',
  status:'completed',conclusion:'success',steps:required.map(name=>({name,conclusion:'success'}))}]};
 const artifacts={total_count:1,artifacts:[{name:'iberfit-prod-ciphertext-'+runId,
  size_in_bytes:bytes.length,digest:'sha256:'+digest,workflow_run:{id:runId,head_sha:backupSha}}]};
 const root={id:'private-root-id',mimeType:'application/vnd.google-apps.folder',
  shared:false,trashed:false,permissions:[{type:'user',role:'owner',emailAddress:'iberfit.cl@gmail.com'}]};
 const folder={id:'private-folder-id',mimeType:'application/vnd.google-apps.folder',
  shared:false,trashed:false,parents:['private-root-id'],
  permissions:[{type:'user',role:'owner',emailAddress:'iberfit.cl@gmail.com'}]};
 const meta={id:'private-file-id',mimeType:'application/zip',size:String(bytes.length),
  shared:false,trashed:false,parents:['private-folder-id'],
  permissions:[{type:'user',role:'owner',emailAddress:'iberfit.cl@gmail.com'}]};
 const input={sourceSha,runId,fileId:'private-file-id',driveFolderId:'private-folder-id',
  githubToken:'test-github-token',driveAccessToken:'test-drive-access-token',nowMs};
 const data={run,jobs,artifacts,meta,folder,root,compare:{status:'ahead',behind_by:0}};
 for(const [k,v] of Object.entries(overrides))if(k in data)data[k]=v;
 const fetchImpl=async url=>{
  let payload=url.includes('/compare/')?data.compare:
    url.includes('/jobs?')?data.jobs:
    url.includes('/artifacts?')?data.artifacts:
    url.includes('/actions/runs/')?data.run:
    url.includes('alt=media')?null:
    url.includes('/drive/v3/files/root?')?data.root:
    url.includes('/drive/v3/files/private-folder-id?')?data.folder:data.meta;
  if(payload===null)return {ok:true,body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};
  return {ok:true,json:async()=>payload};
 };
 return {args:{...input,fetchImpl},data};
}
test('real origin lineage, successful isolated restore, owner-only Drive and exact streamed SHA pass',async()=>{
 const proof=await verifyIndependentOffsiteRecovery(fixture().args);
 assert.equal(proof.ready,true);
 assert.equal(proof.method,'offsite-drive-encrypted-restore');
 assert.equal(proof.artifactSha256,digest);
 assert.equal(proof.offsiteBytesVerified,true);
 assert.equal(proof.platformRecoveryVerified,false);
});
test('reject unrelated source, failed run and missing restoration step',async()=>{
 const unrelated=fixture({compare:{status:'diverged',behind_by:1}});
 await assert.rejects(verifyIndependentOffsiteRecovery(unrelated.args),/SOURCE_LINEAGE_INVALID/);
 const failed=fixture();failed.data.run.conclusion='failure';
 await assert.rejects(verifyIndependentOffsiteRecovery(failed.args),/RUN_IDENTITY_INVALID/);
 const missing=fixture();missing.data.jobs.jobs[0].steps.pop();
 await assert.rejects(verifyIndependentOffsiteRecovery(missing.args),/ISOLATED_RESTORE_UNVERIFIED/);
});
test('reject unshared false positives, wrong folder, second permission and owner mismatch',async()=>{
 for(const patch of [
  {shared:true},{parents:['untrusted']},
  {permissions:[{type:'anyone',role:'reader'}]},
  {permissions:[{type:'user',role:'owner',emailAddress:'iberfit.cl@gmail.com'},{type:'user',role:'reader',emailAddress:'other@example.org'}]},
  {permissions:[{type:'user',role:'owner',emailAddress:'impostor@example.org'}]}
 ]){
  const f=fixture();Object.assign(f.data.meta,patch);
  await assert.rejects(verifyIndependentOffsiteRecovery(f.args),/DRIVE_CUSTODY_INVALID/);
 }
});
test('reject altered original digest, oversize metadata and stale backups',async()=>{
 const tampered=fixture();tampered.data.artifacts.artifacts[0].digest='sha256:'+'a'.repeat(64);
 await assert.rejects(verifyIndependentOffsiteRecovery(tampered.args),/DRIVE_DIGEST_MISMATCH/);
 const old=fixture();old.data.run.created_at='2026-10-01T01:10:30Z';
 await assert.rejects(verifyIndependentOffsiteRecovery(old.args),/BACKUP_NOT_RECENT/);
 const wrong=fixture();wrong.data.artifacts.artifacts[0].size_in_bytes+=1;
 await assert.rejects(verifyIndependentOffsiteRecovery(wrong.args),/DRIVE_CUSTODY_INVALID/);
});
test('missing credentials fail closed; no third-party data is used in error',async()=>{
 const f=fixture();f.args.driveAccessToken='';
 await assert.rejects(verifyIndependentOffsiteRecovery(f.args),/CREDENTIAL_MISSING/);
});
test('OAuth refresh requires all protected credentials and rejects invalid reply',async()=>{
 await assert.rejects(acquireDriveAccessToken({}),/DRIVE_OAUTH_CREDENTIALS_MISSING/);
 await assert.rejects(acquireDriveAccessToken({clientId:'a',clientSecret:'b',refreshToken:'c',
  fetchImpl:async()=>({ok:false,status:401})}),/DRIVE_OAUTH_REJECTED/);
 const token=await acquireDriveAccessToken({clientId:'a',clientSecret:'b',refreshToken:'c',
  fetchImpl:async()=>({ok:true,json:async()=>({access_token:'x'.repeat(40)})})});
 assert.equal(token,'x'.repeat(40));
});

test('48h archival integrity does not imply 2h production migration RPO',async()=>{
 const f=fixture();
 assert.equal((await verifyIndependentOffsiteRecovery(f.args)).offsiteBytesVerified,true);
 await assert.rejects(verifyIndependentOffsiteRecovery({...f.args,maxAgeMs:2*3600000}),/BACKUP_NOT_RECENT/);
 await assert.rejects(verifyIndependentOffsiteRecovery({...f.args,maxAgeMs:49*3600000}),/MAX_AGE_INVALID/);
});

test('reject shared, trashed, foreign-owned and shared-drive parent folders',async()=>{
 for(const patch of [
  {shared:true},{trashed:true},{driveId:'shared-drive-id'},
  {permissions:[{type:'anyone',role:'reader'}]},
  {permissions:[{type:'user',role:'owner',emailAddress:'someone-else@example.org'}]},
  {permissions:[]},{mimeType:'text/plain'}
 ]){
  const f=fixture();
  Object.assign(f.data.folder,patch);
  await assert.rejects(verifyIndependentOffsiteRecovery(f.args),/DRIVE_FOLDER_CUSTODY_INVALID/);
 }
});
test('reject truncated GitHub pages, absent total counts and ambiguous artifact names',async()=>{
 const cases=[
  {jobs:{total_count:2,jobs:[{name:'m44-prod-db-storage-encrypted-backup-and-restore',status:'completed',conclusion:'success',steps:required.map(name=>({name,conclusion:'success'}))}]}},
  {jobs:{jobs:[{name:'m44-prod-db-storage-encrypted-backup-and-restore',status:'completed',conclusion:'success',steps:required.map(name=>({name,conclusion:'success'}))}]}},
  {artifacts:{artifacts:[],total_count:1}},
  {artifacts:{artifacts:[],total_count:0}}
 ];
 for(const patch of cases){
  const f=fixture(patch);
  await assert.rejects(verifyIndependentOffsiteRecovery(f.args),/JOBS_INCOMPLETE|ARTIFACT_LIST_INCOMPLETE|ARTIFACT_UNIQUE_PROVENANCE_REQUIRED/);
 }
 const f=fixture();
 const duplicate=f.data.artifacts.artifacts[0];
 f.data.artifacts.artifacts.push({...duplicate});
 f.data.artifacts.total_count=2;
 await assert.rejects(verifyIndependentOffsiteRecovery(f.args),/ARTIFACT_UNIQUE_PROVENANCE_REQUIRED/);
});


test('reject private child folder under a shared or foreign-owned Drive root',async()=>{
 for(const patch of [
  {shared:true},{trashed:true},{driveId:'unexpected-shared-drive'},
  {permissions:[{type:'anyone',role:'reader'}]},
  {permissions:[{type:'user',role:'owner',emailAddress:'foreign@example.invalid'}]},
  {permissions:[]},{mimeType:'text/plain'}
 ]){
  const f=fixture();Object.assign(f.data.root,patch);
  await assert.rejects(verifyIndependentOffsiteRecovery(f.args),/DRIVE_ROOT_CUSTODY_INVALID/);
 }
});
test('reject Drive folder ancestry that is missing, cyclic or multiply parented',async()=>{
 for(const parents of [undefined,[],['private-folder-id'],['foreign-root'],['private-root-id','secondary']]){
  const f=fixture();
  if(parents===undefined)delete f.data.folder.parents;
  else f.data.folder.parents=parents;
  await assert.rejects(verifyIndependentOffsiteRecovery(f.args),
    /DRIVE_ANCESTRY_INVALID|DRIVE_ANCESTRY_CYCLE|DRIVE_FOLDER_CUSTODY_INVALID/);
 }
});
