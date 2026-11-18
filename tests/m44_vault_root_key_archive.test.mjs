import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {captureVaultRootKey,verifyRestoredVaultRootKey,
 validateRootKeyRecord,PROJECT_REF,SCHEMA} from '../scripts/ops/m44_vault_root_key_archive.mjs';
const KEY='c7'.repeat(32); // synthetic, never a real key
const TOKEN='test-only-opaque-management-access-token';
const good=()=>({schema:SCHEMA,project_ref:PROJECT_REF,root_key:KEY});
const mock=(data,status=200,type='application/json')=>async (url,options)=>{
 assert.equal(url,`https://api.supabase.com/v1/projects/${PROJECT_REF}/pgsodium`);
 assert.equal(options.method,'GET');
 assert.equal(options.redirect,'error');
 assert.equal(options.headers.Authorization,`Bearer ${TOKEN}`);
 assert.ok(options.signal);
 return {status,headers:{get:()=>type},json:async()=>data};
};
const inTemp=async run=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m44-vault-root-'));
 try{return await run(dir);}finally{fs.rmSync(dir,{force:true,recursive:true});}
};

test('read-only management GET captures exact project key in 0600 plaintext for encryption only',async()=>{
 await inTemp(async dir=>{
  const file=path.join(dir,'vault-root-key.json');
  const result=await captureVaultRootKey({token:TOKEN,outputPath:file,
   fetchImpl:mock({root_key:KEY})});
  assert.deepEqual(result,{rootKeyCapturedForEncryption:true,
   hostedAuthVerified:false,platformRecoveryVerified:false});
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),good());
  assert.deepEqual(await verifyRestoredVaultRootKey(file),{
   rootKeyArchived:true,rootKeyApplied:false,vaultDecryptionVerified:false,
   hostedAuthVerified:false,platformRecoveryVerified:false});
  await assert.rejects(()=>captureVaultRootKey({token:TOKEN,outputPath:file,
   fetchImpl:mock({root_key:KEY})}),/PRIVATE_WRITE_FAILED/);
 });
});

test('fail closed on missing credentials, foreign projects, response drift or HTTP error',async()=>{
 await inTemp(async dir=>{
  const file=path.join(dir,'vault-root-key.json');
  const run=(response,opts={})=>captureVaultRootKey({token:TOKEN,outputPath:file,
   fetchImpl:response,...opts});
  await assert.rejects(run(mock({root_key:KEY}),{projectRef:'gjztkdwfmunnzhtvxrsu'}),/TARGET_DENIED/);
  await assert.rejects(run(mock({root_key:KEY}),{token:'tiny'}),/MANAGEMENT_TOKEN_REQUIRED/);
  await assert.rejects(run(mock({root_key:KEY,extra:'unexpected'})),/MANAGEMENT_KEY_INVALID/);
  await assert.rejects(run(mock({root_key:'b'.repeat(63)})),/MANAGEMENT_KEY_INVALID/);
  await assert.rejects(run(mock({root_key:KEY},403)),/MANAGEMENT_READ_FAILED/);
  await assert.rejects(run(mock({root_key:KEY},200,'text/html')),/MANAGEMENT_READ_FAILED/);
  await assert.rejects(run(async()=>{throw Error('raw secret must never escape');}),/MANAGEMENT_READ_FAILED/);
  assert.equal(fs.existsSync(file),false);
 });
});

test('restore verification rejects symlinks, public permissions, wrong ref and extra fields',async()=>{
 await inTemp(async dir=>{
  const file=path.join(dir,'vault-root-key.json');
  fs.writeFileSync(file,JSON.stringify(good()),{mode:0o600});
  const link=path.join(dir,'link.json');fs.symlinkSync(file,link);
  await assert.rejects(verifyRestoredVaultRootKey(link),/RESTORED_FILE_INVALID/);
  fs.chmodSync(file,0o644);
  await assert.rejects(verifyRestoredVaultRootKey(file),/RESTORED_FILE_INVALID/);
  fs.chmodSync(file,0o600);
  fs.writeFileSync(file,JSON.stringify({...good(),project_ref:'gjztkdwfmunnzhtvxrsu'}));
  await assert.rejects(verifyRestoredVaultRootKey(file),/RECORD_INVALID/);
  assert.throws(()=>validateRootKeyRecord({...good(),email:'private'}),/RECORD_INVALID/);
  assert.throws(()=>validateRootKeyRecord({...good(),root_key:KEY.toUpperCase()}),/RECORD_INVALID/);
 });
});

test('protected M44 archive requires key in authenticated ciphertext and never emits it',()=>{
 const src=readFileSync('scripts/ops/m44_vault_root_key_archive.mjs','utf8');
 assert.match(src,/redirect:'error'/u);
 assert.match(src,/method:'GET'/u);
 assert.doesNotMatch(src,/\b(?:PUT|POST|PATCH|DELETE)\b/u);
 assert.doesNotMatch(src,/console\.log\s*\(/u);
 const workflow=readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
 const job=workflow.slice(workflow.indexOf('name: m44-prod-db-storage-encrypted-backup-and-restore'));
 const captured=job.indexOf('m44_vault_root_key_archive.mjs capture');
 const tar=job.indexOf('tar -C "$WORK/plain"');
 const encrypt=job.indexOf('m44_encrypted_backup_archive.mjs encrypt');
 const decrypt=job.indexOf('m44_encrypted_backup_archive.mjs decrypt');
 const verify=job.indexOf('m44_vault_root_key_archive.mjs verify');
 const success=job.indexOf('IBERFIT_PROD_LOCAL_DB_AND_STORAGE_RESTORE_SUCCESS');
 assert.ok(captured>0&&captured<tar&&tar<encrypt&&encrypt<decrypt&&decrypt<verify&&verify<success);
 assert.match(job,/vault-root-key\.json/);
 assert.match(job,/SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/u);
 assert.match(job,/rm -rf "\$WORK\/plain" "\$WORK\/plain\.tar"/u);
 assert.match(workflow,/m44_vault_root_key_archive\.test\.mjs/);
});
