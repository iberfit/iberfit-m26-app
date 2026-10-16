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
