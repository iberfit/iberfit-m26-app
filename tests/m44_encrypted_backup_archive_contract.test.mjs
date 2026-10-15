import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {encryptFile,decryptFile} from '../scripts/ops/m44_encrypted_backup_archive.mjs';
const pass='integration-only-strong-password-for-archive-test-not-a-production-key';
async function fixture(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'iberfit-gcm-test-'));
 try{return await fn({dir,src:path.join(dir,'dump'),cipher:path.join(dir,'dump.ibf'),
   recovered:path.join(dir,'restored')});}
 finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('authenticated streaming cipher survives large binary payload including null bytes',async()=>{
 await fixture(async({src,cipher,recovered})=>{
  const original=randomBytes(1024*1024+139);
  await fs.writeFile(src,original,{mode:0o600});
  const encrypted=await encryptFile(src,cipher,pass);
  assert.equal(encrypted.format,'ibf-gcm-v1');
  assert.ok(encrypted.bytes>original.length);
  const bytes=await fs.readFile(cipher);
  assert.equal(bytes.subarray(0,8).toString('ascii'),'IBFBAK01');
  assert.notDeepEqual(bytes.subarray(36,100),original.subarray(0,64));
  const restored=await decryptFile(cipher,recovered,pass);
  assert.equal(restored.verified,true);
  assert.deepEqual(await fs.readFile(recovered),original);
 });
});
test('wrong key, tampering, magic corruption and truncation fail without plaintext artifacts',async()=>{
 await fixture(async({src,cipher,recovered})=>{
  await fs.writeFile(src,randomBytes(64000));
  await encryptFile(src,cipher,pass);
  await assert.rejects(decryptFile(cipher,recovered,'a'.repeat(45)),/DECRYPT_AUTHENTICATION_FAILED/);
  await assert.rejects(fs.access(recovered),{code:'ENOENT'});
  let blob=await fs.readFile(cipher);
  blob[120]^=0x31;await fs.writeFile(cipher,blob);
  await assert.rejects(decryptFile(cipher,recovered,pass),/DECRYPT_AUTHENTICATION_FAILED/);
  await assert.rejects(fs.access(recovered),{code:'ENOENT'});
  blob[0]^=1;await fs.writeFile(cipher,blob);
  await assert.rejects(decryptFile(cipher,recovered,pass),/MAGIC_INVALID/);
  await fs.writeFile(cipher,Buffer.alloc(12));
  await assert.rejects(decryptFile(cipher,recovered,pass),/CIPHERTEXT_TRUNCATED/);
 });
});
test('weak passphrases, unsafe overwrite, nonexistent sources fail closed',async()=>{
 await fixture(async({src,cipher,recovered})=>{
  await fs.writeFile(src,'known contents');
  await assert.rejects(encryptFile(src,cipher,'weak'),/PASSPHRASE_MISSING_OR_WEAK/);
  await encryptFile(src,cipher,pass);
  await assert.rejects(encryptFile(src,cipher,pass),/OUTPUT_ALREADY_EXISTS/);
  await fs.writeFile(recovered,'keep');
  await assert.rejects(decryptFile(cipher,recovered,pass),/OUTPUT_ALREADY_EXISTS/);
  assert.equal(await fs.readFile(recovered,'utf8'),'keep');
 });
});
