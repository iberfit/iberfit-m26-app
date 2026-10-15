import test from 'node:test';
import assert from 'node:assert/strict';
import {PROD_REF,MAX_AGE_MS,certifyBackupInventory,verifyBackupInventory} from '../scripts/ops/m44_prod_backup_inventory_guard.mjs';
const now=Date.UTC(2026,9,15,20,0,0);
const backup=(ms=now-3600000,status='COMPLETED')=>({id:42,
  inserted_at:new Date(ms).toISOString(),status,is_physical_backup:true});
test('backup inventory accepts a recent completed managed snapshot only',()=>{
 assert.equal(MAX_AGE_MS,172800000);
 const proof=certifyBackupInventory({backups:[backup(now-3600000),backup(now-26*3600000)]},{nowMs:now});
 assert.equal(proof.ready,true);
 assert.equal(proof.project,PROD_REF);
 assert.equal(proof.restoreTestVerified,false);
 assert.equal(proof.backupAgeHours,1);
 assert.equal(proof.physical,true);
 assert.equal(JSON.stringify(proof).includes('"id"'),false);
});
test('backup inventory fails closed for missing stale, future, pending, corrupt entries',()=>{
 for(const payload of [null,{},[],{backups:[]},
  {backups:[backup(now-50*3600000)]},
  {backups:[backup(now+3600000)]},
  {backups:[backup(now-3600000,'PENDING')]},
  {backups:[{status:'COMPLETED',inserted_at:'not-a-date'}]}])
  assert.throws(()=>certifyBackupInventory(payload,{nowMs:now}),/M44_PROD_BACKUP_/);
});
test('backup inventory only queries PROD GET, never includes data in query string',async()=>{
 let count=0;
 const fetchImpl=async(url,options)=>{
  count++;
  assert.equal(url,'https://api.supabase.com/v1/projects/'+PROD_REF+'/database/backups');
  assert.equal(options.method,'GET');
  assert.equal(options.body,undefined);
  assert.match(options.headers.Authorization,/^Bearer /);
  return {ok:true,status:200,json:async()=>({backups:[backup()]})};
 };
 const result=await verifyBackupInventory({projectRef:PROD_REF,
  accessToken:'sample_fake_test_token_only',fetchImpl,nowMs:now});
 assert.equal(result.ready,true);
 assert.equal(count,1);
});
test('backup inventory denies QA and refuses hidden HTTP/service errors',async()=>{
 let fetched=false;
 const fetchImpl=async()=>{fetched=true;throw Error('never invoke')};
 await assert.rejects(verifyBackupInventory({projectRef:'gjztkdwfmunnzhtvxrsu',
  accessToken:'x'.repeat(30),fetchImpl,nowMs:now}),/WRONG_PROJECT/);
 assert.equal(fetched,false);
 await assert.rejects(verifyBackupInventory({projectRef:PROD_REF,accessToken:'',fetchImpl}),/TOKEN_MISSING/);
 await assert.rejects(verifyBackupInventory({projectRef:PROD_REF,accessToken:'x'.repeat(30),
  fetchImpl:async()=>({ok:false,status:403})}),/API_HTTP_403/);
 await assert.rejects(verifyBackupInventory({projectRef:PROD_REF,accessToken:'x'.repeat(30),
  fetchImpl:async()=>({ok:true,json:async()=>{throw Error('bad');}})}),/API_NON_JSON/);
 await assert.rejects(verifyBackupInventory({projectRef:PROD_REF,accessToken:'x'.repeat(30),
  fetchImpl:async()=>{throw Error('network');}}),/API_UNREACHABLE/);
});
