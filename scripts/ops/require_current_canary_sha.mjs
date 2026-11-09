// P0 Supabase Free: never spend QA bandwidth certifying a superseded Canary push.
// No Supabase calls, user data, JWTs, or test bypass. Current SHA runs every gate.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const REPO='iberfit/iberfit-m26-app';
const REF='refs/heads/canary/rc74-4';
const SHA_PATTERN=/^[a-f0-9]{40}$/u;
export async function requireCurrentCanarySha({env=process.env,fetchImpl=globalThis.fetch}={}){
  // Manually requested certification and PR checks retain their existing paths.
  if(env.GITHUB_EVENT_NAME!=='push')return {checked:false,current:true};
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!==REF)
    throw new Error('P0_QA_CANARY_SOURCE_MISMATCH');
  const expected=String(env.GITHUB_SHA||'');
  if(!SHA_PATTERN.test(expected))throw new Error('P0_QA_INVALID_WORKFLOW_SHA');
  const token=String(env.GH_READ_TOKEN||'');
  if(!token)throw new Error('P0_QA_GITHUB_READ_TOKEN_MISSING');
  const api=String(env.GITHUB_API_URL||'https://api.github.com');
  if(api!=='https://api.github.com')throw new Error('P0_QA_GITHUB_API_ORIGIN_INVALID');
  let response;
  try{
    response=await fetchImpl(api+'/repos/'+REPO+'/git/ref/heads/canary/rc74-4',{
      method:'GET',
      headers:{
        'accept':'application/vnd.github+json',
        'authorization':'Bearer '+token,
        'x-github-api-version':'2022-11-28'
      },
      signal:AbortSignal.timeout(8000)
    });
  }catch{
    throw new Error('P0_QA_CANARY_HEAD_READ_FAILED');
  }
  if(!response?.ok)throw new Error('P0_QA_CANARY_HEAD_HTTP_FAILURE');
  const data=await response.json().catch(()=>null);
  const live=String(data?.object?.sha||'');
  if(!SHA_PATTERN.test(live))throw new Error('P0_QA_CANARY_HEAD_INVALID');
  // Fail this outdated run explicitly; NEVER mark unexecuted gates green.
  // Newer SHA receives its own complete, uncancelled certifications.
  if(live!==expected)throw new Error('P0_QA_SUPERSEDED_CANARY_SHA_SKIP');
  return {checked:true,current:true};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  await requireCurrentCanarySha();
  console.log('P0_QA_CURRENT_CANARY_SHA_VERIFIED');
}
