// Fail-closed proof of a REAL encrypted backup restored in isolation and held
// in private Google Drive. No secrets, file IDs, personal data or payloads in logs.
// This is an alternative to Supabase-managed backup inventory, NOT a bypass.
import {createHash} from 'node:crypto';
import {evaluateM44OffsiteRecovery} from '../data-safety/check_m44_offsite_recovery_readiness.mjs';
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
  !sha40(run.head_sha)||!['push','workflow_dispatch'].includes(run.event)||
  run.status!=='completed'||run.conclusion!=='success')
  fail('RUN_IDENTITY_INVALID');
 // A protected rerun keeps OLD run.created_at; fresh backup provenance is
 // bound instead to run.updated_at, final-attempt job and newest artifact.
 requireRecent(run.updated_at,nowMs,maxAgeMs);
 // An earlier verified backup is allowed only if it is an ancestor of the
 // EXACT source being promoted. A different repo/branch/source is forbidden.
 const compare=await readJson(api+'/compare/'+run.head_sha+'...'+sourceSha,githubToken,fetchImpl);
 if(!['ahead','identical'].includes(compare.status)||Number(compare.behind_by)!==0)
  fail('SOURCE_LINEAGE_INVALID');
 const jobs=await readJson(api+'/actions/runs/'+runId+'/jobs?per_page=100&filter=all',githubToken,fetchImpl);
 const data=await readJson(api+'/actions/runs/'+runId+'/artifacts?per_page=100',githubToken,fetchImpl);
 if(!Array.isArray(data.artifacts)||!Number.isSafeInteger(data.total_count)||
   data.total_count!==data.artifacts.length||data.total_count>100)
  fail('ARTIFACT_LIST_INCOMPLETE');
 // An earlier attempt can retain an artifact with this name; the shared
 // recovery verifier selects the newest one after checking exact job times.
 // Two artifacts with the same latest timestamp make identity ambiguous.
 const matching=data.artifacts.filter(x=>x?.name==='iberfit-prod-ciphertext-'+runId)
  .sort((a,b)=>Date.parse(b.created_at||'')-Date.parse(a.created_at||''));
 if(!matching.length||(matching.length>1 &&
   matching[0].created_at===matching[1].created_at))
  fail('ARTIFACT_UNIQUE_PROVENANCE_REQUIRED');
 let recovery;
 try{
  recovery=evaluateM44OffsiteRecovery(run,jobs,data,{
   nowMs,maxAgeHours:maxAgeMs/3600000});
 }catch(error){
  const reason=String(error?.message||'');
  if(/TOO_OLD|ALREADY_EXPIRED|TIMESTAMP_IN_FUTURE|RUN_UPDATED_AT/.test(reason))
   fail('BACKUP_NOT_RECENT');
  if(/JOBS_|JOB_|REQUIRED_STEP|PROD_JOB/.test(reason))
   fail('ISOLATED_RESTORE_UNVERIFIED');
  if(/ARTIFACT/.test(reason))fail('ARTIFACT_PROVENANCE_INVALID');
  fail('RECOVERY_EVIDENCE_INVALID');
 }
 const artifact=matching.find(x=>x.id===recovery.artifactId);
 if(!artifact||artifact.size_in_bytes>MAX_ARCHIVE_BYTES)
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
 // A private file inside a shared ancestor is not independent private custody.
 // Resolve the actual authenticated owner's My Drive root; never trust a
 // caller-provided root ID or an omitted parents field as evidence.
 const folderFields='id,mimeType,shared,trashed,driveId,parents,permissions(type,role,emailAddress)';
 const driveApi='https://www.googleapis.com/drive/v3/files/';
 const root=await readJson(driveApi+'root?fields='+encodeURIComponent(folderFields),driveAccessToken,fetchImpl);
 const ownerOnly=(item,id)=>item?.id===id&&item.mimeType==='application/vnd.google-apps.folder'&&
  item.shared===false&&item.trashed===false&&item.driveId==null&&
  Array.isArray(item.permissions)&&item.permissions.length===1&&
  item.permissions[0].type==='user'&&item.permissions[0].role==='owner'&&
  item.permissions[0].emailAddress==='iberfit.cl@gmail.com';
 if(!root?.id||!ownerOnly(root,root.id))fail('DRIVE_ROOT_CUSTODY_INVALID');
 let currentFolderId=driveFolderId;
 const visited=new Set();
 const MAX_DEPTH=16;
 while(currentFolderId!==root.id){
  if(visited.has(currentFolderId))fail('DRIVE_ANCESTRY_CYCLE');
  if(visited.size>=MAX_DEPTH)fail('DRIVE_ANCESTRY_DEPTH_EXCEEDED');
  visited.add(currentFolderId);
  const folder=await readJson(driveApi+encodeURIComponent(currentFolderId)+
   '?fields='+encodeURIComponent(folderFields),driveAccessToken,fetchImpl);
  if(!ownerOnly(folder,currentFolderId))fail('DRIVE_FOLDER_CUSTODY_INVALID');
  if(!Array.isArray(folder.parents)||folder.parents.length!==1||
     typeof folder.parents[0]!=='string'||!folder.parents[0])
   fail('DRIVE_ANCESTRY_INVALID');
  currentFolderId=folder.parents[0];
 }
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
  backupUtc:recovery.latestBackupAt,restoreTestVerified:true,
  storageRestoreStepVerified:true,offsiteBytesVerified:true,privateOwnerVerified:true,
  // This DOES NOT certify PostgreSQL role/grant/hosted Auth restoration.
  platformRecoveryVerified:false
 });
}
