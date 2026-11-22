// M44: one-time app-only ACL restoration on the ALREADY-restored sealed managed
// sandbox. No PROD writes, no application data replay, no public API opening.
import {createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,createWriteStream,openSync,closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {selectPrivilegeToc} from './m44_acl_toc_selector.mjs';
import {classifyM44RestoreFailure} from './m44_managed_pg_restore_failure.mjs';
const PROD='pjhmrhejsoofmouedavw',QA='gjztkdwfmunnzhtvxrsu',TARGET='zfvaouggafdbqfbpwhfx';
const REPO='iberfit/iberfit-m26-app', VERIFIED_RUN=44976946195;
const VERIFIED_SHA='79687a28c1e7da3630b14f76fc1d6494c03adfdd';
const BACKUP_ARTIFACT=14723146683, BACKUP_RUN=44944459633;
const BACKUP_SHA='a68a5f1289bc974c0cc7ec62adfbced4325153d4271e5de278a4988bcfc913f1';
const PREFIX='M44_MANAGED_ACL_';
let qaPaused=false,cloneActivated=false,work='';
let m44Phase='BOOTSTRAP';
const fail=c=>{throw Error(PREFIX+c);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fetchJson=async (url,{method='GET',body,token=process.env.SUPABASE_ACCESS_TOKEN}={})=>{
 const u=new URL(url);
 if(u.origin!=='https://api.supabase.com'&&u.origin!=='https://api.github.com')fail('NETWORK_ORIGIN_DENIED');
 if(u.origin==='https://api.supabase.com'&&!u.pathname.startsWith('/v1/projects'))fail('MANAGEMENT_ROUTE_DENIED');
 const r=await fetch(u,{method,redirect:'error',headers:{Authorization:'Bearer '+token,
  Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 if(!r.ok)fail('MANAGEMENT_HTTP_'+r.status+'_PHASE_'+m44Phase);
 const s=await r.text();
 if(!s.trim()&&method!=='GET')return {accepted:true};
 try{return JSON.parse(s);}catch{fail('RESPONSE_SHAPE');}
};
const mg=(project,path='',opts)=>fetchJson('https://api.supabase.com/v1/projects/'+project+path,opts);
const gh=path=>fetchJson('https://api.github.com/repos/'+REPO+path,{token:process.env.GITHUB_TOKEN});
async function state(ref){return (await mg(ref)).status;}
async function until(ref,want){
 for(let i=0;i<90;i++){if(await state(ref)===want)return;await sleep(6000);}
 fail('PROJECT_STATE_TIMEOUT');
}
export function selectAppOnlyPrivilegeToc(input){
 const verified=selectPrivilegeToc(input);
 let grants=0,defaults=0,active=0;
 const output=verified.output.split('\n').map(line=>{
  if(!/^\d+;/.test(line))return line;
  const m=/^\d+;\s+\d+\s+\d+\s+(ACL|DEFAULT ACL)\s+(public|private)\s/.exec(line);
  if(!m)return ';'+line;
  // PostgreSQL cannot ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  // when connected as the managed project's postgres role. Those managed
  // defaults must already exist and are independently compared by digest.
  // Never SET ROLE, change membership, or ask for elevated grants.
  if(m[1]==='DEFAULT ACL'&&!/\s+postgres\s*$/.test(line))return ';'+line;
  if(m[1]==='ACL'&&!/\s+postgres\s*$/.test(line))
   fail('APP_OBJECT_OWNER_NOT_POSTGRES');
  active++;
  if(m[1]==='ACL')grants++;else defaults++;
  return line;
 }).join('\n');
 if(active<100||grants<100||defaults<1||grants>verified.grants||defaults>verified.defaults)
  fail('APP_PRIVILEGE_TOC_INVALID');
 return Object.freeze({output,grants,defaults,appOnly:true,platformCertified:false});
}
export function certifyManagedAppAclCensus(source,after){
 for(const x of [source,after]){
  if(!x||typeof x!=='object'||Object.values(x).some(v=>!Number.isSafeInteger(v)||v<0))
   fail('CENSUS_INVALID');
 }
 const stable=['rls','policies','app_tables','users','storage','invalid_indexes'];
 for(const k of stable)if(source[k]!==after[k])fail('SECURITY_OR_DATA_DRIFT');
 const acls=['relation_acl','function_acl','default_acl'];
 for(const k of acls)if(after[k]!==source[k])fail('ACL_PARITY_DRIFT_'+k.toUpperCase());
 if(source.rls<100||source.policies<100||source.app_tables<100||
  source.relation_acl<100||source.function_acl<100||source.default_acl<1||
  source.users<1||source.storage<1||source.invalid_indexes!==0)
  fail('BASELINE_UNEXPECTED');
 return Object.freeze({aclRestored:true,rlsStable:true,postgrestSealed:true,
  prodWrites:0,fullPlatformCertified:false});
}
const censusSql=`SELECT jsonb_build_object(
 'app_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p')),
 'rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p') AND c.relrowsecurity),
 'policies',(SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','private')),
 'relation_acl',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relacl IS NOT NULL AND NOT (n.nspname='public' AND c.relname='m44_recovery_exposure_probe')),
 'function_acl',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proacl IS NOT NULL),
 'default_acl',(SELECT count(*) FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IN ('public','private')),
 'invalid_indexes',(SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND (NOT i.indisvalid OR NOT i.indisready)),
 'users',(SELECT count(*) FROM auth.users),
 'storage',(SELECT count(*) FROM storage.objects)) AS census`;
async function readCensus(project){
 const data=await mg(project,'/database/query',{method:'POST',body:{query:censusSql}});
 const rows=Array.isArray(data)?data:data?.result;
 if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.census)fail('CENSUS_RESPONSE_INVALID');
 return rows[0].census;
}
// Before replay check only Supabase-managed default privileges and unchanged RLS policies; schema/object ACLs can be absent precisely because this is a --no-acl restore.
// Metadata-only digests. Never return grants, policy bodies or object names.
// Exclude the one synthetic exposure probe intentionally created on the clone.
const aclDigestSql=`WITH material AS (
 SELECT
 (SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(
  jsonb_build_array(n.nspname,n.nspacl::text) ORDER BY n.nspname),'[]'::jsonb)::text,'UTF8')),'hex')
  FROM pg_namespace n WHERE n.nspname IN ('public','private')) AS schema_acl,
 (SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(
  jsonb_build_array(n.nspname,c.relname,c.relkind,c.relacl::text)
  ORDER BY n.nspname,c.relname),'[]'::jsonb)::text,'UTF8')),'hex')
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m','S','f')
  AND NOT (n.nspname='public' AND c.relname='m44_recovery_exposure_probe')) AS relation_acl,
 (SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(
  jsonb_build_array(n.nspname,p.oid::regprocedure::text,p.proacl::text)
  ORDER BY n.nspname,p.oid::regprocedure::text),'[]'::jsonb)::text,'UTF8')),'hex')
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private')) AS function_acl,
 (SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(
  jsonb_build_array(n.nspname,c.relname,a.attname,a.attacl::text)
  ORDER BY n.nspname,c.relname,a.attname),'[]'::jsonb)::text,'UTF8')),'hex')
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private') AND a.attnum>0 AND NOT a.attisdropped
   AND c.relkind IN ('r','p','v','m','f')
   AND NOT (n.nspname='public' AND c.relname='m44_recovery_exposure_probe')) AS column_acl,
 (SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(
  jsonb_build_array(n.nspname,d.defaclobjtype::text,d.defaclacl::text)
  ORDER BY n.nspname,d.defaclobjtype::text),'[]'::jsonb)::text,'UTF8')),'hex')
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
  WHERE n.nspname IN ('public','private')
  AND pg_get_userbyid(d.defaclrole)='supabase_admin') AS managed_defaults,
 (SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(
  jsonb_build_array(n.nspname,d.defaclobjtype::text,d.defaclacl::text)
  ORDER BY n.nspname,d.defaclobjtype::text),'[]'::jsonb)::text,'UTF8')),'hex')
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
  WHERE n.nspname IN ('public','private')
  AND pg_get_userbyid(d.defaclrole)='postgres') AS postgres_defaults,
 (SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(
  jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check)
  ORDER BY schemaname,tablename,policyname),'[]'::jsonb)::text,'UTF8')),'hex')
  FROM pg_policies WHERE schemaname IN ('public','private')) AS policy_digest
)
SELECT row_to_json(material) AS acl_digests FROM material`;
const REQUIRED_DIGESTS=Object.freeze(['schema_acl','relation_acl','function_acl',
 'column_acl','managed_defaults','postgres_defaults','policy_digest']);
export function certifyM44AppAclDigests(source,after,{phase='after'}={}){
 for(const x of [source,after]){
  if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.keys(x).length!==REQUIRED_DIGESTS.length||
    REQUIRED_DIGESTS.some(k=>typeof x[k]!=='string'||!/^[0-9a-f]{64}$/.test(x[k])))
   fail('ACL_DIGEST_FORMAT_INVALID');
 }
 const keys=phase==='before'?['managed_defaults','policy_digest']:
  REQUIRED_DIGESTS;
 if(!['before','after'].includes(phase))fail('ACL_DIGEST_PHASE_INVALID');
 const drift=keys.filter(k=>source[k]!==after[k]);
 if(drift.length)fail((phase==='before'?'MANAGED_BASELINE_DIGEST_DRIFT_':'ACL_DIGEST_PARITY_DRIFT_')+drift[0].toUpperCase());
 return Object.freeze({matched:keys.length,platformRecoveryCertified:false});
}
async function readAclDigests(project){
 const response=await mg(project,'/database/query',{method:'POST',body:{query:aclDigestSql}});
 const rows=Array.isArray(response)?response:response?.result;
 if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.acl_digests)
  fail('ACL_DIGEST_READBACK_INVALID');
 return rows[0].acl_digests;
}
async function assertSealed(){
 const p=await mg(TARGET,'/postgrest');
 if(p.db_schema!=='m44_recovery_closed')fail('POSTGREST_NOT_CLOSED');
 const a=await mg(TARGET,'/config/auth');
 if(a.disable_signup!==true||a.external_email_enabled!==false||
  a.external_phone_enabled!==false||a.external_anonymous_users_enabled!==false)
  fail('HOSTED_AUTH_NOT_SEALED');
}
async function assertDenied(){
 const apiKeys=await mg(TARGET,'/api-keys?reveal=true');
 const anon=Array.isArray(apiKeys)?apiKeys.find(x=>
  (x.name==='anon'||x.type==='publishable')&&!x.disabled)?.api_key:null;
 if(typeof anon!=='string'||anon.length<20)fail('ANON_CONTROL_MISSING');
 let consecutive=0;
 for(let i=0;i<12;i++){
  const r=await fetch('https://'+TARGET+'.supabase.co/rest/v1/iberfit_system_settings?select=key&limit=1',{
   headers:{apikey:anon,'Accept-Profile':'public','Cache-Control':'no-store'},
   redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if([400,401,403,404,406].includes(r.status))consecutive++;else consecutive=0;
  if(consecutive>=8)return;
  await sleep(900);
 }
 fail('PUBLIC_DATA_API_EXPOSURE_OR_UNVERIFIED');
}
function execPrivate(cmd,args,{env=process.env,timeout=180000,outputLimit=1024*1024}={}){
 const x=spawnSync(cmd,args,{env,encoding:'utf8',timeout,maxBuffer:outputLimit,
  stdio:['ignore','pipe','pipe']});
 if(x.error||x.status!==0)fail('PRIVATE_SUBPROCESS_FAILED');
 return x.stdout;
}
async function archive(){
 const run=await gh('/actions/runs/'+BACKUP_RUN),artifact=await gh('/actions/artifacts/'+BACKUP_ARTIFACT);
 if(run.conclusion!=='success'||artifact.expired||artifact.digest!=='sha256:'+BACKUP_SHA||
  artifact.size_in_bytes!==35011221)fail('BACKUP_PROVENANCE_DRIFT');
 const url='https://api.github.com/repos/'+REPO+'/actions/artifacts/'+BACKUP_ARTIFACT+'/zip';
 const r=await fetch(url,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,
  'X-GitHub-Api-Version':'2022-11-28'},redirect:'follow',
  signal:AbortSignal.timeout(180000)});
 if(!r.ok||!r.body)fail('BACKUP_DOWNLOAD_DENIED');
 const zip=join(work,'encrypted.zip'),writer=createWriteStream(zip,{flags:'wx',mode:0o600});
 const hash=createHash('sha256');let bytes=0;
 try{
  for await(const part of r.body){bytes+=part.byteLength;
   if(bytes>35011221)fail('BACKUP_SIZE_EXCEEDED');hash.update(part);
   await new Promise((ok,no)=>writer.write(part,e=>e?no(e):ok()));
  }
  await new Promise((ok,no)=>writer.end(e=>e?no(e):ok()));
 }catch{writer.destroy();fail('DOWNLOAD_INTERRUPTED');}
 if(bytes!==35011221||hash.digest('hex')!==BACKUP_SHA)fail('BACKUP_DIGEST_DRIFT');
 const names=execPrivate('unzip',['-Z1',zip]).trim();
 if(names!=='iberfit-prod-recovery.ibf')fail('BACKUP_ZIP_CONTENT_UNEXPECTED');
 const enc=join(work,'archive.ibf'),fd=openSync(enc,'wx',0o600);
 try{
  const proc=spawnSync('unzip',['-p',zip,names],{stdio:['ignore',fd,'pipe'],timeout:120000,maxBuffer:512*1024});
  if(proc.error||proc.status!==0)fail('BACKUP_UNZIP_FAILED');
 }finally{closeSync(fd);}
 const tar=join(work,'backup.tar');
 execPrivate('node',['scripts/ops/m44_encrypted_backup_archive.mjs','decrypt',enc,tar]);
 execPrivate('tar',['-C',work,'--no-same-owner','--no-same-permissions','-xf',tar]);
 for(const f of [enc,tar,zip])rmSync(f,{force:true});
 return join(work,'database.pgcustom');
}
async function connection(){
 const entries=await mg(TARGET,'/config/database/pooler');
 const item=Array.isArray(entries)?entries.find(x=>
  /@[a-z0-9.-]+\.pooler\.supabase\.com:(5432|6543)\//i.test(x.connection_string||x.connectionString||'')):null;
 if(!item)fail('TARGET_POOLER_NOT_AVAILABLE');
 const uri=item.connection_string||item.connectionString;
 const match=uri.match(/@([a-z0-9.-]+\.pooler\.supabase\.com):(5432|6543)\//i);
 if(!match)fail('POOLER_UNVERIFIED');
 const pw=randomBytes(32).toString('hex');
 await mg(TARGET,'/database/password',{method:'PATCH',body:{password:pw}});
 const env={...process.env,PGHOST:match[1],PGPORT:'5432',PGUSER:'postgres.'+TARGET,
  PGDATABASE:'postgres',PGSSLMODE:'require',PGCONNECT_TIMEOUT:'12',PGPASSWORD:pw};
 const docker=['run','--rm','--network','host','-v',work+':/work:ro'];
 for(const v of ['PGHOST','PGPORT','PGUSER','PGDATABASE','PGSSLMODE','PGCONNECT_TIMEOUT','PGPASSWORD'])docker.push('-e',v);
 docker.push('postgres:17-alpine');
 for(let i=0;i<7;i++){
  const r=spawnSync('docker',[...docker,'psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',
   "SELECT (current_database()='postgres')::int"],{env,encoding:'utf8',timeout:22000,maxBuffer:512});
  if(r.status===0&&r.stdout.trim()==='1')return {env,docker};
  await sleep(3500);
 }
 fail('TARGET_POSTGRES_CONNECTION_UNAVAILABLE');
}
async function replayACL(){
 const file=await archive();
 const list=execPrivate('docker',['run','--rm','-v',work+':/work:ro','postgres:17-alpine',
   'pg_restore','--list','/work/database.pgcustom']);
 const plan=selectAppOnlyPrivilegeToc(list);
 writeFileSync(join(work,'managed-app-acl.list'),plan.output,{mode:0o600,flag:'wx'});
 const conn=await connection();
 const res=spawnSync('docker',[...conn.docker,'pg_restore','--dbname=postgres',
  '--no-owner','--single-transaction','--exit-on-error',
  '--use-list=/work/managed-app-acl.list','/work/database.pgcustom'],{
   env:conn.env,encoding:'utf8',timeout:12*60*1000,maxBuffer:1024*1024});
 if(res.error||res.status!==0){
  const c=classifyM44RestoreFailure(res.stderr,res);
  console.error(PREFIX+'PG_RESTORE_CLASS='+c.code+':kind='+c.statementKind);
  fail('ACL_REPLAY_FAILED_CLOSED');
 }
 console.log('M44_MANAGED_APP_ACL_REPLAY_COMPLETED:grant_entries='+plan.grants+
   ':default_entries='+plan.defaults+':data_reimported=0');
}
async function checkRun(){
 const r=await gh('/actions/runs/'+VERIFIED_RUN);
 if(r.status!=='completed'||r.conclusion!=='success'||r.head_sha!==VERIFIED_SHA||
  r.path!=='.github/workflows/m44-managed-real-recovery.yml')fail('PREVIOUS_RESTORE_NOT_CERTIFIED');
 const cmp=await gh('/compare/'+VERIFIED_SHA+'...'+process.env.GITHUB_SHA);
 if(!['ahead','identical'].includes(cmp.status)||cmp.behind_by!==0)fail('SOURCE_SHA_NOT_DESCENDANT');
 const runSha=await gh('/git/ref/heads/canary/rc74-4');
 if(runSha?.object?.sha!==process.env.GITHUB_SHA)fail('SOURCE_SHA_SUPERSEDED');
}
async function main(){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!==REPO||
  process.env.GITHUB_REF!=='refs/heads/canary/rc74-4'||
  process.env.GITHUB_EVENT_NAME!=='push'||process.env.GITHUB_RUN_ATTEMPT!=='1'||
  process.env.M44_USER_AUTHORIZATION!=='APP_ACL_SANDBOX_ONLY_20261122'||
  !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||'')||
  !process.env.GITHUB_TOKEN||!process.env.SUPABASE_ACCESS_TOKEN||
  String(process.env.IBERFIT_BACKUP_PASSPHRASE||'').length<32)fail('PROTECTED_CONTEXT_REQUIRED');
 work=mkdtempSync(join(tmpdir(),'m44-app-acl-managed-'));
 try{
  m44Phase='VERIFY_PREVIOUS_RESTORE';
  await checkRun();
  m44Phase='PROJECTS_PREFLIGHT';
  const list=await fetchJson('https://api.supabase.com/v1/projects');
  const projects=Array.isArray(list)?list:[];
  const get=ref=>projects.find(p=>p.ref===ref);
  if(get(PROD)?.status!=='ACTIVE_HEALTHY'||get(QA)?.status!=='ACTIVE_HEALTHY'||
   get(TARGET)?.status!=='INACTIVE'||get(TARGET)?.name!=='iberfit-m44-recovery-isolated-20261121'||
   projects.filter(p=>p.status==='ACTIVE_HEALTHY').length!==2)
    fail('FREE_SLOTS_OR_PROJECT_IDENTITY_DRIFT');
  // Management /postgrest and /config/auth can return HTTP 404 while paused.
  // Never interpret 404 as a sealed API. The previous exact-run seal proof
  // is mandatory; re-attest Auth and PostgREST immediately AFTER resume,
  // BEFORE any read from the sensitive clone or application ACL replay.
  m44Phase='PROD_CENSUS_READONLY';
  const source=await readCensus(PROD); // SELECT-only catalog/counts. No PROD mutations.
  const sourceAclDigests=await readAclDigests(PROD);
  m44Phase='PAUSE_QA_SAFE_SWAP';
  qaPaused=true;await mg(QA,'/pause',{method:'POST'});await until(QA,'INACTIVE');
  m44Phase='RESUME_EXISTING_SEALED_SANDBOX';
  cloneActivated=true;await mg(TARGET,'/restore',{method:'POST'});await until(TARGET,'ACTIVE_HEALTHY');
  m44Phase='CLONE_AUTH_AND_API_SEAL';
  await assertSealed();await assertDenied();
  m44Phase='CLONE_READONLY_CENSUS';
  const before=await readCensus(TARGET);
  for(const k of ['rls','policies','app_tables','users','storage','invalid_indexes'])
   if(before[k]!==source[k])fail('PRE_REPLAY_SCHEMA_OR_DATA_DRIFT');
  m44Phase='MANAGED_DEFAULT_PRIVILEGES_PROVENANCE';
  const beforeAclDigests=await readAclDigests(TARGET);
  certifyM44AppAclDigests(sourceAclDigests,beforeAclDigests,{phase:'before'});
  // Prior managed drill #44982480166 atomically applied 390 app ACLs and
  // three postgres default privilege entries. Subsequent REVOKE attempts
  // against the *same* sandbox failed. Never replay against an already
  // modified managed clone: independently attest the persisted ACLs first.
  // This intentionally performs zero SQL writes, including no password resets.
  m44Phase='PREVIOUS_ACL_REPLAY_READONLY_VERIFICATION';
  certifyManagedAppAclCensus(source,before);
  certifyM44AppAclDigests(sourceAclDigests,beforeAclDigests,{phase:'after'});
  m44Phase='REPEAT_SEAL_AND_DENIAL_READONLY';
  await assertSealed();await assertDenied();
  m44Phase='FINAL_READONLY_CENSUS';
  const after=await readCensus(TARGET);
  certifyManagedAppAclCensus(source,after);
  m44Phase='FINAL_ACL_DIGEST_READBACK';
  const afterAclDigests=await readAclDigests(TARGET);
  certifyM44AppAclDigests(sourceAclDigests,afterAclDigests,{phase:'after'});
  console.log('M44_MANAGED_EXISTING_APP_ACL_VERIFIED_READONLY:categories=7:no_replay=1:prod_writes=0');
  console.log('M44_MANAGED_APP_ACL_PARITY_VERIFIED:rls_policies_stable=1:auth_storage_preserved=1:prod_writes=0:full_platform_NOT_certified');
 }finally{
  try{if(cloneActivated){await mg(TARGET,'/pause',{method:'POST'});await until(TARGET,'INACTIVE');console.log('M44_ACL_CLONE_PAUSED');}}
  catch{console.error('M44_ACL_CLONE_CLEANUP_FAILED');process.exitCode=1;}
  try{if(qaPaused){await mg(QA,'/restore',{method:'POST'});await until(QA,'ACTIVE_HEALTHY');console.log('M44_ACL_QA_RESTORED');}}
  catch{console.error('M44_ACL_QA_CLEANUP_FAILED');process.exitCode=1;}
  if(work)rmSync(work,{recursive:true,force:true,maxRetries:2});
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
 main().catch(e=>{const m=String(e?.message||'');console.error(m.startsWith(PREFIX)?m:PREFIX+'FAIL_CLOSED');process.exitCode=1;});
