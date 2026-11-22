// M44: explicitly authorized real-snapshot rehearsal in a disposable managed project.
// Never runs against QA or PROD, never sends emails or invokes external app services.
// All recovered data is sealed from Data API and Auth BEFORE the first import.
// This is not certification of Edge secrets, Vault or full hosted failover.
import {createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,createWriteStream,openSync,closeSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {classifyM44RestoreFailure} from './m44_managed_pg_restore_failure.mjs';

const TARGET='zfvaouggafdbqfbpwhfx';
const QA='gjztkdwfmunnzhtvxrsu';
const PROD='pjhmrhejsoofmouedavw';
const REPO='iberfit/iberfit-m26-app';
const BACKUP_RUN=44944459633;
const BACKUP_ARTIFACT=14723146683;
const BACKUP_SHA='a68a5f1289bc974c0cc7ec62adfbced4325153d4271e5de278a4988bcfc913f1';
const BACKUP_SOURCE='1a36e1db0d0cffc640651f2a45fff80419cffc33';
const PREFIX='M44_MANAGED_REAL_';
const mgmt='https://api.supabase.com/v1/projects/';
let activeClone=false;
let qaPaused=false;
let clonedData=false;
let sealed=false;
let directory='';
// Diagnostic identifier ONLY: fixed public operation labels, never URL, SQL, tokens or response bodies.
let m44Phase='BOOTSTRAP';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fail(code){throw Error(PREFIX+code);}
function required(value,code){if(!value)fail(code);return value;}
function safe(cmd,args,options={}){
 const result=spawnSync(cmd,args,{encoding:'utf8',timeout:options.timeout||120000,
   maxBuffer:1024*1024,stdio:options.stdio||['ignore','pipe','pipe'],env:options.env||process.env});
 if(result.error||result.status!==0)fail(options.code||'EXECUTION_DENIED');
 return result;
}
async function request(url,{method='GET',body,token=process.env.SUPABASE_ACCESS_TOKEN,timeout=30000,headers={}}={}){
 const parsed=new URL(url);
 if(!['https://api.supabase.com','https://api.github.com'].includes(parsed.origin))fail('EGRESS_DENIED');
 if(parsed.origin==='https://api.supabase.com'&&
    parsed.pathname!=='/v1/projects'&&!parsed.pathname.startsWith('/v1/projects/'))
  fail('MANAGEMENT_PATH_DENIED');
 let response;
 try{
  response=await fetch(parsed,{method,redirect:'error',headers:{
   Authorization:'Bearer '+required(token,'MANAGEMENT_TOKEN_MISSING'),
   Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...headers
  },body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
 }catch{fail('MANAGEMENT_UNREACHABLE');}
 if(!response.ok){
  const allowed=/^[A-Z0-9_]{3,48}$/.test(m44Phase)?m44Phase:'UNCLASSIFIED';
  fail('MANAGEMENT_HTTP_'+response.status+'_PHASE_'+allowed);
 }
 // Management POST pause/restore and some PATCH operations return HTTP 204
 // with EMPTY bodies. Never mistake a successful state transition for a
 // failed request; inspect the authoritative project GET state afterwards.
 const content=await response.text().catch(()=>{throw Error(PREFIX+'MANAGEMENT_BODY_READ_FAILED')});
 if(!content.trim()){
  if(!['POST','PATCH'].includes(method))fail('MANAGEMENT_EMPTY_READONLY_RESPONSE');
  return Object.freeze({accepted:true,empty:true});
 }
 try{return JSON.parse(content);}
 catch{
  // Some successful Management control-plane mutations answer with plain
  // text instead of JSON. Only accept them when the next authoritative GET
  // must verify the requested state; never accept this on a GET.
  if(!['POST','PATCH'].includes(method))fail('MANAGEMENT_JSON_INVALID');
  return Object.freeze({accepted:true,opaque:true});
 }
}
const sup=(ref,path,options)=>request(mgmt+ref+path,options);
const git=(path,options)=>request('https://api.github.com/repos/'+REPO+path,{
 token:process.env.GITHUB_TOKEN,headers:{'X-GitHub-Api-Version':'2022-11-28'},...options
});
async function projects(){
 const list=await request('https://api.supabase.com/v1/projects',{});
 if(!Array.isArray(list))fail('PROJECT_LIST_INVALID');
 const map=new Map(list.map(p=>[p.ref,p]));
 if(map.get(PROD)?.status!=='ACTIVE_HEALTHY'||
    !map.has(QA)||!map.has(TARGET))fail('PROJECT_IDENTITIES_DRIFT');
 return map;
}
async function projectState(ref){return (await sup(ref,'')).status;}
async function waitState(ref,desired,limit=600000){
 const until=Date.now()+limit;
 while(Date.now()<until){
  if(await projectState(ref)===desired)return;
  await sleep(5000);
 }
 fail('PROJECT_STATE_TIMEOUT_'+(ref===QA?'QA':'CLONE'));
}
async function gateCanaryExactSha(){
 const sha=required(process.env.GITHUB_SHA,'CANARY_SHA_MISSING');
 const until=Date.now()+18*60*1000;
 while(Date.now()<until){
  const result=await git('/actions/workflows/canary-exact-deploy.yml/runs?branch=canary%2Frc74-4&per_page=12');
  const matching=result.workflow_runs?.find(r=>r.head_sha===sha&&r.status==='completed');
  if(matching){
   if(matching.conclusion!=='success')fail('CANARY_EXACT_NOT_GREEN');
   return;
  }
  await sleep(15000);
 }
 fail('CANARY_EXACT_NOT_COMPLETE');
}
async function verifyBackup(){
 const run=await git('/actions/runs/'+BACKUP_RUN);
 if(run.status!=='completed'||run.conclusion!=='success'||run.head_sha!==BACKUP_SOURCE||
    run.path!=='.github/workflows/m44-encrypted-disaster-recovery.yml')fail('ARCHIVE_RUN_INVALID');
 const comparison=await git('/compare/'+BACKUP_SOURCE+'...'+process.env.GITHUB_SHA);
 if(!['identical','ahead'].includes(comparison.status)||comparison.behind_by!==0)
   fail('BACKUP_SHA_NOT_ANCESTOR');
 const art=await git('/actions/artifacts/'+BACKUP_ARTIFACT);
 if(art.name!=='iberfit-prod-ciphertext-'+BACKUP_RUN||art.expired||
    art.digest!=='sha256:'+BACKUP_SHA||art.size_in_bytes!==35011221)
   fail('CIPHER_ARCHIVE_IDENTITY_DRIFT');
 console.log('M44_VERIFIED_CIPHER_ARCHIVE_ID_AND_SHA_ONLY');
}
async function isolate(){
 const snap=await projects();
 if(snap.get(QA).status!=='ACTIVE_HEALTHY'||snap.get(TARGET).status!=='INACTIVE')
   fail('FREE_PROJECT_SWAP_PRECONDITION');
 if([...snap.values()].filter(x=>x.status==='ACTIVE_HEALTHY').length!==2)
   fail('FREE_ACTIVE_PROJECT_LIMIT');
 qaPaused=true;await sup(QA,'/pause',{method:'POST'});
 await waitState(QA,'INACTIVE');
 activeClone=true;await sup(TARGET,'/restore',{method:'POST'});
 await waitState(TARGET,'ACTIVE_HEALTHY');
 const now=await projects();
 if(now.get(QA).status!=='INACTIVE'||now.get(TARGET).status!=='ACTIVE_HEALTHY')
  fail('SWAP_INCOMPLETE');
 console.log('M44_FREE_SWAP_ISOLATED_TARGET_ACTIVE_QA_PAUSED');
}
async function seal(){
 m44Phase='SEAL_PROJECT_IDENTITY';
 const identity=await sup(TARGET,'');
 if(identity.ref!==TARGET||identity.name!=='iberfit-m44-recovery-isolated-20261121')
   fail('ISOLATED_TARGET_IDENTITY_INVALID');
 m44Phase='SEAL_EMPTY_SQL_READ';
 const empty=await sup(TARGET,'/database/query',{method:'POST',body:{
  query:"SELECT (SELECT count(*) FROM auth.users) AS users, (SELECT count(*) FROM auth.identities) AS identities, (SELECT count(*) FROM auth.sessions) AS sessions, (SELECT count(*) FROM storage.objects) AS objects, (SELECT count(*) FROM storage.buckets) AS buckets, (SELECT count(*) FROM vault.secrets) AS vault_secrets, (SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','private')) AS tables, (SELECT count(*) FROM pg_views WHERE schemaname='public' AND viewname <> 'm44_recovery_exposure_probe') AS unexpected_views, (SELECT count(*) FROM pg_views WHERE schemaname='public' AND viewname='m44_recovery_exposure_probe') AS synthetic_views"
 }});
 const row=Array.isArray(empty)?empty[0]:empty?.result?.[0];
 if(!row||['users','identities','sessions','objects','buckets','vault_secrets','tables','unexpected_views'].some(k=>Number(row[k])!==0)||
    ![0,1].includes(Number(row.synthetic_views)))
   fail('ISOLATED_PROJECT_NOT_EMPTY');
 // A failed rehearsal may leave only the known synthetic exposure probe and
 // PostgREST pointing at the already-closed schema. Reset public API solely
 // when every real-data-bearing source above has been proved empty.
 m44Phase='SEAL_RESET_EMPTY_SANDBOX_POSTGREST';
 const apiBefore=await sup(TARGET,'/postgrest');
 if(!apiBefore||!['public','m44_recovery_closed'].includes(apiBefore.db_schema))
   fail('UNEXPECTED_PRE_RESTORE_DATA_API_CONFIGURATION');
 if(apiBefore.db_schema==='m44_recovery_closed'){
  await sup(TARGET,'/postgrest',{method:'PATCH',body:{db_schema:'public'}});
  const reopened=await sup(TARGET,'/postgrest');
  if(reopened?.db_schema!=='public')fail('EMPTY_SANDBOX_RESET_NOT_CONFIRMED');
 }
 m44Phase='SEAL_KEYS_READ';
 const keys=await sup(TARGET,'/api-keys?reveal=true');
 if(!Array.isArray(keys))fail('KEY_LIST_INVALID');
 const key=keys.find(k=>(k.name==='anon'||k.type==='publishable')&&!k.disabled)?.api_key;
 if(typeof key!=='string'||key.length<20)fail('SANDBOX_ANON_KEY_NOT_AVAILABLE');
 // A real, harmless anon-readable view provides a POSITIVE control before
 // sealing, so HTTP 404 from a missing application table cannot create a
 // false assurance that public PII will be inaccessible after import.
 const probeURL='https://'+TARGET+'.supabase.co/rest/v1/m44_recovery_exposure_probe?select=sentinel&limit=1';
 m44Phase='SEAL_CREATE_SYNTHETIC_PROBE_SQL';
 await sup(TARGET,'/database/query',{method:'POST',body:{
  query:"CREATE OR REPLACE VIEW public.m44_recovery_exposure_probe WITH (security_invoker=true) AS SELECT 'M44_ISOLATION_SENTINEL_ONLY'::text AS sentinel; GRANT SELECT ON public.m44_recovery_exposure_probe TO anon; NOTIFY pgrst, 'reload schema'"
 }});
 let positiveControl=false;
 for(let i=0;i<20;i++){
  const response=await fetch(probeURL,{headers:{apikey:key,'Accept-Profile':'public'},
   redirect:'error',signal:AbortSignal.timeout(12000)});
  if(response.ok){
   const data=await response.json().catch(()=>null);
   if(Array.isArray(data)&&data.length===1&&data[0]?.sentinel==='M44_ISOLATION_SENTINEL_ONLY'){
    positiveControl=true;break;
   }
   fail('PUBLIC_PROBE_UNEXPECTED_RESPONSE');
  }
  await sleep(1200);
 }
 if(!positiveControl)fail('PUBLIC_SCHEMA_POSITIVE_CONTROL_NOT_PROVEN');
 m44Phase='SEAL_CREATE_CLOSED_SCHEMAS_SQL';
 await sup(TARGET,'/database/query',{method:'POST',body:{
  query:"CREATE SCHEMA IF NOT EXISTS m44_recovery_closed; CREATE SCHEMA IF NOT EXISTS private; REVOKE ALL ON SCHEMA m44_recovery_closed FROM PUBLIC, anon, authenticated, service_role"
 }});
 m44Phase='SEAL_SWITCH_POSTGREST_SCHEMA';
 await sup(TARGET,'/postgrest',{method:'PATCH',body:{db_schema:'m44_recovery_closed'}});
 m44Phase='SEAL_VERIFY_POSTGREST_SCHEMA';
 const rest=await sup(TARGET,'/postgrest');
 if(rest.db_schema!=='m44_recovery_closed')fail('DATA_API_NOT_SEALED');
 let negativeControl=false;
 for(let i=0;i<20;i++){
  const response=await fetch(probeURL,{headers:{apikey:key,'Accept-Profile':'public'},
   redirect:'error',signal:AbortSignal.timeout(12000)});
  if(response.ok)fail('PUBLIC_DATA_API_NOT_DENIED');
  if([400,401,403,404,406].includes(response.status)){
   negativeControl=true;break;
  }
  await sleep(1200);
 }
 if(!negativeControl)fail('PUBLIC_API_NEGATIVE_CONTROL_UNVERIFIED');
 m44Phase='SEAL_DISABLE_AUTH_SIGNUPS';
 await sup(TARGET,'/config/auth',{method:'PATCH',body:{
  disable_signup:true,external_email_enabled:false,external_phone_enabled:false,
  external_anonymous_users_enabled:false
 }});
 m44Phase='SEAL_VERIFY_AUTH_DISABLED';
 const auth=await sup(TARGET,'/config/auth');
 if(auth.disable_signup!==true||auth.external_email_enabled!==false||
    auth.external_phone_enabled!==false||auth.external_anonymous_users_enabled!==false)
  fail('AUTH_EGRESS_NOT_DISABLED');
 sealed=true;
 m44Phase='SEAL_VERIFY_SCHEMA_GRANTS';
 const guard=await sup(TARGET,'/database/query',{method:'POST',body:{query:
  "SELECT has_schema_privilege('anon','m44_recovery_closed','USAGE') AS anon, has_schema_privilege('authenticated','m44_recovery_closed','USAGE') AS auth"}});
 const got=Array.isArray(guard)?guard[0]:guard?.result?.[0];
 if(got?.anon!==false||got?.auth!==false)fail('ISOLATION_SCHEMA_GRANTS_UNSAFE');
 console.log('M44_MANAGED_AUTH_EMAIL_PHONE_SIGNUP_AND_PUBLIC_DATA_API_SEALED');
}
async function databaseConnection(){
 m44Phase='DB_READ_POOLER_CONFIG';
 const pool=await sup(TARGET,'/config/database/pooler');
 if(!Array.isArray(pool))fail('POOLER_CONFIG_SHAPE');
 const entry=pool.find(p=>typeof(p.connection_string||p.connectionString)==='string'&&
  /@[a-z0-9.-]+\.pooler\.supabase\.com:(5432|6543)\//i.test(p.connection_string||p.connectionString));
 if(!entry)fail('POOLER_VERIFIED_HOST_UNAVAILABLE');
 const uri=entry.connection_string||entry.connectionString;
 const match=uri.match(/@([a-z0-9.-]+\.pooler\.supabase\.com):(5432|6543)\//i);
 if(!match)fail('POOLER_HOST_UNTRUSTED');
 const password=randomBytes(32).toString('hex');
 m44Phase='DB_ROTATE_SANDBOX_PASSWORD';
 await sup(TARGET,'/database/password',{method:'PATCH',body:{password}});
 const env={...process.env,PGHOST:match[1],PGPORT:'5432',PGUSER:'postgres.'+TARGET,
  PGPASSWORD:password,PGDATABASE:'postgres',PGSSLMODE:'require',PGCONNECT_TIMEOUT:'12'};
 const cmd=['run','--rm','--network','host'];
 for(const k of ['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','PGCONNECT_TIMEOUT'])
   cmd.push('-e',k);
 cmd.push('postgres:17-alpine');
 for(let i=0;i<6;i++){
  const t=spawnSync('docker',[...cmd,'psql','-X','-A','-t','-v','ON_ERROR_STOP=1',
   '-c',"SELECT (current_database()='postgres')::int"],{
    env,encoding:'utf8',timeout:22000,maxBuffer:2048});
  if(t.status===0&&t.stdout.trim()==='1')return {env,cmd};
  await sleep(4000);
 }
 fail('ISOLATED_POOLER_CREDENTIALS_UNUSABLE');
}
async function downloadArchive(){
 const archive=join(directory,'cipher.zip');
 const endpoint='https://api.github.com/repos/'+REPO+
  '/actions/artifacts/'+BACKUP_ARTIFACT+'/zip';
 const res=await fetch(endpoint,{headers:{
  Authorization:'Bearer '+required(process.env.GITHUB_TOKEN,'GITHUB_TOKEN_MISSING'),
  'X-GitHub-Api-Version':'2022-11-28'
 },redirect:'follow',signal:AbortSignal.timeout(180000)});
 if(!res.ok||!res.body)fail('CIPHER_DOWNLOAD_FAILED');
 const w=createWriteStream(archive,{mode:0o600,flags:'wx'});
 const hash=createHash('sha256');let count=0;
 try{
  for await(const chunk of res.body){
   count+=chunk.byteLength;
   if(count>35011221)fail('CIPHER_BYTES_OVERSIZED');
   hash.update(chunk);
   await new Promise((resolve,reject)=>w.write(chunk,e=>e?reject(e):resolve()));
  }
  await new Promise((resolve,reject)=>w.end(e=>e?reject(e):resolve()));
 }catch{w.destroy();fail('CIPHER_DOWNLOAD_INTERRUPTED');}
 if(count!==35011221||hash.digest('hex')!==BACKUP_SHA)fail('CIPHER_DIGEST_MISMATCH');
 const name=safe('unzip',['-Z1',archive],{code:'ZIP_INVENTORY_INVALID'}).stdout.trim();
 if(name!=='iberfit-prod-recovery.ibf')fail('ZIP_UNEXPECTED_CONTENT');
 const ciphertext=join(directory,'archive.ibf');
 const fd=openSync(ciphertext,'wx',0o600);
 try{
  const proc=spawnSync('unzip',['-p',archive,name],{
   stdio:['ignore',fd,'pipe'],timeout:120000,maxBuffer:1024*1024
  });
  if(proc.error||proc.status!==0)fail('ZIP_EXTRACTION_FAILED');
 }finally{closeSync(fd);}
 const tar=join(directory,'recovered.tar');
 safe('node',['scripts/ops/m44_encrypted_backup_archive.mjs','decrypt',ciphertext,tar],{
   code:'CIPHER_DECRYPT_FAILED',timeout:150000});
 safe('tar',['-tf',tar],{code:'RECOVERY_TAR_INVALID'});
 safe('tar',['-C',directory,'--no-same-owner','--no-same-permissions','-xf',tar],{
   code:'RECOVERY_TAR_EXTRACT_FAILED',timeout:120000});
 rmSync(tar,{force:true});rmSync(ciphertext,{force:true});rmSync(archive,{force:true});
 if(!readFileSync(join(directory,'database.pgcustom')).length)fail('PGCUSTOM_MISSING');
 console.log('M44_REAL_PG17_ARCHIVE_DECRYPTED_IN_PRIVATE_RUNNER_ONLY');
}
function generateSelectedToc(){
 const pg=join(directory,'database.pgcustom');
 const result=safe('docker',['run','--rm','-v',directory+':/work:ro','postgres:17-alpine',
  'pg_restore','--list','/work/database.pgcustom'],{code:'SOURCE_TOC_UNAVAILABLE'});
 const out=[];let app=0,authUsers=0,appData=0;
 for(const line of result.stdout.split('\n')){
  if(line.startsWith(';')||!line.trim()){out.push(line);continue;}
  const m=/^[0-9]+;\s+[0-9]+\s+[0-9]+\s+(.+)$/.exec(line);
  if(!m)fail('SOURCE_TOC_MALFORMED');
  const body=m[1];
  const isAuth=/^TABLE DATA auth (users|identities|mfa_factors) /.test(body);
  const isApp=/\s(public|private)\s/.test(' '+body+' ')&&
   !/^SCHEMA\s/.test(body)&&!/^ACL\s/.test(body)&&!/^DEFAULT ACL\s/.test(body)&&
   !/^COMMENT\s/.test(body)&&!/^EXTENSION\s/.test(body)&&
   !/^EVENT TRIGGER\s/.test(body);
  if(isAuth)authUsers+=Number(body.startsWith('TABLE DATA auth users '));
  if(isApp){app++;if(body.startsWith('TABLE DATA '))appData++;}
  out.push(isAuth||isApp?line:';'+line);
 }
 if(authUsers!==1||app<100||appData<15)fail('RESTORE_SOURCE_SCOPE_INVALID');
 const toc=join(directory,'restricted-restore.list');
 writeFileSync(toc,out.join('\n'),{encoding:'utf8',mode:0o600,flag:'wx'});
 console.log('M44_MANAGED_RECOVERY_TOC_SCOPE_VERIFIED:app_entries='+app+
  ':app_data_tables='+appData+':auth_user_data=1');
 return toc;
}
async function restoreData(conn){
 m44Phase='DB_MANAGED_SQL_RESTORE';
 const selected=generateSelectedToc();
 // The only SQL executor credentials point to TARGET; all management calls
 // are also fixed to TARGET. The archive contains user records: never log it.
 // Docker mounts only the private runner directory; DB TLS credentials are
 // injected as environment, never arguments or log text.
 const docker=['run','--rm','--network','host','-v',directory+':/work:ro'];
 for(const k of ['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','PGCONNECT_TIMEOUT'])
  docker.push('-e',k);
 docker.push('postgres:17-alpine','pg_restore','--dbname=postgres','--no-owner',
  '--no-acl','--no-comments','--single-transaction','--exit-on-error',
  '--use-list=/work/restricted-restore.list','/work/database.pgcustom');
 const res=spawnSync('docker',docker,{env:conn.env,encoding:'utf8',
   timeout:18*60*1000,maxBuffer:1024*1024});
 if(res.error||res.status!==0){
  const classification=classifyM44RestoreFailure(res.stderr,res);
  // SQL excerpts may contain PII. Publish ONLY bounded category and known SQLSTATE.
  console.error('M44_MANAGED_RESTORE_FAILURE_CLASS='+classification.code+
   ':sqlstate='+(classification.sqlstate||'UNAVAILABLE'));
  fail('MANAGED_SQL_RESTORE_FAILED_CLOSED');
 }
 clonedData=true;
 const rows=await sup(TARGET,'/database/query',{method:'POST',body:{query:
  "SELECT (SELECT count(*) FROM auth.users) users,(SELECT count(*) FROM public.iberfit_system_settings) settings,(SELECT count(*) FROM public.training_session_occurrences_v1) occurrences"}});
 const x=Array.isArray(rows)?rows[0]:rows?.result?.[0];
 if(!x||Number(x.users)<1||Number(x.settings)<1)fail('RESTORE_READBACK_INVALID');
 const postgrest=await sup(TARGET,'/postgrest');
 if(postgrest.db_schema!=='m44_recovery_closed')fail('POST_RESTORE_API_EXPOSURE');
 const postAuth=await sup(TARGET,'/config/auth');
 if(postAuth.disable_signup!==true||postAuth.external_email_enabled!==false||
   postAuth.external_phone_enabled!==false)fail('POST_RESTORE_AUTH_EXPOSURE');
 const apiKeys=await sup(TARGET,'/api-keys?reveal=true');
 const pub=Array.isArray(apiKeys)?apiKeys.find(k=>(k.name==='anon'||k.type==='publishable')&&!k.disabled)?.api_key:null;
 if(typeof pub!=='string'||pub.length<20)fail('POST_RESTORE_PUBLIC_KEY_UNAVAILABLE');
 const apiResponse=await fetch('https://'+TARGET+'.supabase.co/rest/v1/iberfit_system_settings?select=key&limit=1',{
  headers:{apikey:pub,'Accept-Profile':'public'},redirect:'error',signal:AbortSignal.timeout(12000)});
 if(apiResponse.ok||![400,401,403,404,406].includes(apiResponse.status))
  fail('POST_RESTORE_REAL_DATA_API_EXPOSURE');
 console.log('M44_MANAGED_REAL_APP_AUTH_SNAPSHOT_RESTORED:users_nonzero=1:settings_nonzero=1:occurrences='+Number(x.occurrences));
}
async function restorePrivateStorage(){
 m44Phase='STORAGE_PRIVATE_RESTORE';
 // Not a public-bucket promotion. Every restored object stays PRIVATE even
 // when its source bucket was deliberately public in the original project.
 const file=join(directory,'storage','manifest.json');
 let manifest;
 try{manifest=JSON.parse(readFileSync(file,'utf8'));}catch{fail('SOURCE_STORAGE_MANIFEST_UNAVAILABLE');}
 if(manifest?.schema!=='iberfit.storage.backup.v1'||manifest.project!==PROD||
    !Array.isArray(manifest.objects)||manifest.objects.length<1||
    manifest.objects.length>5000)fail('SOURCE_STORAGE_MANIFEST_INVALID');
 const keys=await sup(TARGET,'/api-keys');
 if(!Array.isArray(keys))fail('RESTORE_STORAGE_KEYS_INVALID');
 const serviceKey=keys.find(k=>k.name==='service_role'&&!k.disabled)?.api_key;
 if(typeof serviceKey!=='string'||serviceKey.length<32)fail('RESTORE_STORAGE_SERVICE_KEY_UNAVAILABLE');
 const storageURL='https://'+TARGET+'.supabase.co/storage/v1';
 const headers={apikey:serviceKey,Authorization:'Bearer '+serviceKey};
 const buckets=new Set(),seen=new Set();
 for(let i=0;i<manifest.objects.length;i++){
  const o=manifest.objects[i],relative='files/'+String(i).padStart(6,'0')+'.bin';
  if(!o||typeof o.bucket!=='string'||!o.bucket||
     typeof o.name!=='string'||!o.name||
     o.name.split('/').some(x=>!x||x==='.'||x==='..')||
     o.relative!==relative||!Number.isSafeInteger(o.bytes)||o.bytes<0||
     o.bytes>256*1024*1024||typeof o.sha256!=='string'||!/^[a-f0-9]{64}$/.test(o.sha256))
    fail('SOURCE_STORAGE_OBJECT_INVALID');
  const unique=JSON.stringify([o.bucket,o.name]);
  if(seen.has(unique))fail('SOURCE_STORAGE_OBJECT_DUPLICATE');
  seen.add(unique);buckets.add(o.bucket);
 }
 for(const bucket of [...buckets].sort()){
  const r=await fetch(storageURL+'/bucket',{
   method:'POST',headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify({id:bucket,name:bucket,public:false}),
   redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok)fail('CLONE_PRIVATE_BUCKET_CREATE_DENIED_'+r.status);
 }
 let uploaded=0,bytes=0;
 for(let i=0;i<manifest.objects.length;i++){
  const o=manifest.objects[i],buffer=readFileSync(join(directory,'storage',o.relative));
  if(buffer.length!==o.bytes||createHash('sha256').update(buffer).digest('hex')!==o.sha256)
   fail('SOURCE_STORAGE_BYTES_TAMPERED');
  const resource=[o.bucket,...o.name.split('/')].map(encodeURIComponent).join('/');
  const put=await fetch(storageURL+'/object/'+resource,{
   method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','x-upsert':'false'},
   body:buffer,redirect:'error',signal:AbortSignal.timeout(120000)});
  if(!put.ok)fail('CLONE_STORAGE_UPLOAD_FAILED_'+put.status);
  const get=await fetch(storageURL+'/object/authenticated/'+resource,{
   headers,redirect:'error',signal:AbortSignal.timeout(120000)});
  if(!get.ok||!get.body)fail('CLONE_STORAGE_DOWNLOAD_FAILED_'+get.status);
  const digest=createHash('sha256');let size=0;
  for await(const part of get.body){
   size+=part.byteLength;
   if(size>o.bytes)fail('CLONE_STORAGE_OVERSIZED');
   digest.update(part);
  }
  if(size!==o.bytes||digest.digest('hex')!==o.sha256)
   fail('CLONE_STORAGE_HASH_MISMATCH');
  bytes+=size;uploaded++;
 }
 const control=await sup(TARGET,'/database/query',{method:'POST',body:{query:
  "SELECT (SELECT count(*) FROM storage.objects) AS objects, (SELECT count(*) FROM storage.buckets WHERE public=true) AS public_buckets"}});
 const row=Array.isArray(control)?control[0]:control?.result?.[0];
 if(!row||Number(row.objects)!==uploaded||Number(row.public_buckets)!==0)
   fail('CLONE_PRIVATE_STORAGE_FINAL_READBACK_DRIFT');
 console.log('M44_MANAGED_STORAGE_PRIVATE_RESTORED:objects='+uploaded+':bytes='+bytes+':public_buckets=0:sha256_verified=true');
}

async function cleanup(){
 // Pausing the sandbox seals its APIs and compute; any imported data remains
 // encrypted at rest and intentionally contained for later DR inspection.
 try{
  if(activeClone){
   await sup(TARGET,'/pause',{method:'POST'});
   await waitState(TARGET,'INACTIVE',600000);
   console.log('M44_MANAGED_SANDBOX_PAUSED');
  }
 }catch{console.error('M44_MANAGED_SANDBOX_PAUSE_FAILED');process.exitCode=1;}
 try{
  if(qaPaused){
   await sup(QA,'/restore',{method:'POST'});
   await waitState(QA,'ACTIVE_HEALTHY',600000);
   console.log('M44_MANAGED_QA_ACTIVE_RESTORED');
  }
 }catch{console.error('M44_MANAGED_QA_RESTORE_FAILED');process.exitCode=1;}
 if(directory)rmSync(directory,{force:true,recursive:true,maxRetries:2});
}
async function main(){
 if(process.env.GITHUB_ACTIONS!=='true'||
    process.env.GITHUB_REPOSITORY!==REPO||
    process.env.GITHUB_REF!=='refs/heads/canary/rc74-4'||
    process.env.M44_USER_AUTHORIZATION!=='REAL_DATA_CLONE_ONLY_20261121'||
    process.env.GITHUB_EVENT_NAME!=='push'||
    !['1','2','3'].includes(process.env.GITHUB_RUN_ATTEMPT||'')||
    !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA||'')||
    !process.env.SUPABASE_ACCESS_TOKEN||
    !process.env.GITHUB_TOKEN||
    String(process.env.IBERFIT_BACKUP_PASSPHRASE||'').length<32)
  fail('PROTECTED_ONE_TIME_CONTEXT_REQUIRED');
 directory=mkdtempSync(join(tmpdir(),'iberfit-m44-managed-'));
 chmodSync(directory,0o700);
 try{
  await verifyBackup();
  await gateCanaryExactSha();
  await isolate();
  await seal();
  const conn=await databaseConnection();
  await downloadArchive();
  await restoreData(conn);
  await restorePrivateStorage();
  if(!sealed||!clonedData)fail('RESTORE_NOT_ISOLATED');
  console.log('M44_MANAGED_REAL_SNAPSHOT_SQL_READBACK_SUCCESS:hosted_full_platform_NOT_certified');
 }finally{
  await cleanup();
 }
}
main().catch(error=>{
 const message=String(error?.message||'');
 console.error(message.startsWith(PREFIX)?message:PREFIX+'REHEARSAL_FAILED');
 process.exitCode=1;
});