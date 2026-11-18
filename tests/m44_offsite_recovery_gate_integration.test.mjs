import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyProductionBackupSafety,PROD_REF} from '../scripts/ops/m44_prod_backup_inventory_guard.mjs';
const now=Date.UTC(2026,9,16,4,0,0);
const backup={inserted_at:new Date(now-3600000).toISOString(),status:'COMPLETED',is_physical_backup:true};
test('production gate preserves successful managed backup inventory unchanged',async()=>{
 const r=await verifyProductionBackupSafety({projectRef:PROD_REF,
  accessToken:'fake-protected-management-token',
  fetchImpl:async()=>({ok:true,json:async()=>({backups:[backup]})}),
  nowMs:now});
 assert.equal(r.ready,true);
 assert.equal(r.method,'supabase-managed-inventory');
 assert.equal(r.restoreTestVerified,false);
});
test('Free-tier managed failure remains blocked when no independent Drive proof exists',async()=>{
 await assert.rejects(verifyProductionBackupSafety({
  projectRef:PROD_REF,accessToken:'fake-protected-management-token',
  githubToken:'ambient-github-token-alone-must-not-enable-external',
  fetchImpl:async()=>({ok:true,json:async()=>({backups:[]})}),nowMs:now
 }),/M44_PROD_BACKUP_NO_RECENT_COMPLETED_SNAPSHOT/);
});
test('Free-tier route rejects mere run ID and file name without OAuth custody check',async()=>{
 await assert.rejects(verifyProductionBackupSafety({
  projectRef:PROD_REF,accessToken:'fake-protected-management-token',
  githubToken:'token',runId:'38833678711',fileId:'private-placeholder',
  driveFolderId:'private-folder-placeholder',
  fetchImpl:async()=>({ok:true,json:async()=>({backups:[]})}),nowMs:now
 }),/M44_OFFSITE_PROOF_DRIVE_OAUTH_CREDENTIALS_MISSING/);
});
test('never query another Supabase project even when offsite evidence is present',async()=>{
 let reads=0;
 await assert.rejects(verifyProductionBackupSafety({
  projectRef:'gjztkdwfmunnzhtvxrsu',accessToken:'management-token',
  runId:'38833678711',fileId:'private-placeholder',
  driveFolderId:'private-folder-placeholder',
  fetchImpl:async()=>{reads++;throw Error('unexpected');},nowMs:now
 }),/WRONG_PROJECT/);
 assert.equal(reads,0);
});

test('even valid real-run and Drive archive evidence cannot authorize incomplete platform recovery',async()=>{
 const {createHash}=await import('node:crypto');
 const sourceSha='4dde3b098caccf24673e62c01fdfb097c5bd9db3';
 const backupSha='e0a89cff70794dbd77624fceb42932fca521bb11';
 const bytes=Buffer.alloc(1_200_000,0x62); // inert synthetic fixture
 const expected=createHash('sha256').update(bytes).digest('hex');
 const runId=38833678711;
 const steps=['Fail closed if protected production backup credentials are unavailable',
 'Export complete PG17 DB and all Storage object bytes to ephemeral private workspace',
 'Encrypt authenticated recovery archive before any upload',
 'Reopen ciphertext and verify restored Storage bytes in isolated workspace',
 'Publish verified encrypted archive for immediate private-drive transfer',
 'Remove all temporary plaintext and ciphertext from runner'];
 let queries=0;
 const fetchImpl=async(url)=>{
  queries++;
  if(url.includes('/database/backups'))return {ok:true,json:async()=>({backups:[]})};
  if(url.includes('/actions/runs/')&&url.includes('/jobs?'))return {ok:true,json:async()=>({
   total_count:3,jobs:[
    'm44-encrypted-archive-and-storage-contract',
    'm44-synthetic-postgresql17-restore-proof',
    'm44-prod-db-storage-encrypted-backup-and-restore'
   ].map((name,index)=>({
    id:index+100,run_id:runId,run_attempt:1,
    workflow_name:'IBERFIT M44 Encrypted Offsite Disaster Recovery',
    head_branch:'canary/rc74-4',head_sha:backupSha,
    name,status:'completed',conclusion:'success',
    completed_at:'2026-10-16T03:06:00Z',
    steps:index===2?steps.map(name=>({name,status:'completed',conclusion:'success'})):[]
   }))
  })};
  if(url.includes('/actions/runs/')&&url.includes('/artifacts?'))return {ok:true,json:async()=>({
   total_count:1,artifacts:[{
    id:12083431361,name:'iberfit-prod-ciphertext-'+runId,
    workflow_run:{id:runId,head_branch:'canary/rc74-4',head_sha:backupSha},
    size_in_bytes:bytes.length,digest:'sha256:'+expected,expired:false,
    created_at:'2026-10-16T03:06:01Z',expires_at:'2026-10-17T03:06:01Z'
   }]
  })};
  if(url.includes('/actions/runs/'))return {ok:true,json:async()=>({
   id:runId,run_attempt:1,event:'push',
   repository:{full_name:'iberfit/iberfit-m26-app',id:1306074388},
   name:'IBERFIT M44 Encrypted Offsite Disaster Recovery',
   path:'.github/workflows/m44-encrypted-disaster-recovery.yml',
   head_branch:'canary/rc74-4',head_sha:backupSha,
   status:'completed',conclusion:'success',
   created_at:'2026-10-16T03:00:00Z',updated_at:'2026-10-16T03:07:00Z'
  })};
  if(url.includes('/compare/'))return {ok:true,json:async()=>({status:'ahead',behind_by:0})};
  if(url.includes('alt=media'))return {ok:true,body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};
  if(url.includes('drive/v3/files/root?'))return {ok:true,json:async()=>({
   id:'expected-root',mimeType:'application/vnd.google-apps.folder',
   trashed:false,shared:false,
   permissions:[{type:'user',role:'owner',emailAddress:'iberfit.cl@gmail.com'}]
  })};
  if(url.includes('drive/v3/files/expected-folder?'))return {ok:true,json:async()=>({
   id:'expected-folder',mimeType:'application/vnd.google-apps.folder',
   trashed:false,shared:false,parents:['expected-root'],
   permissions:[{type:'user',role:'owner',emailAddress:'iberfit.cl@gmail.com'}]
  })};
  if(url.includes('drive/v3/files/'))return {ok:true,json:async()=>({
   id:'expected-file',trashed:false,shared:false,mimeType:'application/zip',
   size:String(bytes.length),parents:['expected-folder'],
   permissions:[{type:'user',role:'owner',emailAddress:'iberfit.cl@gmail.com'}]
  })};
  throw new Error('Unexpected endpoint');
 };
 await assert.rejects(verifyProductionBackupSafety({projectRef:PROD_REF,
  accessToken:'valid-managed-token-for-test',sourceSha,runId,
  fileId:'expected-file',driveFolderId:'expected-folder',githubToken:'synthetic-github-token',
  driveAccessToken:'synthetic-google-access-token',nowMs:now,fetchImpl
 }),/M44_PROD_BACKUP_PLATFORM_RECOVERY_UNVERIFIED/);
 assert.ok(queries>=7);
});
