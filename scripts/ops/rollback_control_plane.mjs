const SHA_RE=/^[0-9a-f]{40}$/u;

export function normalizeRollbackSha(value){
  return String(value||'').trim().toLowerCase();
}

function fail(prefix,code,detail=''){
  const suffix=detail?`:${detail}`:'';
  throw new Error(`${prefix}_${code}${suffix}`);
}

function requiredString(value,prefix,code){
  const normalized=String(value??'').trim();
  if(!normalized)fail(prefix,code);
  return normalized;
}

export function extractCanonicalDeployment(projectPayload,{expectedProject,errorPrefix='ROLLBACK'}={}){
  const prefix=requiredString(errorPrefix,'ROLLBACK','ERROR_PREFIX_MISSING');
  const projectName=requiredString(expectedProject,prefix,'PROJECT_NAME_MISSING');
  if(projectPayload?.success!==true||!projectPayload?.result)fail(prefix,'CF_PROJECT_LOOKUP_FAILED');
  const project=projectPayload.result;
  if(String(project.name||'').trim()!==projectName)fail(prefix,'CF_PROJECT_MISMATCH',String(project.name||''));

  const deployment=project.canonical_deployment;
  if(!deployment||typeof deployment!=='object')fail(prefix,'CF_CANONICAL_DEPLOYMENT_MISSING');
  if(deployment.environment!=='production')fail(prefix,'CF_CANONICAL_ENV_INVALID',String(deployment.environment||''));
  if(deployment.is_skipped!==false)fail(prefix,'CF_CANONICAL_DEPLOYMENT_SKIPPED');
  if(deployment.latest_stage?.status!=='success')fail(prefix,'CF_CANONICAL_STATUS_INVALID',String(deployment.latest_stage?.status||''));

  const id=requiredString(deployment.id,prefix,'CF_CANONICAL_DEPLOYMENT_ID_MISSING');
  const sourceSha=normalizeRollbackSha(deployment.deployment_trigger?.metadata?.commit_hash);
  if(!SHA_RE.test(sourceSha))fail(prefix,'CF_CANONICAL_SHA_INVALID',sourceSha);

  return Object.freeze({
    id,
    sourceSha,
    branch:String(deployment.deployment_trigger?.metadata?.branch||deployment.production_branch||'').trim(),
    url:String(deployment.url||'').trim(),
  });
}

export function classifyControlPlaneRollback({
  currentDeployment,
  sourceSha,
  previousDeploymentId,
  previousSha,
  errorPrefix='ROLLBACK',
}={}){
  const prefix=requiredString(errorPrefix,'ROLLBACK','ERROR_PREFIX_MISSING');
  const source=normalizeRollbackSha(sourceSha);
  const previous=normalizeRollbackSha(previousSha);
  const previousId=requiredString(previousDeploymentId,prefix,'PREVIOUS_DEPLOYMENT_ID_MISSING');
  if(!SHA_RE.test(source))fail(prefix,'SOURCE_SHA_INVALID',source);
  if(!SHA_RE.test(previous))fail(prefix,'PREVIOUS_SHA_INVALID',previous);

  const currentId=requiredString(currentDeployment?.id,prefix,'CURRENT_DEPLOYMENT_ID_MISSING');
  const currentSha=normalizeRollbackSha(currentDeployment?.sourceSha);
  if(!SHA_RE.test(currentSha))fail(prefix,'CURRENT_DEPLOYMENT_SHA_INVALID',currentSha);

  if(currentId===previousId){
    if(currentSha!==previous)fail(prefix,'PREVIOUS_DEPLOYMENT_SHA_MISMATCH',`${currentSha}:${previous}`);
    return 'already-restored';
  }
  if(currentSha===source)return 'rollback-required';
  fail(prefix,'CURRENT_DEPLOYMENT_UNEXPECTED',`${currentId}:${currentSha}`);
}

export function isControlPlaneRestored(currentDeployment,{previousDeploymentId,previousSha}={}){
  const previousId=String(previousDeploymentId||'').trim();
  const previous=normalizeRollbackSha(previousSha);
  return Boolean(previousId)
    && SHA_RE.test(previous)
    && String(currentDeployment?.id||'').trim()===previousId
    && normalizeRollbackSha(currentDeployment?.sourceSha)===previous;
}
