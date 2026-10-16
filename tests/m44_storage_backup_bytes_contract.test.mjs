import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {backupStorage,verifyStorage} from '../scripts/ops/m44_storage_backup_bytes.mjs';
const body=Buffer.from([0,1,2,255,8,10,92,31,0]);
const old={key:process.env.IBERFIT_PROD_STORAGE_SERVICE_KEY,url:process.env.IBERFIT_PROD_STORAGE_URL};
const allowed='https://pjhmrhejsoofmouedavw.supabase.co';
test('Storage fixture copies exact bytes and hashes with opaque local filenames',async()=>{
 process.env.IBERFIT_PROD_STORAGE_SERVICE_KEY='fake-test-key-not-a-real-production-key-0123456789';
 process.env.IBERFIT_PROD_STORAGE_URL=allowed;
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'if-storage-'));
 try{
  let requested=false;
  const fetchImpl=async(url,options)=>{
   requested=true;assert.match(url,/\/storage\/v1\/object\/authenticated\/private-iri\/client%20space\/image.png$/);
   assert.equal(options.method,'GET');
   assert.ok(options.headers.apikey);
   return {ok:true,body:Readable.toWeb(Readable.from([body]))};
  };
  const item=[{bucket_id:'private-iri',name:'client space/image.png'}];
  const result=await backupStorage({inventory:item,outDir:dir,fetchImpl});
  assert.ok(requested);
  assert.equal(result.count,1);
  assert.deepEqual(await fs.readFile(path.join(dir,'files/000000.bin')),body);
  assert.equal((await verifyStorage(dir)).count,1);
  await fs.writeFile(path.join(dir,'files/000000.bin'),Buffer.from('tampered'));
  await assert.rejects(verifyStorage(dir),/HASH_MISMATCH/);
 }finally{await fs.rm(dir,{force:true,recursive:true});}
});
test('Storage refuses mismatched production project and duplicates without contacting remote server',async()=>{
 process.env.IBERFIT_PROD_STORAGE_URL='https://gjztkdwfmunnzhtvxrsu.supabase.co';
 let called=false;const fetchImpl=async()=>{called=true;throw Error('no network');};
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'if-storage-'));
 try{
  await assert.rejects(backupStorage({inventory:[],outDir:dir,fetchImpl}),/PROJECT_MISMATCH/);
  assert.equal(called,false);
  process.env.IBERFIT_PROD_STORAGE_URL=allowed;
  await assert.rejects(backupStorage({inventory:[{bucket_id:'x',name:'y'},{bucket_id:'x',name:'y'}],outDir:dir,fetchImpl}),/INVENTORY_DUPLICATE/);
  assert.equal(called,false);
 }finally{await fs.rm(dir,{force:true,recursive:true});}
});
test.after(()=>{if(old.key===undefined)delete process.env.IBERFIT_PROD_STORAGE_SERVICE_KEY;else process.env.IBERFIT_PROD_STORAGE_SERVICE_KEY=old.key;
 if(old.url===undefined)delete process.env.IBERFIT_PROD_STORAGE_URL;else process.env.IBERFIT_PROD_STORAGE_URL=old.url;});
