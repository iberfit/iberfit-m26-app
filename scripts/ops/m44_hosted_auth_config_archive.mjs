// M44: capture the hosted Supabase Auth management configuration as
// encrypted-only disaster-recovery input. This snapshot may contain private
// credentials. NEVER print, log, hash into public evidence, or publish it
// except inside the authenticated encrypted M44 archive. Read-only API.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const PROD_REF='pjhmrhejsoofmouedavw';
export const SCHEMA='iberfit.m44.hosted-auth-config-archive.v1';
const URL=`https://api.supabase.com/v1/projects/${PROD_REF}/config/auth`;
const PREFIX='M44_HOSTED_AUTH_CONFIG_';
const MAX_BYTES=2*1024*1024;
const fail=code=>{throw Error(PREFIX+code);};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);

export function validateAuthConfigRecord(snapshot){
 if(!object(snapshot)||Object.keys(snapshot).length!==3||
  !own(snapshot,'schema')||!own(snapshot,'project_ref')||!own(snapshot,'config')||
  snapshot.schema!==SCHEMA||snapshot.project_ref!==PROD_REF||
  !object(snapshot.config))fail('RECORD_INVALID');
 const conf=snapshot.config;
 // Fail closed on a malformed or unexpectedly insecure PROD snapshot.
 if(Object.keys(conf).length<8||
  conf.site_url!=='https://app.iberfit.cl/'||
  conf.disable_signup!==true||
  conf.external_anonymous_users_enabled===true||
  conf.mailer_autoconfirm===true||
  conf.mailer_allow_unverified_email_sign_ins===true||
  conf.mailer_secure_email_change_enabled!==true||
  Number(conf.password_min_length)<8||
  !Number.isFinite(Number(conf.password_min_length))||
  typeof conf.smtp_host!=='string'||!conf.smtp_host.trim()||
  typeof conf.smtp_admin_email!=='string'||!conf.smtp_admin_email.trim()||
  typeof conf.smtp_user!=='string'||!conf.smtp_user.trim()||
  typeof conf.smtp_sender_name!=='string'||!conf.smtp_sender_name.trim()||
  !Number.isInteger(Number(conf.smtp_port))||
  Number(conf.smtp_port)<1||Number(conf.smtp_port)>65535)
  fail('PRODUCTION_AUTH_BASELINE_DRIFT');
 if(Buffer.byteLength(JSON.stringify(snapshot),'utf8')>MAX_BYTES)
  fail('RECORD_OVERSIZED');
 // A captured config is never proof that redacted provider credentials,
 // JWT signing keys, custom SMTP delivery, or hosted sessions are restored.
 return Object.freeze({configArchived:true,remoteCredentialsRecoverable:false,
  hostedAuthRestored:false,hostedAuthRecoveryVerified:false,
  platformRecoveryVerified:false});
}

export async function captureHostedAuthConfig({
 token,outputPath,projectRef=PROD_REF,fetchImpl=fetch
}={}){
 if(projectRef!==PROD_REF)fail('TARGET_DENIED');
 if(typeof token!=='string'||token.length<20)fail('TOKEN_REQUIRED');
 if(typeof outputPath!=='string'||!path.isAbsolute(outputPath))fail('PATH_INVALID');
 if(typeof fetchImpl!=='function')fail('FETCH_INVALID');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 let record;
 try{
  const response=await fetchImpl(URL,{
   method:'GET',redirect:'error',signal:controller.signal,
   headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}
  });
  if(response?.status!==200||
    !String(response?.headers?.get?.('content-type')||'').toLowerCase().includes('application/json'))
   fail('READ_DENIED');
  const body=await response.text();
  if(typeof body!=='string'||Buffer.byteLength(body,'utf8')>MAX_BYTES)
   fail('PAYLOAD_INVALID');
  record={schema:SCHEMA,project_ref:PROD_REF,config:JSON.parse(body)};
  validateAuthConfigRecord(record);
 }catch{
  // API errors may contain secret response bodies; never expose them.
  fail('MANAGEMENT_READ_FAILED');
 }finally{clearTimeout(timer);}
 try{
  const file=await fs.open(outputPath,'wx',0o600);
  try{await file.writeFile(JSON.stringify(record)+'\n','utf8');}
  finally{await file.close();}
 }catch{fail('PRIVATE_WRITE_FAILED');}
 return Object.freeze({privateSnapshotStaged:true,
  hostedAuthRecoveryVerified:false,platformRecoveryVerified:false});
}

export async function verifyRestoredHostedAuthConfig(file){
 if(typeof file!=='string'||!path.isAbsolute(file))fail('PATH_INVALID');
 let record;
 try{
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<200||
    stat.size>MAX_BYTES||(stat.mode&0o077)!==0)
   fail('FILE_UNSAFE');
  record=JSON.parse(await fs.readFile(file,'utf8'));
 }catch{fail('RESTORE_INPUT_INVALID');}
 return validateAuthConfigRecord(record);
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{
  const [mode,filename]=process.argv.slice(2);
  if(!['capture','verify'].includes(mode)||!filename||process.argv.length!==4)
   fail('USAGE_INVALID');
  if(mode==='capture'){
   await captureHostedAuthConfig({
    token:process.env.SUPABASE_ACCESS_TOKEN,outputPath:path.resolve(filename)
   });
   process.stdout.write('IBERFIT_M44_HOSTED_AUTH_CONFIG_STAGED_FOR_ENCRYPTION\n');
  }else{
   await verifyRestoredHostedAuthConfig(path.resolve(filename));
   process.stdout.write('IBERFIT_M44_HOSTED_AUTH_CONFIG_CIPHERTEXT_ROUNDTRIP_OK:restore_NOT_verified\n');
  }
 }catch{
  process.stderr.write('IBERFIT_M44_HOSTED_AUTH_CONFIG_CAPTURE_FAIL_CLOSED\n');
  process.exitCode=1;
 }
}
