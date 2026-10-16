// Strict, non-disclosing Storage object parity across live export and
// isolated pg_restore. Object identities and private names stay inside ciphertext.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const P='IBERFIT_M44_STORAGE_PARITY_',REF='pjhmrhejsoofmouedavw';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256=/^[0-9a-f]{64}$/;
const fail=s=>{throw Error(P+s);};
const key=(b,n)=>JSON.stringify([b,n]);
function entry(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||
  typeof x.bucket_id!=='string'||!x.bucket_id||
  typeof x.name!=='string'||!x.name||!UUID.test(x.id||'')||
  (x.version!==null&&typeof x.version!=='string')||
  (x.updated_at!==null&&(typeof x.updated_at!=='string'||
   !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(x.updated_at)))||
  (x.size!==null&&(typeof x.size!=='string'||!/^(0|[1-9]\d*)$/.test(x.size))))
  fail('INVENTORY_ENTRY_INVALID');
 return [x.bucket_id,x.name,x.id.toLowerCase(),x.version,x.updated_at,x.size];
}
function snapshot(v){
 if(!Array.isArray(v)||v.length>250000)fail('INVENTORY_INVALID');
 const seen=new Set(),out=[];
 for(const item of v){
  const row=entry(item),k=key(row[0],row[1]);
  if(seen.has(k))fail('INVENTORY_DUPLICATE');
  seen.add(k);out.push(row);
 }
 out.sort((a,b)=>key(a[0],a[1]).localeCompare(key(b[0],b[1]),'en'));
 return out;
}
function manifestCheck(manifest,rows){
 if(manifest?.schema!=='iberfit.storage.backup.v1'||manifest.project!==REF||
  !Array.isArray(manifest.objects)||manifest.objects.length!==rows.length)
  fail('MANIFEST_INVALID');
 const keys=new Set();
 for(let i=0;i<manifest.objects.length;i++){
  const x=manifest.objects[i];
  if(!x||typeof x.bucket!=='string'||!x.bucket||
   typeof x.name!=='string'||!x.name||
   x.relative!=='files/'+String(i).padStart(6,'0')+'.bin'||
   !Number.isSafeInteger(x.bytes)||x.bytes<0||!SHA256.test(x.sha256||''))
   fail('MANIFEST_ENTRY_INVALID');
  const k=key(x.bucket,x.name);
  if(keys.has(k))fail('MANIFEST_DUPLICATE');keys.add(k);
 }
 for(const row of rows)if(!keys.has(key(row[0],row[1])))fail('MANIFEST_OBJECT_MISMATCH');
 return manifest.objects.length;
}
export function certifyStorageMetadataParity({before,after,manifest,phase}={}){
 if(!['source','isolated'].includes(phase))fail('MODE_INVALID');
 const a=snapshot(before),b=snapshot(after);
 const count=manifestCheck(manifest,a);
 if(a.length!==b.length)fail('INVENTORY_COUNT_DRIFT');
 for(let i=0;i<a.length;i++)
  if(JSON.stringify(a[i])!==JSON.stringify(b[i]))
   fail(phase==='source'?'SOURCE_MUTATED_DURING_EXPORT':'ISOLATED_DATABASE_DIVERGENCE');
 return Object.freeze({ok:true,phase,count,platformRecoveryVerified:false});
}
function readJson(filename){
 let st;try{st=fs.lstatSync(filename);}catch{fail('FILE_UNAVAILABLE');}
 if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>64*1024*1024)fail('FILE_INVALID');
 try{return JSON.parse(fs.readFileSync(filename,'utf8'));}catch{fail('JSON_INVALID');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [phase,source,other,manifestPath]=process.argv.slice(2);
  if(!['source','isolated'].includes(phase)||!source||!other||!manifestPath)fail('USAGE');
  const proof=certifyStorageMetadataParity({before:readJson(source),
   after:readJson(other),manifest:readJson(manifestPath),phase});
  process.stdout.write('IBERFIT_M44_STORAGE_'+
   (phase==='source'?'SOURCE_STABLE':'ISOLATED_DB_PARITY')+
   ':objects='+proof.count+'\n');
 }catch(e){
  const code=String(e?.message||'');
  process.stderr.write((code.startsWith(P)?code:P+'FAILED')+'\n');
  process.exitCode=1;
 }
}
