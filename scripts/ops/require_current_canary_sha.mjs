// P0 Supabase Free: do not spend authenticated QA bandwidth on stale source.
// Check protected Canary pushes AND queued PR revisions AFTER acquiring QA mutex.
// This issues only a read-only GitHub API request, never a Supabase request.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const REPO='iberfit/iberfit-m26-app';
const REF='refs/heads/canary/rc74-4';
const TARGET='canary/rc74-4';
const SHA_PATTERN=/^[a-f0-9]{40}$/u;
const PR_NUMBER_PATTERN=/^[1-9][0-9]{0,8}$/u;

// A current-head check may briefly meet GitHub's secondary rate limit or
// 5xx during a large authenticated QA matrix. Only GET is retried; after
// every successful HTTP response the original exact-SHA/draft/target checks
// run unchanged. Never retry an ordinary 401/403 or interpret failures as OK.
export function retryableCurrentSourceRead(response){
  const code=Number(response?.status);
  if([429,502,503,504].includes(code))return true;
  if(code!==403)return false;
  const retryAfter=response?.headers?.get?.('retry-after');
  const remaining=response?.headers?.get?.('x-ratelimit-remaining');
  return (retryAfter!==null&&retryAfter!==undefined)||remaining==='0';
}
async function githubRead({env,fetchImpl,path,sleep}){
  const token=String(env.GH_READ_TOKEN||'');
  if(!token)throw new Error('P0_QA_GITHUB_READ_TOKEN_MISSING');
  const api=String(env.GITHUB_API_URL||'https://api.github.com');
  if(api!=='https://api.github.com')throw new Error('P0_QA_GITHUB_API_ORIGIN_INVALID');
  let response;
  const pause=typeof sleep==='function'?sleep:(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  for(let attempt=0;attempt<3;attempt++){
    try{
      response=await fetchImpl(api+'/repos/'+REPO+path,{
        method:'GET',
        headers:{
          accept:'application/vnd.github+json',
          authorization:'Bearer '+token,
          'x-github-api-version':'2022-11-28'
        },
        signal:AbortSignal.timeout(8000)
      });
    }catch{
      // Transport uncertainty is not proof that the SHA is still current.
      throw new Error('P0_QA_CANARY_HEAD_READ_FAILED');
    }
    if(response?.ok)break;
    if(attempt===2||!retryableCurrentSourceRead(response))
      throw new Error('P0_QA_CANARY_HEAD_HTTP_FAILURE_'+String(response?.status||'UNKNOWN'));
    const after=Number(response.headers?.get?.('retry-after'));
    const backoff=attempt===0?1500:3000;
    const delay=Number.isFinite(after)&&after>0?Math.max(backoff,after*1000):backoff;
    if(delay>8000)throw new Error('P0_QA_GITHUB_RATE_LIMIT_RETRY_TOO_LONG');
    await pause(delay);
  }
  if(!response?.ok)throw new Error('P0_QA_CANARY_HEAD_HTTP_FAILURE');
  const payload=await response.json().catch(()=>null);
  if(!payload||typeof payload!=='object')throw new Error('P0_QA_CANARY_HEAD_INVALID');
  return payload;
}

export async function requireCurrentCanarySha({
  env=process.env,
  fetchImpl=globalThis.fetch,
  eventReader=async path=>JSON.parse(await readFile(path,'utf8')),
  sleep
}={}){
  // Explicitly dispatched maintenance jobs retain their existing coverage.
  if(!['push','pull_request'].includes(env.GITHUB_EVENT_NAME))
    return {checked:false,current:true};
  if(env.GITHUB_REPOSITORY!==REPO)throw new Error('P0_QA_CANARY_SOURCE_MISMATCH');

  if(env.GITHUB_EVENT_NAME==='pull_request'){
    // The earlier pr-current-head job checks BEFORE queueing. By the time
    // this job obtains the shared QA mutex, a newer commit may have arrived.
    const eventFile=String(env.GITHUB_EVENT_PATH||'');
    if(!eventFile)throw new Error('P0_QA_PR_EVENT_MISSING');
    let event;
    try{event=await eventReader(eventFile);}catch{throw new Error('P0_QA_PR_EVENT_INVALID');}
    const pr=event?.pull_request;
    const number=String(event?.number??pr?.number??'');
    const expected=String(pr?.head?.sha||'');
    if(!PR_NUMBER_PATTERN.test(number)||!SHA_PATTERN.test(expected))
      throw new Error('P0_QA_PR_IDENTITY_INVALID');
    if(env.GITHUB_REF!==`refs/pull/${number}/merge`||
      pr?.base?.ref!==TARGET||pr?.base?.repo?.full_name!==REPO)
      throw new Error('P0_QA_PR_TARGET_MISMATCH');
    if(pr?.draft===true)throw new Error('P0_QA_SUPERSEDED_PR_SKIP');
    const live=await githubRead({env,fetchImpl,path:'/pulls/'+number,sleep});
    if(live.state!=='open'||live.draft!==false||
      live.base?.ref!==TARGET||live.base?.repo?.full_name!==REPO||
      !SHA_PATTERN.test(String(live.head?.sha||''))||live.head.sha!==expected)
      throw new Error('P0_QA_SUPERSEDED_PR_SKIP');
    return {checked:true,current:true};
  }

  if(env.GITHUB_REF!==REF)throw new Error('P0_QA_CANARY_SOURCE_MISMATCH');
  const expected=String(env.GITHUB_SHA||'');
  if(!SHA_PATTERN.test(expected))throw new Error('P0_QA_INVALID_WORKFLOW_SHA');
  const data=await githubRead({env,fetchImpl,path:'/git/ref/heads/canary/rc74-4',sleep});
  const live=String(data.object?.sha||'');
  if(!SHA_PATTERN.test(live))throw new Error('P0_QA_CANARY_HEAD_INVALID');
  // Fail stale runs explicitly; no false GREEN. The current SHA remains gated.
  if(live!==expected)throw new Error('P0_QA_SUPERSEDED_CANARY_SHA_SKIP');
  return {checked:true,current:true};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  await requireCurrentCanarySha();
  console.log('P0_QA_CURRENT_SOURCE_VERIFIED');
}
