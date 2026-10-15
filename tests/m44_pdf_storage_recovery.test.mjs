import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {ensureStoredPdfArtifact} from '../supabase/functions/iberfit-evolution-report-emission-v1/storage-recovery.js';

const digest=async data=>createHash('sha256').update(data).digest('hex');
const bytes=stamp=>new Uint8Array(Buffer.from('%PDF-1.7\\n'+stamp.padEnd(1300,'p')+'\\n%%EOF'));
function bucket(){
 const objects=new Map(),calls=[];
 return {
  objects,calls,
  async upload(path,data,opts){
   calls.push(['upload',path,opts]);
   if(objects.has(path))return {error:Error('The resource already exists')};
   objects.set(path,new Uint8Array(data));return {error:null};
  },
  async download(path){
   calls.push(['download',path]);
   if(!objects.has(path))return {error:Error('Not found')};
   return {error:null,data:new Blob([objects.get(path)])};
  },
 };
}
test('M44 fresh upload verifies checksum from Storage, with no overwrite',async()=>{
 const storage=bucket(),data=bytes('fresh'),hash=await digest(data);
 const result=await ensureStoredPdfArtifact({
  bucket:storage,path:'safe/report.pdf',bytes:data,expectedHash:hash,digest,
  validateExisting:async()=>assert.fail('Fresh upload must not invoke replay check'),
 });
 assert.deepEqual(result,{sha256:hash,size:data.length,recovered:false});
 assert.equal(storage.calls[0][2].upsert,false);
 assert.equal(storage.calls[0][2].contentType,'application/pdf');
});
test('M44 retry after lost ACK can recover a verified existing PDF despite a different creation timestamp',async()=>{
 const storage=bucket(),original=bytes('created at T1'),rerender=bytes('created at T2');
 const first=await ensureStoredPdfArtifact({
  bucket:storage,path:'safe/report.pdf',bytes:original,expectedHash:await digest(original),digest,
  validateExisting:async()=>assert.fail('Not a replay'),
 });
 let validated=0;
 const retry=await ensureStoredPdfArtifact({
  bucket:storage,path:'safe/report.pdf',bytes:rerender,expectedHash:await digest(rerender),digest,
  validateExisting:async actual=>{
   validated++;assert.deepEqual(actual,original);
   // Production validates PDF subject (report ID, revision and source SHA).
  },
 });
 assert.equal(validated,1);
 assert.equal(retry.recovered,true);
 assert.equal(retry.sha256,first.sha256);
 assert.equal(retry.size,first.size);
 assert.deepEqual(storage.objects.get('safe/report.pdf'),original);
 assert.equal(typeof storage.remove,'undefined');
});
test('M44 rejects a pre-existing object with a different source fingerprint without deleting it',async()=>{
 const storage=bucket(),old=bytes('old-source'),newBytes=bytes('changed-source');
 storage.objects.set('safe/report.pdf',old);
 await assert.rejects(()=>ensureStoredPdfArtifact({
  bucket:storage,path:'safe/report.pdf',bytes:newBytes,expectedHash:'0'.repeat(64),digest,
  validateExisting:async()=>{throw Error('wrong source hash');},
 }),/M44_PDF_ORPHAN_REPLAY_COLLISION/);
 assert.deepEqual(storage.objects.get('safe/report.pdf'),old);
});
test('M44 rejects incomplete bytes or readback divergence and never deletes a path',async()=>{
 const storage=bucket(),data=bytes('original'),hash=await digest(data);
 const corrupted={...storage,
  async download(){return {error:null,data:new Blob([bytes('tampered')])};},
 };
 await assert.rejects(()=>ensureStoredPdfArtifact({
  bucket:corrupted,path:'safe/report.pdf',bytes:data,expectedHash:hash,digest,
  validateExisting:async()=>{},
 }),/M44_PDF_STORAGE_CHECKSUM_MISMATCH/);
 assert.ok(storage.objects.has('safe/report.pdf'));
 const missing={async upload(){return {error:Error('upload refused')};},
  async download(){return {error:Error('missing')};}};
 await assert.rejects(()=>ensureStoredPdfArtifact({
  bucket:missing,path:'safe/report.pdf',bytes:data,expectedHash:hash,digest,
  validateExisting:async()=>{},
 }),/upload refused/);
});
test('M44 Edge embeds exact server source fingerprint and validates replay before binding a ledger hash',async()=>{
 const src=await readFile(new URL('../supabase/functions/iberfit-evolution-report-emission-v1/index.ts',import.meta.url),'utf8');
 const pdf=await readFile(new URL('../supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js',import.meta.url),'utf8');
 assert.match(src,/sourceFingerprint=`IBERFIT M44/);
 assert.match(src,/pdf\.getSubject\(\)!==sourceFingerprint/);
 assert.match(src,/p_artifact_sha256:artifact\.sha256/);
 assert.match(pdf,/doc\.setSubject\(String\(sourceFingerprint\)\)/);
 assert.doesNotMatch(src,/if\(uploaded&&!finalizeStarted\)/);
});
