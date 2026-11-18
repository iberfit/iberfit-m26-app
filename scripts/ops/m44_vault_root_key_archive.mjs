// M44: preserve Supabase Vault root key only inside the existing encrypted
// disaster-recovery archive. NEVER log the key, response body, credentials,
// or a digest. No write request to Supabase; no platform restore assertion.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const PROJECT_REF='pjhmrhejsoofmouedavw';
export const SCHEMA='iberfit.m44.vault-root-key-archive.v1';
const API_URL=`https://api.supabase.com/v1/projects/${PROJECT_REF}/pgsodium`;
const HEX_32_BYTES=/^[0-9a-f]{64}$/u;
const TIMEOUT_MS=15000;
const PREFIX='M44_VAULT_ROOT_KEY_';
const reject=code=>{throw new Error(PREFIX+code);};
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);

export function validateRootKeyRecord(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).length!==3||
  !own(value,'schema')||!own(value,'project_ref')||!own(value,'root_key')||
  value.schema!==SCHEMA||value.project_ref!==PROJECT_REF||
  typeof value.root_key!=='string'||!HEX_32_BYTES.test(value.root_key))
   reject('RECORD_INVALID');
 return Object.freeze({rootKeyArchived:true,rootKeyApplied:false,
  vaultDecryptionVerified:false,hostedAuthVerified:false,platformRecoveryVerified:false});
}

export async function captureVaultRootKey({
 token,outputPath,projectRef=PROJECT_REF,fetchImpl=fetch
}={}){
 if(projectRef!==PROJECT_REF)reject('TARGET_DENIED');
 if(typeof token!=='string'||token.length<20)reject('MANAGEMENT_TOKEN_REQUIRED');
 if(typeof outputPath!=='string'||!path.isAbsolute(outputPath))reject('OUTPUT_PATH_INVALID');
 if(typeof fetchImpl!=='function')reject('FETCH_INVALID');
 // Avoid overwriting even a previously captured recovery key.
 const controller=new AbortController();
 const abort=setTimeout(()=>controller.abort(),TIMEOUT_MS);
 let payload;
 try{
  const response=await fetchImpl(API_URL,{
   method:'GET',redirect:'error',signal:controller.signal,
   headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}
  });
  if(response?.status!==200||!String(response?.headers?.get?.('content-type')||'').toLowerCase().includes('application/json'))
   reject('MANAGEMENT_READ_DENIED');
  payload=await response.json();
 }catch{
  // Errors might carry headers, network URLs or bodies. Never forward them.
  reject('MANAGEMENT_READ_FAILED');
 }finally{clearTimeout(abort);}
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
  Object.keys(payload).length!==1||!own(payload,'root_key')||
  typeof payload.root_key!=='string'||!HEX_32_BYTES.test(payload.root_key))
   reject('MANAGEMENT_KEY_INVALID');
 const record={schema:SCHEMA,project_ref:PROJECT_REF,root_key:payload.root_key};
 validateRootKeyRecord(record);
 try{
  const handle=await fs.open(outputPath,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(record)+'\n','utf8');}
  finally{await handle.close();}
 }catch{reject('PRIVATE_WRITE_FAILED');}
 return Object.freeze({rootKeyCapturedForEncryption:true,
  hostedAuthVerified:false,platformRecoveryVerified:false});
}

export async function verifyRestoredVaultRootKey(file){
 if(typeof file!=='string'||!path.isAbsolute(file))reject('PATH_INVALID');
 let stat,record;
 try{
  stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<125||stat.size>1024||
   (stat.mode&0o077)!==0)reject('FILE_UNSAFE');
  record=JSON.parse(await fs.readFile(file,'utf8'));
 }catch{reject('RESTORED_FILE_INVALID');}
 return validateRootKeyRecord(record);
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{
  const [mode,file]=process.argv.slice(2);
  if(!['capture','verify'].includes(mode)||!file||process.argv.length!==4)
   reject('USAGE_INVALID');
  if(mode==='capture'){
   await captureVaultRootKey({token:process.env.SUPABASE_ACCESS_TOKEN,outputPath:path.resolve(file)});
   process.stdout.write('IBERFIT_M44_VAULT_ROOT_KEY_STAGED_FOR_ENCRYPTION\n');
  }else{
   await verifyRestoredVaultRootKey(path.resolve(file));
   process.stdout.write('IBERFIT_M44_VAULT_ROOT_KEY_CIPHERTEXT_ROUNDTRIP_OK:hosted_auth_NOT_verified\n');
  }
 }catch{
  process.stderr.write('IBERFIT_M44_VAULT_ROOT_KEY_ARCHIVE_FAIL_CLOSED\n');
  process.exitCode=1;
 }
}
