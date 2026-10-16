import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {assertProdConnection,assertArchiveList,encryptBackup,decryptBackup} from '../scripts/ops/free_recovery_crypto.mjs';
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
test('RSA envelope round-trip and ciphertext tamper detection',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'iberfit-backup-'));
  try{
    const sourcePath=path.join(dir,'db.dump'),encryptedPath=path.join(dir,'db.enc'),manifestPath=path.join(dir,'manifest.json');
    const contents=crypto.randomBytes(2048);await writeFile(sourcePath,contents);
    const manifest=await encryptBackup({sourcePath,encryptedPath,manifestPath,publicKey,sourceSha:'a'.repeat(40)});
    assert.equal(manifest.fullRestoreVerified,false);
    assert.equal(manifest.productionMigrationApproved,false);
    assert.equal(manifest.storageObjectBytesIncluded,false);
    assert.deepEqual(await decryptBackup({encryptedPath,manifest,privateKey}),contents);
    const tampered=await readFile(encryptedPath);tampered[0]^=1;await writeFile(encryptedPath,tampered);
    await assert.rejects(()=>decryptBackup({encryptedPath,manifest,privateKey}),/TAMPERED/u);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('Restrict source to TLS PROD session pooler with exact username',()=>{
  const good='postgresql://postgres.pjhmrhejsoofmouedavw:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require';
  assert.equal(assertProdConnection(good).encryptedTransport,true);
  for(const bad of [
    good.replace('postgres.pjhmrhejsoofmouedavw','postgres.gjztkdwfmunnzhtvxrsu'),
    good.replace('5432','6543'),good.replace('sslmode=require','sslmode=disable'),
    good.replace('pooler.supabase.com','attacker.test')
  ])assert.throws(()=>assertProdConnection(bad),/RECOVERY_PRODUCTION_SESSION_POOLER_REQUIRED/u);
});
test('Archive must include actual Client, Auth and Storage metadata tables',()=>{
  const toc='1; 0 1 TABLE DATA public clients postgres\n2; 0 2 TABLE DATA auth users postgres\n3; 0 3 TABLE DATA storage objects postgres';
  assert.equal(assertArchiveList(toc),true);
  assert.throws(()=>assertArchiveList(toc.replace('auth users','auth other')),/auth.users/u);
});
test('Reject weak RSA and bogus provenance',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'iberfit-key-'));
  try{
    const sourcePath=path.join(dir,'db');await writeFile(sourcePath,crypto.randomBytes(512));
    const weak=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
    await assert.rejects(()=>encryptBackup({sourcePath,encryptedPath:path.join(dir,'e'),manifestPath:path.join(dir,'m'),publicKey:weak.publicKey,sourceSha:'a'.repeat(40)}),/KEY_TOO_WEAK/u);
    await assert.rejects(()=>encryptBackup({sourcePath,encryptedPath:path.join(dir,'e2'),manifestPath:path.join(dir,'m2'),publicKey,sourceSha:'invalid'}),/SOURCE_SHA_INVALID/u);
  }finally{await rm(dir,{recursive:true,force:true});}
});