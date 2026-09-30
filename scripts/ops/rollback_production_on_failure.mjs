import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {
  classifyControlPlaneRollback,
  extractCanonicalDeployment,
  isControlPlaneRestored,
  normalizeRollbackSha,
} from './rollback_control_plane.mjs';

const SHA_RE=/^[0-9a-f]{40}$/u;

function normalizeSha(value){
  return normalizeRollbackSha(value);
}

function requireEnv(name){
  const value=String(process.env[name]||'').trim();
  if(!value)throw new Error(`PRODUCTION_ROLLBACK_ENV_MISSING:${name}`);
  return value;
}

export function classifyLiveSha(liveSha,sourceSha,previousSha){
  const live=normalizeSha(liveSha);
  const source=normalizeSha(sourceSha);
  const previous=normalizeSha(previousSha);
  if(!SHA_RE.test(source))throw new Error('PRODUCTION_ROLLBACK_SOURCE_SHA_INVALID');
  if(!SHA_RE.test(previous))throw new Error('PRODUCTION_ROLLBACK_PREVIOUS_SHA_INVALID');
  if(!SHA_RE.test(live))throw new Error('PRODUCTION_ROLLBACK_LIVE_SHA_INVALID');
  if(live===previous)return 'already-restored';
  if(live===source)return 'rollback-required';
  throw new Error(`PRODUCTION_ROLLBACK_LIVE_SHA_UNEXPECTED:${live}`);
}

export function isRestoredIdentity(version,{previousSha,prodRef}){
  return normalizeSha(version?.sourceSha)===normalizeSha(previousSha)
    && String(version?.environment||'').trim()==='PRODUCTION'
    && String(version?.projectRef||'').trim()===String(prodRef||'').trim()
    && version?.qaOnly===false
    && version?.production===true;
}

async function fetchJson(url,options={}){
  const response=await fetch(url,options);
  const text=await response.text();
  let body=null;
  try{body=text?JSON.parse(text):null;}catch{}
  if(!response.ok)throw new Error(`PRODUCTION_ROLLBACK_HTTP_${response.status}:${url}`);
  return body;
}

async function readLiveVersion(appDomain,tag){
  return fetchJson(`https://${appDomain}/m26/version.json?rollback=${encodeURIComponent(tag)}-${Date.now()}`,{
    method:'GET',
    cache:'no-store',
    redirect:'follow',
    headers:{'cache-control':'no-cache','pragma':'no-cache'},
  });
}

async function readCloudflareProject({accountId,project,token}){
  return fetchJson(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`,{
    method:'GET',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
  });
}

async function currentCanonicalDeployment(config){
  const payload=await readCloudflareProject(config);
  return extractCanonicalDeployment(payload,{
    expectedProject:config.project,
    errorPrefix:'PRODUCTION_ROLLBACK',
  });
}

async function main(){
  const sourceSha=requireEnv('SOURCE_SHA').toLowerCase();
  const previousSha=requireEnv('PREVIOUS_LIVE_SHA').toLowerCase();
  const previousDeploymentId=requireEnv('PREVIOUS_DEPLOYMENT_ID');
  const accountId=requireEnv('CLOUDFLARE_ACCOUNT_ID');
  const project=requireEnv('CF_PROJECT');
  const appDomain=requireEnv('APP_DOMAIN');
  const prodRef=requireEnv('PROD_SUPABASE_REF');
  const token=requireEnv('CLOUDFLARE_API_TOKEN');
  const attempts=Math.max(1,Number.parseInt(process.env.PRODUCTION_ROLLBACK_ATTEMPTS||'30',10)||30);
  const delayMs=Math.max(250,Number.parseInt(process.env.PRODUCTION_ROLLBACK_DELAY_MS||'4000',10)||4000);
  const evidencePath=String(process.env.PRODUCTION_ROLLBACK_EVIDENCE_PATH||'PRODUCTION_ROLLBACK_EVIDENCE.json').trim();
  const controlPlaneConfig={accountId,project,token};

  const initialDeployment=await currentCanonicalDeployment(controlPlaneConfig);
  const action=classifyControlPlaneRollback({
    currentDeployment:initialDeployment,
    sourceSha,
    previousDeploymentId,
    previousSha,
    errorPrefix:'PRODUCTION_ROLLBACK',
  });
  let rollbackApiInvoked=false;

  if(action==='rollback-required'){
    const api=`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments/${previousDeploymentId}/rollback`;
    const result=await fetchJson(api,{
      method:'POST',
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:'{}',
    });
    if(result?.success!==true)throw new Error('PRODUCTION_ROLLBACK_API_REJECTED');
    rollbackApiInvoked=true;
  }

  let restoredDeployment=null;
  let controlPlaneLast='';
  for(let i=1;i<=attempts;i+=1){
    try{
      const current=await currentCanonicalDeployment(controlPlaneConfig);
      if(isControlPlaneRestored(current,{previousDeploymentId,previousSha})){
        restoredDeployment=current;
        break;
      }
      controlPlaneLast=`${current.id}:${current.sourceSha}`;
    }catch(error){
      controlPlaneLast=String(error?.message||error);
    }
    if(i<attempts)await new Promise((resolve)=>setTimeout(resolve,delayMs));
  }
  if(!restoredDeployment)throw new Error(`PRODUCTION_ROLLBACK_CONTROL_PLANE_NOT_RESTORED:${controlPlaneLast}`);

  let restored=null;
  let liveLast='';
  for(let i=1;i<=attempts;i+=1){
    try{
      const current=await readLiveVersion(appDomain,`verify-${i}`);
      if(isRestoredIdentity(current,{previousSha,prodRef})){
        restored=current;
        break;
      }
      liveLast=JSON.stringify(current);
    }catch(error){
      liveLast=String(error?.message||error);
    }
    if(i<attempts)await new Promise((resolve)=>setTimeout(resolve,delayMs));
  }
  if(!restored)throw new Error(`PRODUCTION_ROLLBACK_IDENTITY_NOT_RESTORED:${liveLast}`);

  const evidence=Object.freeze({
    schema:'iberfit.production.rollback.v2',
    generatedAt:new Date().toISOString(),
    domain:appDomain,
    project,
    sourceSha,
    previousLiveSha:previousSha,
    previousDeploymentId,
    initialControlPlaneDeploymentId:initialDeployment.id,
    initialControlPlaneSha:initialDeployment.sourceSha,
    action,
    rollbackApiInvoked,
    restoredControlPlaneDeploymentId:restoredDeployment.id,
    restoredControlPlaneSha:restoredDeployment.sourceSha,
    restoredSourceSha:normalizeSha(restored.sourceSha),
    restoredProjectRef:String(restored.projectRef||''),
    restoredEnvironment:String(restored.environment||''),
    qaOnly:restored.qaOnly,
    production:restored.production,
    ok:true,
  });
  await writeFile(evidencePath,`${JSON.stringify(evidence,null,2)}\n`,'utf8');
  console.log(JSON.stringify(evidence,null,2));
}

const invokedPath=process.argv[1]?pathToFileURL(process.argv[1]).href:'';
if(import.meta.url===invokedPath){
  main().catch((error)=>{
    console.error(error?.stack||error);
    process.exitCode=1;
  });
}
