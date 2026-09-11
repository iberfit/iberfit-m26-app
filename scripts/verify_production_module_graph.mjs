import {pathToFileURL} from 'node:url';
import {verifyProductionSurface} from './verify_production_surface.mjs';

const MAX_MODULES=420;
const BATCH_SIZE=16;
const DEFAULT_TIMEOUT_MS=10_000;
const JS_MIME=/(?:application|text)\/(?:javascript|ecmascript)|text\/js/iu;

function fail(code){
  const error=new Error(code);
  error.code=code;
  throw error;
}
function required(value,code){
  const text=String(value||'').trim();
  if(!text)fail(code);
  return text;
}
function exactOrigin(value){
  const url=new URL(required(value,'PROD_DEEP_BASE_URL_MISSING'));
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)){
    fail('PROD_DEEP_BASE_URL_INVALID');
  }
  return url.origin;
}
function verifyUrl(origin,path,sha,attempt){
  const url=new URL(path,origin+'/');
  url.searchParams.set('deep-verify',sha+'.'+attempt);
  return url;
}
async function fetchAsset(fetchImpl,url,timeoutMs,label){
  let response;
  try{
    response=await fetchImpl(url,{
      headers:{'cache-control':'no-cache','pragma':'no-cache'},
      cache:'no-store',
      signal:AbortSignal.timeout(timeoutMs),
    });
  }catch{
    fail('PROD_DEEP_FETCH_FAILED:'+label);
  }
  if(!response.ok)fail('PROD_DEEP_HTTP_'+response.status+':'+label);
  return Object.freeze({
    source:await response.text(),
    contentType:String(response.headers?.get?.('content-type')||''),
    cacheControl:String(response.headers?.get?.('cache-control')||''),
    etag:String(response.headers?.get?.('etag')||''),
    csp:String(response.headers?.get?.('content-security-policy')||''),
    nosniff:String(response.headers?.get?.('x-content-type-options')||''),
  });
}
function assertJavascript(asset,path){
  if(!JS_MIME.test(asset.contentType))fail('PROD_DEEP_JS_MIME_INVALID:'+path);
  if(/^\s*</u.test(asset.source)||/<(?:!doctype|html|body)\b/iu.test(asset.source.slice(0,2048))){
    fail('PROD_DEEP_JS_HTML_FALLBACK:'+path);
  }
  if(/\bimmutable\b/iu.test(asset.cacheControl))fail('PROD_DEEP_JS_CACHE_IMMUTABLE:'+path);
  const maxAge=asset.cacheControl.match(/\bmax-age\s*=\s*(\d+)/iu);
  if(maxAge&&Number(maxAge[1])>0)fail('PROD_DEEP_JS_CACHE_TOO_LONG:'+path);
}
function moduleSpecifiers(source){
  const found=new Set();
  const patterns=[
    /\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gu,
    /\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ];
  for(const pattern of patterns){
    for(const match of String(source||'').matchAll(pattern)){
      const value=String(match[1]||'').trim();
      if(value)found.add(value);
    }
  }
  return [...found];
}
function resolveModule(specifier,parentPath,origin){
  if(!specifier||specifier.startsWith('node:')||specifier.startsWith('data:'))return null;
  const url=new URL(specifier,new URL(parentPath,origin));
  if(url.origin!==origin)fail('PROD_DEEP_MODULE_CROSS_ORIGIN:'+parentPath);
  if(url.search||url.hash)fail('PROD_DEEP_MODULE_NONDETERMINISTIC:'+url.pathname);
  if(!url.pathname.startsWith('/src/m26/')&&!url.pathname.startsWith('/m26/'))return null;
  return url.pathname;
}
function moduleScriptPaths(indexSource){
  const found=new Set();
  for(const match of String(indexSource||'').matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/giu)){
    found.add(match[1]);
  }
  for(const match of String(indexSource||'').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["'][^>]*>/giu)){
    found.add(match[1]);
  }
  return [...found];
}
function parseRuntime(source){
  const text=String(source||'');
  const marker='window.__IBERFIT_M26_RUNTIME__ = Object.freeze(';
  const markerIndex=text.indexOf(marker);
  if(markerIndex<0||text.indexOf(marker,markerIndex+marker.length)>=0){
    fail('PROD_DEEP_RUNTIME_SCHEMA_INVALID');
  }

  let cursor=markerIndex+marker.length;
  while(cursor<text.length&&/\s/u.test(text[cursor]))cursor+=1;
  if(text[cursor]!=='{')fail('PROD_DEEP_RUNTIME_SCHEMA_INVALID');

  const objectStart=cursor;
  let depth=0;
  let inString=false;
  let escaped=false;
  let objectEnd=-1;

  for(;cursor<text.length;cursor+=1){
    const char=text[cursor];
    if(inString){
      if(escaped){
        escaped=false;
        continue;
      }
      if(char==='\\'){
        escaped=true;
        continue;
      }
      if(char==='"')inString=false;
      continue;
    }
    if(char==='"'){
      inString=true;
      continue;
    }
    if(char==='{'){
      depth+=1;
      continue;
    }
    if(char==='}'){
      depth-=1;
      if(depth<0)fail('PROD_DEEP_RUNTIME_SCHEMA_INVALID');
      if(depth===0){
        objectEnd=cursor+1;
        break;
      }
    }
  }

  if(objectEnd<0||inString||depth!==0)fail('PROD_DEEP_RUNTIME_SCHEMA_INVALID');
  if(!/^\s*\)\s*;/u.test(text.slice(objectEnd)))fail('PROD_DEEP_RUNTIME_SCHEMA_INVALID');
  try{return JSON.parse(text.slice(objectStart,objectEnd));}
  catch{fail('PROD_DEEP_RUNTIME_SCHEMA_INVALID');}
}
function assertExactReleaseIdentity(versionSource,runtimeSource,sourceSha){
  let version;
  try{version=JSON.parse(String(versionSource||''));}catch{fail('PROD_DEEP_VERSION_SCHEMA_INVALID');}
  const runtime=parseRuntime(runtimeSource);
  const expected='26.0.0-production.'+sourceSha.slice(0,12);
  if(version.version!==expected)fail('PROD_DEEP_VERSION_IDENTITY_MISMATCH');
  if(runtime.version!==expected)fail('PROD_DEEP_RUNTIME_IDENTITY_MISMATCH');
  if(version.sourceSha!==sourceSha)fail('PROD_DEEP_SOURCE_SHA_MISMATCH');
  return expected;
}
function assertBootstrapContract({app,application,worker,rootWorker,index,root}){
  for(const marker of [
    'data-auth-form="login"',
    'src="/m26/app.js"',
    'src="/m26/runtime-config.js"',
  ]){
    if(!index.includes(marker)||!root.includes(marker))fail('PROD_DEEP_ROOT_AUTH_MARKER_MISSING');
  }
  for(const marker of [
    'installMinimalAuthBootstrap()',
    "import('/src/m26/supabase-transport.js')",
    "import('/src/m26/app/session-vault.js')",
    'createSessionVault().save(session)',
    "import('/src/m26/app/application.js')",
  ]){
    if(!app.includes(marker))fail('PROD_DEEP_MINIMAL_AUTH_CONTRACT_MISSING');
  }
  for(const marker of [
    'continueAfterFirstFactor',
    'authAssuranceContext',
    'M26_MFA_IDENTITY_MISMATCH',
    'normalizeAuthorizedRoles',
  ]){
    if(!application.includes(marker))fail('PROD_DEEP_AUTHORIZATION_CONTRACT_MISSING');
  }
  for(const marker of [
    'function isReleasePinnedPath',
    'async function releaseCacheFirst',
    'async function releaseNavigationResponse',
    'event.respondWith(releaseCacheFirst(request))',
  ]){
    if(!worker.includes(marker))fail('PROD_DEEP_WORKER_RELEASE_PIN_MISSING');
  }
  for(const marker of [
    'pinnedShell',
    "cache.match('/m26/index.html')",
    'fetchWithDeadline',
  ]){
    if(!rootWorker.includes(marker))fail('PROD_DEEP_ROOT_WORKER_RELEASE_PIN_MISSING');
  }
}
async function verifyModuleGraph({origin,sourceSha,attempt,timeoutMs,fetchImpl,seeds}){
  const sources=new Map(Object.entries(seeds));
  const queue=[...sources.keys()];
  const seen=new Set(queue);
  let cursor=0;

  while(cursor<queue.length){
    if(queue.length>MAX_MODULES)fail('PROD_DEEP_MODULE_GRAPH_TOO_LARGE');
    const batch=queue.slice(cursor,cursor+BATCH_SIZE);
    cursor+=batch.length;
    const loaded=await Promise.all(batch.map(async path=>{
      let source=sources.get(path);
      if(source===undefined){
        const asset=await fetchAsset(fetchImpl,verifyUrl(origin,path,sourceSha,attempt),timeoutMs,'module:'+path);
        assertJavascript(asset,path);
        source=asset.source;
        sources.set(path,source);
      }
      return {path,source};
    }));

    for(const item of loaded){
      for(const specifier of moduleSpecifiers(item.source)){
        const child=resolveModule(specifier,item.path,origin);
        if(!child||seen.has(child))continue;
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return Object.freeze({count:seen.size,paths:Object.freeze([...seen].sort())});
}

export async function verifyProductionModuleGraph({
  baseUrl,
  sourceSha,
  sourceBranch,
  prodProjectRef,
  prodSupabaseUrl,
  qaProjectRef,
  attempts=2,
  delayMs=1500,
  timeoutMs=DEFAULT_TIMEOUT_MS,
  fetchImpl=globalThis.fetch,
  sleepImpl=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),
}){
  const origin=exactOrigin(baseUrl);
  const sha=required(sourceSha,'PROD_DEEP_SOURCE_SHA_MISSING');
  if(!/^[0-9a-f]{40}$/u.test(sha))fail('PROD_DEEP_SOURCE_SHA_INVALID');

  await verifyProductionSurface({
    baseUrl:origin,
    sourceSha:sha,
    sourceBranch,
    prodProjectRef,
    prodSupabaseUrl,
    qaProjectRef,
    attempts,
    delayMs,
    timeoutMs,
    fetchImpl,
    sleepImpl,
  });

  let lastError;
  for(let attempt=1;attempt<=Number(attempts||1);attempt+=1){
    try{
      const paths={
        version:'/m26/version.json',
        runtime:'/m26/runtime-config.js',
        index:'/m26/index.html',
        root:'/',
        app:'/m26/app.js',
        application:'/src/m26/app/application.js',
        worker:'/m26/sw.js',
        rootWorker:'/m26/iberfit-sw.js',
      };
      const entries=await Promise.all(Object.entries(paths).map(async([name,path])=>[
        name,
        await fetchAsset(fetchImpl,verifyUrl(origin,path,sha,attempt),timeoutMs,name),
      ]));
      const assets=Object.fromEntries(entries);

      for(const name of ['app','application','worker','rootWorker'])assertJavascript(assets[name],paths[name]);
      if(!assets.index.csp.includes("script-src 'self'"))fail('PROD_DEEP_CSP_SCRIPT_SELF_MISSING');
      if(!assets.index.csp.includes("worker-src 'self'"))fail('PROD_DEEP_CSP_WORKER_SELF_MISSING');
      if(assets.index.nosniff.toLowerCase()!=='nosniff')fail('PROD_DEEP_NOSNIFF_MISSING');
      if(!/\bno-store\b/iu.test(assets.runtime.cacheControl))fail('PROD_DEEP_RUNTIME_CACHE_INVALID');

      const version=assertExactReleaseIdentity(assets.version.source,assets.runtime.source,sha);
      assertBootstrapContract({
        app:assets.app.source,
        application:assets.application.source,
        worker:assets.worker.source,
        rootWorker:assets.rootWorker.source,
        index:assets.index.source,
        root:assets.root.source,
      });

      const seeds={
        [paths.app]:assets.app.source,
        [paths.application]:assets.application.source,
      };
      for(const scriptPath of moduleScriptPaths(assets.index.source)){
        if(scriptPath.startsWith('/src/m26/')||scriptPath.startsWith('/m26/')){
          if(!Object.hasOwn(seeds,scriptPath))seeds[scriptPath]=undefined;
        }
      }
      const graph=await verifyModuleGraph({
        origin,
        sourceSha:sha,
        attempt,
        timeoutMs,
        fetchImpl,
        seeds,
      });

      return Object.freeze({
        ok:true,
        schema:'iberfit.production.module-graph.v1',
        sourceSha:sha,
        version,
        moduleCount:graph.count,
        appEtag:assets.app.etag||null,
        applicationEtag:assets.application.etag||null,
      });
    }catch(error){
      lastError=error;
      if(attempt>=Number(attempts||1))break;
      await sleepImpl(delayMs);
    }
  }
  throw lastError||new Error('PROD_DEEP_UNKNOWN_FAILURE');
}

async function main(){
  const result=await verifyProductionModuleGraph({
    baseUrl:process.env.M26_VERIFY_BASE_URL,
    sourceSha:process.env.M26_VERIFY_SOURCE_SHA,
    sourceBranch:process.env.M26_VERIFY_SOURCE_BRANCH,
    prodProjectRef:process.env.M26_VERIFY_PROD_PROJECT_REF,
    prodSupabaseUrl:process.env.M26_VERIFY_PROD_SUPABASE_URL,
    qaProjectRef:process.env.M26_VERIFY_QA_PROJECT_REF,
    attempts:Number(process.env.M26_VERIFY_DEEP_ATTEMPTS||2),
    delayMs:Number(process.env.M26_VERIFY_DEEP_DELAY_MS||1500),
    timeoutMs:Number(process.env.M26_VERIFY_TIMEOUT_MS||DEFAULT_TIMEOUT_MS),
  });
  console.log(JSON.stringify(result,null,2));
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(isMain){
  main().catch(error=>{
    console.error(error?.code||error?.message||error);
    process.exitCode=1;
  });
}
