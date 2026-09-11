import {pathToFileURL} from 'node:url';

export const PRODUCTION_SURFACE_CONTRACT='iberfit.production.surface.v1';

const DEFAULT_ATTEMPTS=30;
const DEFAULT_DELAY_MS=2_000;
const DEFAULT_TIMEOUT_MS=10_000;
const privilegedRolePattern=new RegExp(['service','[_-]?','role'].join(''),'iu');

function fail(code){
  const error=new Error(code);
  error.code=code;
  throw error;
}

function required(value,code){
  const normalized=String(value||'').trim();
  if(!normalized)fail(code);
  return normalized;
}

function positiveInteger(value,fallback,code){
  if(value===undefined||value===null||value==='')return fallback;
  const parsed=Number(value);
  if(!Number.isSafeInteger(parsed)||parsed<1)fail(code);
  return parsed;
}

function exactBaseUrl(value){
  const raw=required(value,'PROD_SURFACE_BASE_URL_MISSING');
  let url;
  try{url=new URL(raw);}catch{fail('PROD_SURFACE_BASE_URL_INVALID');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)){
    fail('PROD_SURFACE_BASE_URL_INVALID');
  }
  return url.origin;
}

function parseJson(source,code){
  try{return JSON.parse(source);}catch{fail(code);}
}

function parseRuntime(source){
  const match=String(source).match(/Object\.freeze\((\{[\s\S]*\})\)\s*;?\s*$/u);
  if(!match)fail('PROD_SURFACE_RUNTIME_SCHEMA_INVALID');
  return parseJson(match[1],'PROD_SURFACE_RUNTIME_SCHEMA_INVALID');
}

export function validateProductionSurface({
  versionSource,
  runtimeSource,
  indexSource,
  sourceSha,
  sourceBranch,
  prodProjectRef,
  prodSupabaseUrl,
  qaProjectRef
}){
  const expectedSha=required(sourceSha,'PROD_SURFACE_SOURCE_SHA_MISSING');
  if(!/^[0-9a-f]{40}$/u.test(expectedSha))fail('PROD_SURFACE_SOURCE_SHA_INVALID');
  const expectedBranch=required(sourceBranch,'PROD_SURFACE_SOURCE_BRANCH_MISSING');
  const expectedProjectRef=required(prodProjectRef,'PROD_SURFACE_PROJECT_REF_MISSING');
  const expectedSupabaseUrl=required(prodSupabaseUrl,'PROD_SURFACE_SUPABASE_URL_MISSING');
  const forbiddenQaRef=required(qaProjectRef,'PROD_SURFACE_QA_REF_MISSING');

  const version=parseJson(String(versionSource),'PROD_SURFACE_VERSION_SCHEMA_INVALID');
  if(version.sourceSha!==expectedSha)fail('PROD_SURFACE_VERSION_SHA_MISMATCH');
  if(version.sourceBranch!==expectedBranch)fail('PROD_SURFACE_VERSION_BRANCH_MISMATCH');
  if(version.environment!=='PRODUCTION'||version.production!==true||version.qaOnly!==false){
    fail('PROD_SURFACE_VERSION_ENVIRONMENT_INVALID');
  }
  if(version.projectRef!==expectedProjectRef)fail('PROD_SURFACE_VERSION_PROJECT_REF_MISMATCH');

  const runtimeText=String(runtimeSource);
  if(runtimeText.includes(forbiddenQaRef))fail('PROD_SURFACE_RUNTIME_QA_LEAK');
  if(privilegedRolePattern.test(runtimeText))fail('PROD_SURFACE_RUNTIME_PRIVILEGED_KEY_FORBIDDEN');
  const runtime=parseRuntime(runtimeText);
  if(runtime.enabled!==true)fail('PROD_SURFACE_RUNTIME_NOT_ENABLED');
  if(runtime.qaOnly!==false)fail('PROD_SURFACE_RUNTIME_QA_ONLY_INVALID');
  if(runtime.projectRef!==expectedProjectRef)fail('PROD_SURFACE_RUNTIME_PROJECT_REF_MISMATCH');
  if(runtime.url!==expectedSupabaseUrl)fail('PROD_SURFACE_RUNTIME_URL_MISMATCH');
  if(typeof runtime.publishableKey!=='string'||!runtime.publishableKey.startsWith('sb_publishable_')){
    fail('PROD_SURFACE_RUNTIME_PUBLISHABLE_KEY_INVALID');
  }

  const index=String(indexSource);
  for(const marker of ['/public/isotipo-iberfit.png','/src/m26/design/auth-native.css']){
    if(!index.includes(marker))fail('PROD_SURFACE_INDEX_MARKER_MISSING');
  }

  return {
    ok:true,
    contract:PRODUCTION_SURFACE_CONTRACT,
    sourceSha:expectedSha,
    sourceBranch:expectedBranch,
    projectRef:expectedProjectRef
  };
}

async function fetchText(fetchImpl,url,timeoutMs,path){
  let response;
  try{
    response=await fetchImpl(url,{
      headers:{'cache-control':'no-cache','pragma':'no-cache'},
      signal:AbortSignal.timeout(timeoutMs)
    });
  }catch{fail(`PROD_SURFACE_FETCH_FAILED:${path}`);}
  if(!response.ok)fail(`PROD_SURFACE_HTTP_${response.status}:${path}`);
  return response.text();
}

function verificationUrl(baseUrl,path,sourceSha,attempt){
  const url=new URL(path,`${baseUrl}/`);
  url.searchParams.set('verify',`${sourceSha}.${attempt}`);
  return url;
}

export async function verifyProductionSurface({
  baseUrl,
  sourceSha,
  sourceBranch,
  prodProjectRef,
  prodSupabaseUrl,
  qaProjectRef,
  attempts=DEFAULT_ATTEMPTS,
  delayMs=DEFAULT_DELAY_MS,
  timeoutMs=DEFAULT_TIMEOUT_MS,
  fetchImpl=globalThis.fetch,
  sleepImpl=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),
  onRetry=()=>{}
}){
  const origin=exactBaseUrl(baseUrl);
  const totalAttempts=positiveInteger(attempts,DEFAULT_ATTEMPTS,'PROD_SURFACE_ATTEMPTS_INVALID');
  const waitMs=positiveInteger(delayMs,DEFAULT_DELAY_MS,'PROD_SURFACE_DELAY_INVALID');
  const requestTimeoutMs=positiveInteger(timeoutMs,DEFAULT_TIMEOUT_MS,'PROD_SURFACE_TIMEOUT_INVALID');
  if(typeof fetchImpl!=='function')fail('PROD_SURFACE_FETCH_UNAVAILABLE');
  let lastError;

  for(let attempt=1;attempt<=totalAttempts;attempt+=1){
    try{
      const [versionSource,runtimeSource,indexSource]=await Promise.all([
        fetchText(fetchImpl,verificationUrl(origin,'/m26/version.json',sourceSha,attempt),requestTimeoutMs,'version'),
        fetchText(fetchImpl,verificationUrl(origin,'/m26/runtime-config.js',sourceSha,attempt),requestTimeoutMs,'runtime'),
        fetchText(fetchImpl,verificationUrl(origin,'/m26/index.html',sourceSha,attempt),requestTimeoutMs,'index')
      ]);
      return {
        ...validateProductionSurface({versionSource,runtimeSource,indexSource,sourceSha,sourceBranch,prodProjectRef,prodSupabaseUrl,qaProjectRef}),
        baseUrl:origin,
        attempt
      };
    }catch(error){
      lastError=error;
      if(attempt===totalAttempts)break;
      onRetry({attempt,totalAttempts,code:error?.code||error?.message||'PROD_SURFACE_UNKNOWN_FAILURE'});
      await sleepImpl(waitMs);
    }
  }

  const code=lastError?.code||lastError?.message||'PROD_SURFACE_UNKNOWN_FAILURE';
  fail(`PROD_SURFACE_VERIFY_FAILED:${code}`);
}

async function main(){
  const result=await verifyProductionSurface({
    baseUrl:process.env.M26_VERIFY_BASE_URL,
    sourceSha:process.env.M26_VERIFY_SOURCE_SHA,
    sourceBranch:process.env.M26_VERIFY_SOURCE_BRANCH,
    prodProjectRef:process.env.M26_VERIFY_PROD_PROJECT_REF,
    prodSupabaseUrl:process.env.M26_VERIFY_PROD_SUPABASE_URL,
    qaProjectRef:process.env.M26_VERIFY_QA_PROJECT_REF,
    attempts:process.env.M26_VERIFY_ATTEMPTS,
    delayMs:process.env.M26_VERIFY_DELAY_MS,
    timeoutMs:process.env.M26_VERIFY_TIMEOUT_MS,
    onRetry:({attempt,totalAttempts,code})=>console.warn(`PROD_SURFACE_VERIFY_RETRY:${attempt}/${totalAttempts}:${code}`)
  });
  console.log(JSON.stringify(result,null,2));
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(isMain){
  main().catch(error=>{
    console.error(error?.message||error);
    process.exitCode=1;
  });
}
