import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const DEFAULT_MAX_OFFSITE_AGE_HOURS=2;
export const EXPECTED_WORKFLOW_NAME='IBERFIT M44 Encrypted Offsite Disaster Recovery';
export const EXPECTED_WORKFLOW_PATH='.github/workflows/m44-encrypted-disaster-recovery.yml';
export const EXPECTED_BRANCH='canary/rc74-4';
export const REQUIRED_JOBS=Object.freeze([
  'm44-encrypted-archive-and-storage-contract',
  'm44-synthetic-postgresql17-restore-proof',
  'm44-prod-db-storage-encrypted-backup-and-restore',
]);
export const REQUIRED_PRODUCTION_STEPS=Object.freeze([
  'Fail closed if protected production backup credentials are unavailable',
  'Export complete PG17 DB and all Storage object bytes to ephemeral private workspace',
  'Encrypt authenticated recovery archive before any upload',
  'Reopen ciphertext and verify restored Storage bytes in isolated workspace',
  'Publish verified encrypted archive for immediate private-drive transfer',
  'Remove all temporary plaintext and ciphertext from runner',
]);

const SHA=/^[0-9a-f]{40}$/;
const DIGEST=/^sha256:[0-9a-f]{64}$/;

function isoMs(value,label){
  if(typeof value!=='string'||!value.trim())throw new Error(label+'_MISSING');
  const ms=Date.parse(value);
  if(!Number.isFinite(ms))throw new Error(label+'_INVALID');
  return ms;
}
function positiveInt(value,label){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<=0)throw new Error(label+'_INVALID');
  return n;
}
function collection(payload,key,label){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Array.isArray(payload[key])){
    throw new Error(label+'_INVALID');
  }
  return payload[key];
}
function success(item){
  return item?.status==='completed'&&item?.conclusion==='success';
}
function writeSummary(summaryPath,summary){
  if(!summaryPath)return;
  fs.mkdirSync(path.dirname(summaryPath),{recursive:true});
  fs.writeFileSync(summaryPath,JSON.stringify(summary,null,2)+'\n','utf8');
}

export function evaluateM44OffsiteRecovery(
  run,
  jobsPayload,
  artifactsPayload,
  {nowMs=Date.now(),maxAgeHours=DEFAULT_MAX_OFFSITE_AGE_HOURS}={},
){
  if(!Number.isFinite(nowMs)||nowMs<=0)throw new Error('M44_OFFSITE_NOW_INVALID');
  if(!Number.isFinite(maxAgeHours)||maxAgeHours<=0||maxAgeHours>24)throw new Error('M44_OFFSITE_MAX_AGE_INVALID');
  if(!run||typeof run!=='object'||Array.isArray(run))throw new Error('M44_OFFSITE_RUN_INVALID');

  const runId=positiveInt(run.id,'M44_OFFSITE_RUN_ID');
  if(run.name!==EXPECTED_WORKFLOW_NAME)throw new Error('M44_OFFSITE_WORKFLOW_NAME_MISMATCH');
  if(run.path!==EXPECTED_WORKFLOW_PATH)throw new Error('M44_OFFSITE_WORKFLOW_PATH_MISMATCH');
  if(run.head_branch!==EXPECTED_BRANCH)throw new Error('M44_OFFSITE_BRANCH_MISMATCH');
  if(!['push','workflow_dispatch'].includes(run.event))throw new Error('M44_OFFSITE_EVENT_FORBIDDEN');
  if(!success(run))throw new Error('M44_OFFSITE_RUN_NOT_SUCCESS');
  if(!SHA.test(String(run.head_sha||'')))throw new Error('M44_OFFSITE_HEAD_SHA_INVALID');

  const updatedMs=isoMs(run.updated_at,'M44_OFFSITE_RUN_UPDATED_AT');
  const ageHours=(nowMs-updatedMs)/3_600_000;
  if(ageHours < -1)throw new Error('M44_OFFSITE_RUN_TIMESTAMP_IN_FUTURE');
  if(ageHours > maxAgeHours)throw new Error('M44_OFFSITE_RUN_TOO_OLD');

  const jobs=collection(jobsPayload,'jobs','M44_OFFSITE_JOBS');
  const byName=new Map(jobs.map((job)=>[String(job?.name||''),job]));
  for(const name of REQUIRED_JOBS){
    const job=byName.get(name);
    if(!job||!success(job))throw new Error('M44_OFFSITE_REQUIRED_JOB_NOT_SUCCESS:'+name);
    if(Number(job.run_id)!==runId)throw new Error('M44_OFFSITE_JOB_RUN_MISMATCH:'+name);
    if(job.workflow_name!==EXPECTED_WORKFLOW_NAME)throw new Error('M44_OFFSITE_JOB_WORKFLOW_MISMATCH:'+name);
    if(job.head_branch!==EXPECTED_BRANCH)throw new Error('M44_OFFSITE_JOB_BRANCH_MISMATCH:'+name);
    if(job.head_sha!==run.head_sha)throw new Error('M44_OFFSITE_JOB_SHA_MISMATCH:'+name);
  }

  const productionJob=byName.get('m44-prod-db-storage-encrypted-backup-and-restore');
  const productionCompletedMs=isoMs(productionJob.completed_at,'M44_OFFSITE_PROD_JOB_COMPLETED_AT');
  const prodAgeHours=(nowMs-productionCompletedMs)/3_600_000;
  if(prodAgeHours < -1)throw new Error('M44_OFFSITE_PROD_JOB_TIMESTAMP_IN_FUTURE');
  if(prodAgeHours > maxAgeHours)throw new Error('M44_OFFSITE_PROD_JOB_TOO_OLD');

  const steps=Array.isArray(productionJob.steps)?productionJob.steps:[];
  const stepMap=new Map(steps.map((step)=>[String(step?.name||''),step]));
  for(const name of REQUIRED_PRODUCTION_STEPS){
    const step=stepMap.get(name);
    if(!step||!success(step))throw new Error('M44_OFFSITE_REQUIRED_STEP_NOT_SUCCESS:'+name);
  }

  const artifacts=collection(artifactsPayload,'artifacts','M44_OFFSITE_ARTIFACTS');
  const expectedName='iberfit-prod-ciphertext-'+runId;
  const matching=artifacts
    .filter((artifact)=>artifact?.name===expectedName)
    .map((artifact)=>({...artifact,createdMs:Date.parse(String(artifact?.created_at||''))}))
    .filter((artifact)=>Number.isFinite(artifact.createdMs))
    .sort((a,b)=>b.createdMs-a.createdMs);
  const artifact=matching[0];
  if(!artifact)throw new Error('M44_OFFSITE_ARTIFACT_MISSING');
  if(artifact.expired===true)throw new Error('M44_OFFSITE_ARTIFACT_EXPIRED');
  const artifactId=positiveInt(artifact.id,'M44_OFFSITE_ARTIFACT_ID');
  const bytes=positiveInt(artifact.size_in_bytes,'M44_OFFSITE_ARTIFACT_BYTES');
  if(bytes<1_000_000||bytes>1_073_741_824)throw new Error('M44_OFFSITE_ARTIFACT_SIZE_IMPLAUSIBLE');
  if(!DIGEST.test(String(artifact.digest||'')))throw new Error('M44_OFFSITE_ARTIFACT_DIGEST_INVALID');

  const artifactAgeHours=(nowMs-artifact.createdMs)/3_600_000;
  if(artifactAgeHours < -1)throw new Error('M44_OFFSITE_ARTIFACT_TIMESTAMP_IN_FUTURE');
  if(artifactAgeHours > maxAgeHours)throw new Error('M44_OFFSITE_ARTIFACT_TOO_OLD');
  if(artifact.createdMs < productionCompletedMs-10*60_000 || artifact.createdMs > productionCompletedMs+10*60_000){
    throw new Error('M44_OFFSITE_ARTIFACT_JOB_TIME_MISMATCH');
  }
  const expiresMs=isoMs(artifact.expires_at,'M44_OFFSITE_ARTIFACT_EXPIRES_AT');
  if(expiresMs<=nowMs)throw new Error('M44_OFFSITE_ARTIFACT_ALREADY_EXPIRED');
  if(Number(artifact.workflow_run?.id)!==runId)throw new Error('M44_OFFSITE_ARTIFACT_RUN_MISMATCH');
  if(artifact.workflow_run?.head_branch!==EXPECTED_BRANCH)throw new Error('M44_OFFSITE_ARTIFACT_BRANCH_MISMATCH');
  if(artifact.workflow_run?.head_sha!==run.head_sha)throw new Error('M44_OFFSITE_ARTIFACT_SHA_MISMATCH');

  return Object.freeze({
    ok:true,
    mode:'IBERFIT_M44_ENCRYPTED_OFFSITE_RESTORE_PROOF',
    recoveryAuthority:'INDEPENDENT_ENCRYPTED_DB_STORAGE_RESTORE',
    runId,
    runAttempt:Number(run.run_attempt)||1,
    productionJobId:positiveInt(productionJob.id,'M44_OFFSITE_PROD_JOB_ID'),
    artifactId,
    artifactBytes:bytes,
    artifactDigest:String(artifact.digest),
    latestBackupAt:new Date(artifact.createdMs).toISOString(),
    ageHours:Number(artifactAgeHours.toFixed(2)),
    databaseExportVerified:true,
    storageBytesVerified:true,
    encryptedArchiveVerified:true,
    isolatedDatabaseRestoreVerified:true,
    rolesArchivedPasswordless:true,
    restoreTestVerified:true,
    productionMigrationApproved:true,
    platformRecoveryVerified:false,
    hostedAuthVerified:false,
    vaultRootKeyVerified:false,
    edgeSecretsVerified:false,
  });
}

export function verifyM44OffsiteRecoveryFiles({
  runPath,jobsPath,artifactsPath,summaryPath,nowMs,maxAgeHours,
}={}){
  if(!runPath||!jobsPath||!artifactsPath)throw new Error('M44_OFFSITE_INPUT_PATH_REQUIRED');
  const run=JSON.parse(fs.readFileSync(runPath,'utf8'));
  const jobs=JSON.parse(fs.readFileSync(jobsPath,'utf8'));
  const artifacts=JSON.parse(fs.readFileSync(artifactsPath,'utf8'));
  try{
    const summary=evaluateM44OffsiteRecovery(run,jobs,artifacts,{nowMs,maxAgeHours});
    writeSummary(summaryPath,summary);
    return summary;
  }catch(error){
    writeSummary(summaryPath,{
      ok:false,
      error:error instanceof Error?error.message:String(error),
      restoreTestVerified:false,
      productionMigrationApproved:false,
      platformRecoveryVerified:false,
    });
    throw error;
  }
}

const invokedDirectly=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(invokedDirectly){
  const [runPath,jobsPath,artifactsPath,summaryPath]=process.argv.slice(2);
  const summary=verifyM44OffsiteRecoveryFiles({runPath,jobsPath,artifactsPath,summaryPath});
  console.log(
    'IBERFIT_M44_OFFSITE_RECOVERY_READY'+
    ' runId='+summary.runId+
    ' artifactId='+summary.artifactId+
    ' ageHours='+summary.ageHours+
    ' platformRecoveryVerified=false'
  );
}
