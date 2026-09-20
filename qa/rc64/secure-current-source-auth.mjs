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

function allowedQaRequest(request,readOnlyRpcs){
  let url;
  try{url=new URL(request.url());}catch{return false;}
  const method=request.method().toUpperCase();
  if(url.origin!==SUPABASE_ORIGIN)return false;
  if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password')return true;
  if(method==='POST'&&url.pathname==='/auth/v1/logout')return true;
  if(method==='GET'&&url.pathname==='/auth/v1/user')return true;
  if(method==='GET'&&url.pathname==='/rest/v1/domain_command_registry_v26')return true;
  if(method==='POST'&&url.pathname==='/rest/v1/rpc/iberfit_notification_preferences_status_v1')return true;
  if(isReadOnlyPushConfigRequest(request,url,method))return true;
  const prefix='/rest/v1/rpc/';
  return method==='POST'&&url.pathname.startsWith(prefix)&&readOnlyRpcs.has(url.pathname.slice(prefix.length));
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

export async function installCurrentSourceQaNetworkPolicy(context,{readOnlyRpcs,onBlocked=()=>{},onQaRequest=()=>{}}){
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
    if(allowedQaRequest(request,safeReadOnlyRpcs)){
      onQaRequest(qaRequestLabel(request));
      await route.continue();
      return;
    }
    onBlocked(qaRequestLabel(request));
    await route.abort('blockedbyclient');
  });
}