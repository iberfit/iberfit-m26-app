import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const SHA_RE=/^[0-9a-f]{40}$/u;

function normalizeSha(value){
  return String(value||'').trim().toLowerCase();
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

  const before=await readLiveVersion(appDomain,'before');
  const action=classifyLiveSha(before?.sourceSha,sourceSha,previousSha);
  let rollbackApiInvoked=false;

  if(action==='rollback-required'){
    const api=`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments/${previousDeploymentId}/rollback`;
    const result=await fetchJson(api,{
      method:'POST',
      headers:{
        authorization:`Bearer ${token}`,
        'content-type':'application/json',
      },
      body:'{}',
    });
    if(result?.success!==true)throw new Error('PRODUCTION_ROLLBACK_API_REJECTED');
    rollbackApiInvoked=true;
  }

  let restored=null;
  for(let i=1;i<=attempts;i+=1){
    const current=await readLiveVersion(appDomain,`verify-${i}`);
    if(isRestoredIdentity(current,{previousSha,prodRef})){
      restored=current;
      break;
    }
    if(i<attempts)await new Promise((resolve)=>setTimeout(resolve,delayMs));
  }
  if(!restored)throw new Error('PRODUCTION_ROLLBACK_IDENTITY_NOT_RESTORED');

  const evidence=Object.freeze({
    schema:'iberfit.production.rollback.v1',
    generatedAt:new Date().toISOString(),
    domain:appDomain,
    project,
    sourceSha,
    previousLiveSha:previousSha,
    previousDeploymentId,
    initialLiveSha:normalizeSha(before?.sourceSha),
    action,
    rollbackApiInvoked,
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
