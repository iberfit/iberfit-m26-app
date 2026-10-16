// Fail-closed proof of a REAL encrypted backup restored in isolation and held
// in private Google Drive. No secrets, file IDs, personal data or payloads in logs.
// This is an alternative to Supabase-managed backup inventory, NOT a bypass.
import {createHash} from 'node:crypto';
export const PROD_REF='pjhmrhejsoofmouedavw';
export const REPO='iberfit/iberfit-m26-app';
export const RECOVERY_WORKFLOW='.github/workflows/m44-encrypted-disaster-recovery.yml';
export const MAX_BACKUP_AGE_MS=48*3600*1000;
export const MAX_ARCHIVE_BYTES=512*1024*1024;
const P='M44_OFFSITE_PROOF_';
const sha40=x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x);
const sha256=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const number=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const fail=code=>{throw Error(P+code);};
function requireConfig(o) {
 if(!sha40(o.sourceSha)||!number(o.runId)||!number(o.fileId?.length)||!o.driveFolderId)
  fail('CONFIG_INVALID');
 if(!o.githubToken||!o.driveAccessToken)fail('CREDENTIAL_MISSING');
 if(!Number.isFinite(o.nowMs)||o.nowMs<=0)fail('CLOCK_INVALID');
 if(typeof o.fetchImpl!=='function')fail('FETCH_INVALID');
}
async function readJson(url,token,fetchImpl) {
 let r;
 try{r=await fetchImpl(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(30000)});}
 catch{fail('REMOTE_UNREACHABLE');}
 if(!r?.ok)fail('REMOTE_HTTP_'+(Number.isInteger(r?.status)?r.status:'UNKNOWN'));
 try{return await r.json();}catch{fail('REMOTE_JSON_INVALID');}
}
function requireRecent(iso,nowMs,maxAgeMs=MAX_BACKUP_AGE_MS) {
 const time=Date.parse(iso||'');
 if(!Number.isFinite(maxAgeMs)||maxAgeMs<=0||maxAgeMs>MAX_BACKUP_AGE_MS)fail('MAX_AGE_INVALID');
 if(!Number.isFinite(time)||time>nowMs+60000||nowMs-time>maxAgeMs)fail('BACKUP_NOT_RECENT');
 return time;
}
export async function acquireDriveAccessToken({accessToken,clientId,clientSecret,refreshToken,fetchImpl=fetch}={}){
 if(typeof accessToken==='string'&&accessToken.length>=20)return accessToken;
 if(!clientId||!clientSecret||!refreshToken)fail('DRIVE_OAUTH_CREDENTIALS_MISSING');
 let r;
 try{r=await fetchImpl('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),
  signal:AbortSignal.timeout(20000)
 });}catch{fail('DRIVE_OAUTH_UNREACHABLE');}
 if(!r?.ok)fail('DRIVE_OAUTH_REJECTED');
 let result;try{result=await r.json();}catch{fail('DRIVE_OAUTH_INVALID');}
 if(typeof result?.access_token!=='string'||result.access_token.length<20)fail('DRIVE_OAUTH_INVALID');
 return result.access_token;
}
export async function verifyIndependentOffsiteRecovery({
 sourceSha,runId,fileId,driveFolderId,githubToken,driveAccessToken,
 fetchImpl=fetch,nowMs=Date.now(),maxAgeMs=MAX_BACKUP_AGE_MS
}={}){
 requireConfig({sourceSha,runId,fileId,driveFolderId,githubToken,driveAccessToken,fetchImpl,nowMs});
 const api='https://api.github.com/repos/'+REPO;
 const run=await readJson(api+'/actions/runs/'+runId,githubToken,fetchImpl);
 if(run.id!==Number(runId)||run.repository?.full_name!==REPO||
  run.repository?.id!==1306074388||run.name!=='IBERFIT M44 Encrypted Offsite Disaster Recovery'||
  run.path!==RECOVERY_WORKFLOW||run.head_branch!=='canary/rc74-4'||
  !sha40(run.head_sha)||run.status!=='completed'||run.conclusion!=='success')
  fail('RUN_IDENTITY_INVALID');
 requireRecent(run.created_at,nowMs,maxAgeMs);
 // An earlier verified backup is allowed only if it is an ancestor of the
 // EXACT source being promoted. A different repo/branch/source is forbidden.
 const compare=await readJson(api+'/compare/'+run.head_sha+'...'+sourceSha,githubToken,fetchImpl);
 if(!['ahead','identical'].includes(compare.status)||Number(compare.behind_by)!==0)
  fail('SOURCE_LINEAGE_INVALID');
 const jobs=await readJson(api+'/actions/runs/'+runId+'/jobs?per_page=100',githubToken,fetchImpl);
 if(!Array.isArray(jobs.jobs)||!Number.isSafeInteger(jobs.total_count)||
  jobs.total_count!==jobs.jobs.length||jobs.total_count>100)fail('JOBS_INCOMPLETE');
 const job=jobs.jobs.find(x=>x.name==='m44-prod-db-storage-encrypted-backup-and-restore');
 const required=[
  'Export complete PG17 DB and all Storage object bytes to ephemeral private workspace',
  'Encrypt authenticated recovery archive before any upload',
  'Reopen ciphertext and verify restored Storage bytes in isolated workspace',
  'Publish verified encrypted archive for immediate private-drive transfer',
  'Remove all temporary plaintext and ciphertext from runner'
 ];
 if(!job||job.status!=='completed'||job.conclusion!=='success'||
   required.some(name=>!job.steps?.some(x=>x.name===name&&x.conclusion==='success')))
  fail('ISOLATED_RESTORE_UNVERIFIED');
 const data=await readJson(api+'/actions/runs/'+runId+'/artifacts?per_page=100',githubToken,fetchImpl);
 if(!Array.isArray(data.artifacts)||!Number.isSafeInteger(data.total_count)||
  data.total_count!==data.artifacts.length||data.total_count>100)fail('ARTIFACT_LIST_INCOMPLETE');
 const matched=data.artifacts.filter(x=>x.name==='iberfit-prod-ciphertext-'+runId);
 if(matched.length!==1)fail('ARTIFACT_UNIQUE_PROVENANCE_REQUIRED');
 const artifact=matched[0];
 if(!artifact||artifact.workflow_run?.id!==Number(runId)||
  artifact.workflow_run?.head_sha!==run.head_sha||
  !sha256(artifact.digest?.replace(/^sha256:/,''))||
  !number(artifact.size_in_bytes)||artifact.size_in_bytes>MAX_ARCHIVE_BYTES)
  fail('ARTIFACT_PROVENANCE_INVALID');
 const expectedHash=artifact.digest.slice('sha256:'.length);
 const fields='id,name,mimeType,size,parents,shared,trashed,driveId,permissions(type,role,emailAddress)';
 const driveBase='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId);
 const meta=await readJson(driveBase+'?fields='+encodeURIComponent(fields),driveAccessToken,fetchImpl);
 if(meta.id!==fileId||meta.trashed!==false||meta.shared!==false||
  meta.mimeType!=='application/zip'||meta.driveId!=null||Number(meta.size)!==artifact.size_in_bytes||
  !Array.isArray(meta.parents)||meta.parents.length!==1||meta.parents[0]!==driveFolderId||
  !Array.isArray(meta.permissions)||meta.permissions.length!==1||
  meta.permissions[0].type!=='user'||meta.permissions[0].role!=='owner'||
  meta.permissions[0].emailAddress!=='iberfit.cl@gmail.com')
  fail('DRIVE_CUSTODY_INVALID');
 // A private file inside a shared ancestor is not an independently private
 // recovery store. Validate the claimed parent directly instead of trusting
 // the caller-provided folder ID, inherited access or the child's metadata.
 const folderBase='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(driveFolderId);
 const folder=await readJson(folderBase+'?fields='+encodeURIComponent(
  'id,mimeType,shared,trashed,driveId,permissions(type,role,emailAddress)'
 ),driveAccessToken,fetchImpl);
 if(folder.id!==driveFolderId||folder.mimeType!=='application/vnd.google-apps.folder'||
  folder.shared!==false||folder.trashed!==false||folder.driveId!=null||
  !Array.isArray(folder.permissions)||folder.permissions.length!==1||
  folder.permissions[0].type!=='user'||folder.permissions[0].role!=='owner'||
  folder.permissions[0].emailAddress!=='iberfit.cl@gmail.com')
  fail('DRIVE_FOLDER_CUSTODY_INVALID');
 let response;
 try{response=await fetchImpl(driveBase+'?alt=media',{
  headers:{Authorization:'Bearer '+driveAccessToken},
  signal:AbortSignal.timeout(180000)
 });}catch{fail('DRIVE_DOWNLOAD_FAILED');}
 if(!response?.ok||!response.body)fail('DRIVE_DOWNLOAD_FAILED');
 const hash=createHash('sha256');let total=0;
 try{
  for await(const chunk of response.body){
   total+=chunk.byteLength;
   if(total>MAX_ARCHIVE_BYTES||total>artifact.size_in_bytes)fail('DRIVE_BYTES_OVERSIZED');
   hash.update(chunk);
  }
 }catch(e){if(String(e?.message||'').startsWith(P))throw e;fail('DRIVE_DOWNLOAD_INTERRUPTED');}
 if(total!==artifact.size_in_bytes||hash.digest('hex')!==expectedHash)
  fail('DRIVE_DIGEST_MISMATCH');
 return Object.freeze({
  ready:true,project:PROD_REF,method:'offsite-drive-encrypted-restore',
  runId:Number(runId),backupSourceSha:run.head_sha,
  artifactSha256:expectedHash,artifactBytes:total,
  backupUtc:run.created_at,restoreTestVerified:true,
  storageRestoreStepVerified:true,offsiteBytesVerified:true,privateOwnerVerified:true,
  // This DOES NOT certify PostgreSQL role/grant/hosted Auth restoration.
  platformRecoveryVerified:false
 });
}
