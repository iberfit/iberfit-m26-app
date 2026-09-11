import {pathToFileURL} from 'node:url';

export const PRODUCTION_SURFACE_CONTRACT='iberfit.production.surface.v1';

const DEFAULT_ATTEMPTS=30;
const DEFAULT_DELAY_MS=2_000;
const DEFAULT_TIMEOUT_MS=10_000;
const MAX_MODULE_GRAPH=400;
const MODULE_BATCH_SIZE=12;
const privilegedRolePattern=new RegExp(['service','[_-]?','role'].join(''),'iu');
const javascriptContentTypePattern=/(?:application|text)\/(?:javascript|ecmascript)|text\/js/iu;

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

function exactProductionVersion(sourceSha){
  return `26.0.0-production.${sourceSha.slice(0,12)}`;
}

export function validateProductionSurface({
  versionSource,
  runtimeSource,
  indexSource,
  rootSource=indexSource,
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
  const expectedVersion=exactProductionVersion(expectedSha);

  const version=parseJson(String(versionSource),'PROD_SURFACE_VERSION_SCHEMA_INVALID');
  if(version.sourceSha!==expectedSha)fail('PROD_SURFACE_VERSION_SHA_MISMATCH');
  if(version.sourceBranch!==expectedBranch)fail('PROD_SURFACE_VERSION_BRANCH_MISMATCH');
  if(version.version!==expectedVersion)fail('PROD_SURFACE_VERSION_IDENTITY_MISMATCH');
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
  if(runtime.version!==expectedVersion)fail('PROD_SURFACE_RUNTIME_VERSION_MISMATCH');
  if(runtime.projectRef!==expectedProjectRef)fail('PROD_SURFACE_RUNTIME_PROJECT_REF_MISMATCH');
  if(runtime.url!==expectedSupabaseUrl)fail('PROD_SURFACE_RUNTIME_URL_MISMATCH');
  if(typeof runtime.publishableKey!=='string'||!runtime.publishableKey.startsWith('sb_publishable_')){
    fail('PROD_SURFACE_RUNTIME_PUBLISHABLE_KEY_INVALID');
  }

  for(const [name,html] of [['index',String(indexSource)],['root',String(rootSource)]]){
    for(const marker of [
      '/public/isotipo-iberfit.png',
      '/src/m26/design/auth-native.css',
      'data-auth-form="login"',
      'src="/m26/runtime-config.js"',
      'src="/m26/app.js"',
    ]){
      if(!html.includes(marker))fail(`PROD_SURFACE_${name.toUpperCase()}_MARKER_MISSING`);
    }
  }

  return {
    ok:true,
    contract:PRODUCTION_SURFACE_CONTRACT,
    sourceSha:expectedSha,
    sourceBranch:expectedBranch,
    version:expectedVersion,
    projectRef:expectedProjectRef
  };
}

export function extractModuleSpecifiers(source){
  const text=String(source||'');
  const found=new Set();
  const patterns=[
    /\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gu,
    /\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ];
  for(const pattern of patterns){
    for(const match of text.matchAll(pattern)){
      const value=String(match[1]||'').trim();
      if(value)found.add(value);
    }
  }
  return [...found];
}

function resolveModulePath(specifier,parentPath,origin){
  if(!specifier||specifier.startsWith('node:')||specifier.startsWith('data:'))return null;
  let url;
  try{
    url=new URL(specifier,new URL(parentPath,origin));
  }catch{
    fail(`PROD_SURFACE_MODULE_SPECIFIER_INVALID:${parentPath}`);
  }
  if(url.origin!==origin)fail(`PROD_SURFACE_MODULE_CROSS_ORIGIN:${parentPath}`);
  if(url.search||url.hash)fail(`PROD_SURFACE_MODULE_NONDETERMINISTIC_URL:${url.pathname}`);
  if(!url.pathname.startsWith('/src/m26/')&&!url.pathname.startsWith('/m26/'))return null;
  return url.pathname;
}

function assertJavascriptAsset(asset,path){
  const contentType=String(asset?.contentType||'').toLowerCase();
  const source=String(asset?.source||'');
  if(!javascriptContentTypePattern.test(contentType))fail(`PROD_SURFACE_JS_MIME_INVALID:${path}`);
  if(/^\s*</u.test(source)||/<(?:!doctype|html|body)\b/iu.test(source.slice(0,2048))){
    fail(`PROD_SURFACE_JS_HTML_FALLBACK:${path}`);
  }
  const cacheControl=String(asset?.cacheControl||'');
  if(/\bimmutable\b/iu.test(cacheControl))fail(`PROD_SURFACE_JS_CACHE_IMMUTABLE:${path}`);
  const maxAge=cacheControl.match(/\bmax-age\s*=\s*(\d+)/iu);
  if(maxAge&&Number(maxAge[1])>0)fail(`PROD_SURFACE_JS_CACHE_TOO_LONG:${path}`);
}

function validateBootstrapAssetContract({appSource,applicationSource,rootWorkerSource,workerSource}){
  const app=String(appSource||'');
  const application=String(applicationSource||'');
  const rootWorker=String(rootWorkerSource||'');
  const worker=String(workerSource||'');

  for(const marker of [
    'installMinimalAuthBootstrap()',
    "import('/src/m26/supabase-transport.js')",
    "import('/src/m26/app/session-vault.js')",
    'createSessionVault().save(session)',
    'surfaceDeferredFullAppFailure(error)',
    "import('/src/m26/app/application.js')",
  ]){
    if(!app.includes(marker))fail('PROD_SURFACE_MINIMAL_AUTH_CONTRACT_MISSING');
  }
  for(const marker of [
    'continueAfterFirstFactor',
    'authAssuranceContext',
    'M26_MFA_IDENTITY_MISMATCH',
    'normalizeAuthorizedRoles',
    'readPreferredApplicationRole',
  ]){
    if(!application.includes(marker))fail('PROD_SURFACE_AUTHORIZATION_CONTRACT_MISSING');
  }
  for(const marker of ['pinnedShell','cache.match(\'/m26/index.html\')','fetchWithDeadline']){
    if(!rootWorker.includes(marker))fail('PROD_SURFACE_ROOT_WORKER_RELEASE_PIN_MISSING');
  }
  for(const marker of [
    'function isReleasePinnedPath',
    'async function releaseCacheFirst',
    'async function releaseNavigationResponse',
    'if(cached)return cached',
    'event.respondWith(releaseCacheFirst(request))',
  ]){
    if(!worker.includes(marker))fail('PROD_SURFACE_WORKER_RELEASE_PIN_MISSING');
  }
}

async function fetchAsset(fetchImpl,url,timeoutMs,path){
  let response;
  try{
    response=await fetchImpl(url,{
      headers:{'cache-control':'no-cache','pragma':'no-cache'},
      cache:'no-store',
      signal:AbortSignal.timeout(timeoutMs)
    });
  }catch{fail(`PROD_SURFACE_FETCH_FAILED:${path}`);}
  if(!response.ok)fail(`PROD_SURFACE_HTTP_${response.status}:${path}`);
  const source=await response.text();
  return Object.freeze({
    source,
    contentType:response.headers?.get?.('content-type')||'',
    cacheControl:response.headers?.get?.('cache-control')||'',
    etag:response.headers?.get?.('etag')||'',
    csp:response.headers?.get?.('content-security-policy')||'',
    xContentTypeOptions:response.headers?.get?.('x-content-type-options')||'',
  });
}

function verificationUrl(baseUrl,path,sourceSha,attempt){
  const url=new URL(path,`${baseUrl}/`);
  url.searchParams.set('verify',`${sourceSha}.${attempt}`);
  return url;
}

function validateSecurityHeaders(indexAsset,runtimeAsset){
  const csp=String(indexAsset?.csp||'');
  if(!csp.includes("script-src 'self'"))fail('PROD_SURFACE_CSP_SCRIPT_SELF_MISSING');
  if(!csp.includes("worker-src 'self'"))fail('PROD_SURFACE_CSP_WORKER_SELF_MISSING');
  if(!csp.includes("connect-src 'self'"))fail('PROD_SURFACE_CSP_CONNECT_SELF_MISSING');
  if(String(indexAsset?.xContentTypeOptions||'').toLowerCase()!=='nosniff'){
    fail('PROD_SURFACE_NOSNIFF_MISSING');
  }
  if(!/\bno-store\b/iu.test(String(runtimeAsset?.cacheControl||''))){
    fail('PROD_SURFACE_RUNTIME_CACHE_NOT_NOSTORE');
  }
}

export async function verifyModuleGraph({
  origin,
  sourceSha,
  attempt,
  timeoutMs,
  fetchImpl,
  seedSources={},
}){
  const sources=new Map(Object.entries(seedSources));
  const queue=[...sources.keys()];
  const discovered=new Set(queue);
  let cursor=0;

  while(cursor<queue.length){
    if(queue.length>MAX_MODULE_GRAPH)fail('PROD_SURFACE_MODULE_GRAPH_TOO_LARGE');
    const batch=queue.slice(cursor,cursor+MODULE_BATCH_SIZE);
    cursor+=batch.length;

    const results=await Promise.all(batch.map(async path=>{
      let source=sources.get(path);
      if(source===undefined){
        const asset=await fetchAsset(
          fetchImpl,
          verificationUrl(origin,path,sourceSha,attempt),
          timeoutMs,
          `module:${path}`,
        );
        assertJavascriptAsset(asset,path);
        source=asset.source;
        sources.set(path,source);
      }
      return {path,source};
    }));

    for(const {path,source} of results){
      for(const specifier of extractModuleSpecifiers(source)){
        const child=resolveModulePath(specifier,path,origin);
        if(!child||discovered.has(child))continue;
        discovered.add(child);
        queue.push(child);
      }
    }
  }

  return Object.freeze({
    count:discovered.size,
    modules:Object.freeze([...discovered].sort()),
  });
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
      const paths={
        version:'/m26/version.json',
        runtime:'/m26/runtime-config.js',
        index:'/m26/index.html',
        root:'/',
        app:'/m26/app.js',
        application:'/src/m26/app/application.js',
        rootWorker:'/m26/iberfit-sw.js',
        worker:'/m26/sw.js',
      };
      const entries=await Promise.all(Object.entries(paths).map(async([name,path])=>[
        name,
        await fetchAsset(
          fetchImpl,
          verificationUrl(origin,path,sourceSha,attempt),
          requestTimeoutMs,
          name,
        ),
      ]));
      const assets=Object.fromEntries(entries);

      for(const [name,path] of [
        ['app',paths.app],
        ['application',paths.application],
        ['rootWorker',paths.rootWorker],
        ['worker',paths.worker],
      ])assertJavascriptAsset(assets[name],path);

      validateSecurityHeaders(assets.index,assets.runtime);
      validateBootstrapAssetContract({
        appSource:assets.app.source,
        applicationSource:assets.application.source,
        rootWorkerSource:assets.rootWorker.source,
        workerSource:assets.worker.source,
      });

      const moduleGraph=await verifyModuleGraph({
        origin,
        sourceSha,
        attempt,
        timeoutMs:requestTimeoutMs,
        fetchImpl,
        seedSources:{
          [paths.app]:assets.app.source,
          [paths.application]:assets.application.source,
        },
      });

      return {
        ...validateProductionSurface({
          versionSource:assets.version.source,
          runtimeSource:assets.runtime.source,
          indexSource:assets.index.source,
          rootSource:assets.root.source,
          sourceSha,
          sourceBranch,
          prodProjectRef,
          prodSupabaseUrl,
          qaProjectRef,
        }),
        baseUrl:origin,
        attempt,
        moduleCount:moduleGraph.count,
        headers:Object.freeze({
          appCacheControl:assets.app.cacheControl,
          applicationCacheControl:assets.application.cacheControl,
          appEtag:assets.app.etag||null,
          applicationEtag:assets.application.etag||null,
        }),
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
