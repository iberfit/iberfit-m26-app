// Export real Storage bytes. Never log original names, tokens or payloads.
// This produces plaintext ONLY inside a runner-private directory, encrypted later.
import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const FAIL='IBERFIT_STORAGE_BACKUP_';
const REF='pjhmrhejsoofmouedavw';
const MAX_SINGLE=256*1024*1024;
function auth(){
 const key=process.env.IBERFIT_PROD_STORAGE_SERVICE_KEY;
 const url=process.env.IBERFIT_PROD_STORAGE_URL;
 if(typeof key!=='string'||key.length<32)throw Error(FAIL+'SERVICE_KEY_MISSING');
 if(url!=='https://'+REF+'.supabase.co')throw Error(FAIL+'PROJECT_MISMATCH');
 return {key,url};
}
function verifyInventory(rows){
 if(!Array.isArray(rows))throw Error(FAIL+'INVENTORY_NOT_ARRAY');
 const ids=new Set(),out=[];
 for(const item of rows){
  const bucket=item?.bucket_id,name=item?.name;
  if(typeof bucket!=='string'||!bucket||typeof name!=='string'||!name)throw Error(FAIL+'INVENTORY_INVALID');
  const composite=JSON.stringify([bucket,name]);
  if(ids.has(composite))throw Error(FAIL+'INVENTORY_DUPLICATE');
  ids.add(composite);out.push({bucket,name});
 }
 return out;
}
function objectPath(bucket,name){
 return [bucket,...name.split('/')].map(encodeURIComponent).join('/');
}
export async function backupStorage({inventory,outDir,fetchImpl=fetch}){
 const rows=verifyInventory(inventory);
 const {key,url}=auth();
 await fs.promises.mkdir(path.join(outDir,'files'),{recursive:true,mode:0o700});
 const result=[];
 for(let i=0;i<rows.length;i++){
  const {bucket,name}=rows[i],destination='files/'+String(i).padStart(6,'0')+'.bin';
  const target=path.join(outDir,destination);
  const endpoint=url+'/storage/v1/object/authenticated/'+objectPath(bucket,name);
  let response;
  try{response=await fetchImpl(endpoint,{method:'GET',headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(120000)});}
  catch{throw Error(FAIL+'DOWNLOAD_NETWORK_ERROR');}
  if(!response?.ok||!response.body)throw Error(FAIL+'DOWNLOAD_DENIED_OR_MISSING');
  let size=0;const digest=createHash('sha256');
  const limiter=new Transform({transform(chunk,_,cb){
   size+=chunk.length;
   if(size>MAX_SINGLE)return cb(Error(FAIL+'FILE_LIMIT_EXCEEDED'));
   digest.update(chunk);cb(null,chunk);
  }});
  try{await pipeline(Readable.fromWeb(response.body),limiter,fs.createWriteStream(target,{flags:'wx',mode:0o600}));}
  catch{await fs.promises.rm(target,{force:true});throw Error(FAIL+'DOWNLOAD_INCOMPLETE');}
  result.push({bucket,name,relative:destination,bytes:size,sha256:digest.digest('hex')});
 }
 // Manifest with original paths and hashes stays inside encrypted archive only.
 await fs.promises.writeFile(path.join(outDir,'manifest.json'),JSON.stringify({schema:'iberfit.storage.backup.v1',project:REF,objects:result}),{mode:0o600,flag:'wx'});
 return Object.freeze({count:result.length,totalBytes:result.reduce((a,x)=>a+x.bytes,0)});
}
export async function verifyStorage(outDir){
 const meta=JSON.parse(await fs.promises.readFile(path.join(outDir,'manifest.json'),'utf8'));
 if(meta.schema!=='iberfit.storage.backup.v1'||meta.project!==REF)throw Error(FAIL+'MANIFEST_INVALID');
 const objects=verifyInventory(meta.objects);
 let count=0,total=0;
 for(let i=0;i<objects.length;i++){
  const entry=meta.objects[i],expected='files/'+String(i).padStart(6,'0')+'.bin';
  if(entry.relative!==expected||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[0-9a-f]{64}$/.test(entry.sha256))throw Error(FAIL+'ENTRY_INVALID');
  const file=await fs.promises.readFile(path.join(outDir,expected));
  if(file.length!==entry.bytes||createHash('sha256').update(file).digest('hex')!==entry.sha256)throw Error(FAIL+'HASH_MISMATCH');
  count++;total+=file.length;
 }
 return {count,totalBytes:total};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,inventoryPath,outDir]=process.argv.slice(2);
 try{
  if(mode==='export'){
   const data=JSON.parse(await fs.promises.readFile(inventoryPath,'utf8'));
   const result=await backupStorage({inventory:data,outDir});
   process.stdout.write('IBERFIT_STORAGE_ENCRYPTION_INPUT_READY:objects='+result.count+'\n');
  }else if(mode==='verify'){
   const result=await verifyStorage(outDir);
   process.stdout.write('IBERFIT_STORAGE_BYTES_RESTORED_AND_HASHED:objects='+result.count+'\n');
  }else throw Error(FAIL+'USAGE');
 }catch(e){process.stderr.write(String(e?.message||FAIL+'FAILED')+'\n');process.exitCode=1;}
}
