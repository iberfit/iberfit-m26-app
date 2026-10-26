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

export async function installCurrentSourceQaNetworkPolicy(context,{readOnlyRpcs,onBlocked=()=>{},onQaRequest=()=>{},allowQaSyntheticWrite=()=>false}){
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
      await route.continue();
      return;
    }
    onBlocked(qaRequestLabel(request));
    await route.abort('blockedbyclient');
  });
}