// IBERFIT encrypted disaster-recovery archive v1.
// Uses scrypt (32-byte key) and streaming AES-256-GCM. Only ciphertext may be
// published as an artifact. Do not log passwords, SQL, decrypt output or PII.
import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createCipheriv,createDecipheriv,randomBytes,scryptSync} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const MAGIC=Buffer.from('IBFBAK01','ascii'),SALT=16,IV=12,TAG=16,HEADER=8+SALT+IV;
const prefix='IBERFIT_BACKUP_';
function passphrase(value){
 if(typeof value!=='string'||Buffer.byteLength(value,'utf8')<32)throw Error(prefix+'PASSPHRASE_MISSING_OR_WEAK');
 return value;
}
const derive=(s,p)=>scryptSync(passphrase(p),s,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
async function remove(path){try{await fs.promises.unlink(path);}catch(e){if(e.code!=='ENOENT')throw e;}}
async function prepare(dst){const st=await fs.promises.stat(dst).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));if(st)throw Error(prefix+'OUTPUT_ALREADY_EXISTS');}
export async function encryptFile(src,dst,p){
 await prepare(dst);
 const salt=randomBytes(SALT),iv=randomBytes(IV);
 const cipher=createCipheriv('aes-256-gcm',derive(salt,p),iv);
 const header=Buffer.concat([MAGIC,salt,iv]);
 const output=fs.createWriteStream(dst,{flags:'wx',mode:0o600});
 try{
  await new Promise((resolve,reject)=>output.write(header,e=>e?reject(e):resolve()));
  await pipeline(fs.createReadStream(src),cipher,output);
  await fs.promises.appendFile(dst,cipher.getAuthTag());
  const st=await fs.promises.stat(dst);
  if(st.size<=HEADER+TAG)throw Error(prefix+'ENCRYPTED_ARCHIVE_EMPTY');
  return Object.freeze({format:'ibf-gcm-v1',bytes:st.size});
 }catch(e){output.destroy();await remove(dst);throw e;}
}
export async function decryptFile(src,dst,p){
 await prepare(dst);
 const st=await fs.promises.stat(src);
 if(st.size<HEADER+TAG+1)throw Error(prefix+'CIPHERTEXT_TRUNCATED');
 const fd=await fs.promises.open(src,'r');
 let header=Buffer.alloc(HEADER),tag=Buffer.alloc(TAG);
 try{
  await fd.read(header,0,HEADER,0);
  await fd.read(tag,0,TAG,st.size-TAG);
 }finally{await fd.close();}
 if(!header.subarray(0,8).equals(MAGIC))throw Error(prefix+'MAGIC_INVALID');
 const decipher=createDecipheriv('aes-256-gcm',derive(header.subarray(8,24),p),header.subarray(24,36));
 decipher.setAuthTag(tag);
 const out=fs.createWriteStream(dst,{flags:'wx',mode:0o600});
 try{
  await pipeline(fs.createReadStream(src,{start:HEADER,end:st.size-TAG-1}),decipher,out);
  return Object.freeze({verified:true,bytes:(await fs.promises.stat(dst)).size});
 }catch{out.destroy();await remove(dst);throw Error(prefix+'DECRYPT_AUTHENTICATION_FAILED');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,src,dst]=process.argv.slice(2);
 const p=process.env.IBERFIT_BACKUP_PASSPHRASE;
 if(!['encrypt','decrypt'].includes(mode)||!src||!dst)throw Error(prefix+'USAGE');
 try{
  const result=mode==='encrypt'?await encryptFile(src,dst,p):await decryptFile(src,dst,p);
  process.stdout.write('IBERFIT_BACKUP_'+(mode==='encrypt'?'CIPHERTEXT_CREATED':'AUTHENTICATED_RESTORE_INPUT')+
   ':bytes='+result.bytes+'\n');
 }catch(e){process.stderr.write(String(e?.message||prefix+'FAILED')+'\n');process.exitCode=1;}
}
