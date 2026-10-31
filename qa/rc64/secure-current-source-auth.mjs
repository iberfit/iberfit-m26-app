import fs from 'node:fs/promises';
import path from 'node:path';

export const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
export const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
export const SUPABASE_ORIGIN=`https://${QA_PROJECT_REF}.supabase.co`;

const BUILD_ROOT=path.resolve('.tmp/rc64-current-surface');
const PUBLIC_BUILD_ROOT=path.join(BUILD_ROOT,'public');
const MIME=Object.freeze({
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
  '.woff':'font/woff',
  '.woff2':'font/woff2',
});

function mimeFor(file){return MIME[path.extname(file).toLowerCase()]||'application/octet-stream';}
export function qaRequestLabel(request){
  try{
    const url=new URL(request.url());
    const origin=url.origin===SUPABASE_ORIGIN?'qa-supabase':url.origin===CANARY_ORIGIN?'current-source':'external';
    return `${request.method().toUpperCase()} ${origin} ${url.pathname.slice(0,180)}`;
  }catch{return 'INVALID_REQUEST';}
}

function isReadOnlyPushConfigRequest(request,url,method){
  if(method!=='POST'||url.pathname!=='/functions/v1/iberfit-web-push-sender-v1')return false;
  try{
    const body=request.postDataJSON();
    return body&&typeof body==='object'&&!Array.isArray(body)&&body.action==='config'&&Object.keys(body).length===1;
  }catch{return false;}
}

// Only a private, JWT-authenticated, owner-scoped WebP GET is permitted by
// readonly visual/auth/device QA. Storage writes, public URLs and arbitrary
// queries are forbidden. Exact M42 cacheNonce reads prevent stale private CDN
// responses without weakening the read-only QA network perimeter.
const AVATAR_GET_PATH=/^\/storage\/v1\/object\/authenticated\/iberfit-profile-avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar\.webp$/u;
export function isQaPrivateAvatarRead(request){
  try{
    const url=new URL(request.url());
    const method=request.method().toUpperCase();
    const headers=request.headers?.()||{};
    return url.origin===SUPABASE_ORIGIN&&method==='GET'&&
      !url.hash&&AVATAR_GET_PATH.test(url.pathname)&&
      (!url.search||(url.searchParams.size===1&&
        /^[0-9]{13}-[1-9][0-9]{0,8}$/u.test(String(url.searchParams.get('cacheNonce')||''))))&&
      /^Bearer [A-Za-z0-9_.~-]+$/u.test(String(headers.authorization||headers.Authorization||''));
  }catch{return false;}
}
export async function isQaMissingPrivateAvatarResponse(response){
  if(!isQaPrivateAvatarRead(response.request())||![400,404].includes(response.status()))return false;
  try{
    const body=await response.json();
    return ['NoSuchKey','not_found'].includes(String(body?.code||''))&&
      String(body?.error||'').toLowerCase()!=='unauthorized';
  }catch{return false;}
}
export function unexpectedQaResourceErrors(errors,missingAvatarCount=0){
  const source=Array.isArray(errors)?errors:[];
  let allowed=0;
  const unexpected=[];
  for(const message of source){
    const text=String(message||'');
    if(allowed<missingAvatarCount&&/^Failed to load resource: the server responded with a status of (?:400|404)\b/iu.test(text)){
      ++allowed;
    }else unexpected.push(text);
  }
  return unexpected;
}

function allowedQaRequest(request,readOnlyRpcs,allowQaSyntheticWrite){
  let url;
  try{url=new URL(request.url());}catch{return false;}
  const method=request.method().toUpperCase();
  if(url.origin!==SUPABASE_ORIGIN)return false;
  if(isQaPrivateAvatarRead(request))return true;
  if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password')return true;
  if(method==='POST'&&url.pathname==='/auth/v1/logout')return true;
  if(method==='GET'&&url.pathname==='/auth/v1/user')return true;
  if(method==='GET'&&url.pathname==='/rest/v1/domain_command_registry_v26')return true;
  if(method==='POST'&&url.pathname==='/rest/v1/rpc/iberfit_notification_preferences_status_v1')return true;
  if(isReadOnlyPushConfigRequest(request,url,method))return true;
  const prefix='/rest/v1/rpc/';
  if(method!=='POST'||!url.pathname.startsWith(prefix))return false;
  const rpc=url.pathname.slice(prefix.length);
  if(readOnlyRpcs.has(rpc))return true;
  // Opt-in synthetic E2E only. Normal authenticated browser tests keep the
  // callback defaulting to false and still block every mutation.
  if(!['iberfit_command_preflight_v26','iberfit_execute_command_v26'].includes(rpc))return false;
  try{return allowQaSyntheticWrite(request)===true;}catch{return false;}
}

function buildCandidate(base,relative){
  const candidate=path.resolve(base,relative);
  if(candidate===base||candidate.startsWith(base+path.sep))return candidate;
  return null;
}

async function readCurrentSource(relative){
  const rootCandidate=buildCandidate(BUILD_ROOT,relative);
  if(!rootCandidate)return null;
  try{return {body:await fs.readFile(rootCandidate),candidate:rootCandidate};}catch{}

  const publicCandidate=buildCandidate(PUBLIC_BUILD_ROOT,relative);
  if(!publicCandidate)return null;
  try{return {body:await fs.readFile(publicCandidate),candidate:publicCandidate};}catch{return null;}
}

async function fulfillCurrentSource(route,url){
  let pathname=decodeURIComponent(url.pathname||'/');
  if(pathname==='/'||pathname==='')pathname='/index.html';
  const relative=pathname.replace(/^\/+/, '');
  const resolved=await readCurrentSource(relative);
  if(resolved){
    await route.fulfill({
      status:200,
      body:resolved.body,
      headers:{
        'content-type':mimeFor(resolved.candidate),
        'cache-control':'no-store',
        'x-content-type-options':'nosniff',
      },
    });
    return;
  }

  const extension=path.extname(relative);
  if(!extension){
    const indexCandidate=buildCandidate(BUILD_ROOT,'index.html');
    if(indexCandidate){
      try{
        const body=await fs.readFile(indexCandidate);
        await route.fulfill({
          status:200,
          body,
          headers:{
            'content-type':'text/html; charset=utf-8',
            'cache-control':'no-store',
            'x-content-type-options':'nosniff',
          },
        });
        return;
      }catch{}
    }
  }
  await route.fulfill({status:404,body:'Not found'});
}


// P0 Supabase Free: Only allowlisted anonymous/public exercise-data reads are reusable
// between isolated read-only QA browser contexts in the SAME test worker.
// A run's first read hits the real backend; 10-minute in-process reuse is bounded
// by source process lifetime, 1 MB/entry and 16 entries. No persisted cache.
// All authenticated RPCs, avatars, WebAuthn, user/tenant reads and writes
// still reach the real QA backend on EVERY test. No identity is retained.
const QA_PUBLIC_READ_RPCS=new Set([
  '/rest/v1/rpc/iberfit_exercise_catalog_public_v1',
  '/rest/v1/rpc/iberfit_exercise_measurement_profiles_public_v1',
  '/rest/v1/rpc/iberfit_exercise_media_manifest_v1',
]);
const QA_PUBLIC_TTL_MS=600_000; // QA read-only worker; first real read per source SHA
const QA_PUBLIC_MAX_BYTES=1_000_000;
const QA_PUBLIC_MAX_ENTRIES=16;

function isAnonPublishableKey(value){
  const key=String(value||'').trim();
  if(/^sb_publishable_[A-Za-z0-9_-]{8,}$/u.test(key))return true;
  const parts=key.split('.');
  if(parts.length!==3)return false;
  try{
    const claim=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    return claim?.role==='anon';
  }catch{return false;}
}

function publicRpcMemoKey(request,url){
  try{
    if(url.origin!==SUPABASE_ORIGIN||url.search||url.hash
      ||request.method().toUpperCase()!=='POST'||!QA_PUBLIC_READ_RPCS.has(url.pathname))return null;
    const h=request.headers?.()||{};
    const apiKey=String(h.apikey||'');
    if(!isAnonPublishableKey(apiKey)||String(h.authorization||'')!=='Bearer '+apiKey)return null;
    const raw=String(request.postData?.()||'');
    if(raw.length>200)return null;
    const params=JSON.parse(raw);
    if(!params||typeof params!=='object'||Array.isArray(params))return null;
    if(url.pathname.endsWith('/iberfit_exercise_catalog_public_v1')){
      if(Object.keys(params).sort().join(',')!=='p_limit,p_offset'
        ||!Number.isInteger(params.p_limit)||params.p_limit<1||params.p_limit>200
        ||!Number.isInteger(params.p_offset)||params.p_offset<0||params.p_offset>5000)return null;
    }else if(Object.keys(params).length!==0)return null;
    // No credentials or identifiers in this process-local key.
    return url.pathname+'|'+raw;
  }catch{return null;}
}

// Injectable clock and isolated maps make security/expiry assertions deterministic.
export function createQaPublicRpcMemo({now=()=>Date.now()}={}){
  const cache=new Map(),pending=new Map();
  let networkReads=0,cacheHits=0;
  async function serve(route,request,url){
    const key=publicRpcMemoKey(request,url);
    if(!key)return false;
    const t=now(),found=cache.get(key);
    if(found&&(t<found.createdAt||t-found.createdAt>QA_PUBLIC_TTL_MS))cache.delete(key);
    const live=cache.get(key);
    if(live){
      cacheHits++;
      await route.fulfill({status:200,body:live.body,headers:live.headers});
      return true;
    }
    let work=pending.get(key);
    if(!work){
      work=(async()=>{
        networkReads++;
        // No redirects, no privilege: fetch the ACTUAL QA public RPC once.
        const response=await route.fetch({maxRedirects:0,maxRetries:0});
        const status=response.status(),body=await response.body();
        const headers={
          'content-type':String(response.headers()['content-type']||'application/json'),
          'access-control-allow-origin':'*',
          'x-content-type-options':'nosniff',
        };
        if(status===200&&body.length<=QA_PUBLIC_MAX_BYTES){
          try{
            const rows=JSON.parse(body.toString('utf8'));
            const isMediaManifest=url.pathname==='/rest/v1/rpc/iberfit_exercise_media_manifest_v1';
            const validPublicResponse=isMediaManifest
              ? rows!==null&&typeof rows==='object'&&!Array.isArray(rows)
                &&rows.schemaVersion===1&&rows.source?.provider==='IBERFIT'
                &&Array.isArray(rows.items)&&rows.items.length<=5000
              : Array.isArray(rows)&&rows.length<=5000;
            if(validPublicResponse){
              if(cache.size>=QA_PUBLIC_MAX_ENTRIES)cache.delete(cache.keys().next().value);
              cache.set(key,{createdAt:now(),body,headers});
            }
          }catch{} // Bad/malformed responses always flow through; never cached.
        }
        return {status,body,headers};
      })().finally(()=>pending.delete(key));
      pending.set(key,work);
    }else cacheHits++;
    try{
      const result=await work;
      await route.fulfill(result);
    }catch{
      // Network failure remains a visible QA error, not a fabricated success.
      await route.abort('failed');
    }
    return true;
  }
  return Object.freeze({serve,stats:()=>Object.freeze({networkReads,cacheHits,entries:cache.size})});
}
const qaPublicRpcMemo=createQaPublicRpcMemo();

export async function installCurrentSourceQaNetworkPolicy(context,{readOnlyRpcs,onBlocked=()=>{},onQaRequest=()=>{},allowQaSyntheticWrite=()=>false}){
  // A caller that explicitly supplies a synthetic-write policy is never memoized.
  // Preserve the exact canonical default write-denial contract and its tests.
  const readOnlyContext=!Object.prototype.hasOwnProperty.call(arguments[1]||{},'allowQaSyntheticWrite');
  const safeReadOnlyRpcs=readOnlyRpcs instanceof Set?readOnlyRpcs:new Set(readOnlyRpcs||[]);
  await context.route('**/*',async(route)=>{
    const request=route.request();
    let url;
    try{url=new URL(request.url());}catch{
      onBlocked('INVALID_URL');
      await route.abort('blockedbyclient');
      return;
    }
    if(url.origin===CANARY_ORIGIN){
      await fulfillCurrentSource(route,url);
      return;
    }
    if(allowedQaRequest(request,safeReadOnlyRpcs,allowQaSyntheticWrite)){
      onQaRequest(qaRequestLabel(request));
      // Read-only suites share ONLY anonymous/public catalogue bytes. Synthetic
      // write suites, private reads and all authorization checks bypass memo.
      if(readOnlyContext&&await qaPublicRpcMemo.serve(route,request,url))return;
      await route.continue();
      return;
    }
    onBlocked(qaRequestLabel(request));
    await route.abort('blockedbyclient');
  });
}