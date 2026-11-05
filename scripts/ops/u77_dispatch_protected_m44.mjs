/**
 * U77: dispatch EXISTING protected-Canary M44 official backup workflow
 * exactly once without PROD database/Storage/encryption secrets on this branch.
 * Dispatch accepted != backup completed != production promotion authorized.
 */
export const REPO='iberfit/iberfit-m26-app';
export const FEATURE='feat/u60-training360-r50-reconciled-20261104';
export const CANARY='canary/rc74-4';
export const CANARY_SHA='008d8647356c4f5b36dc86500fb19b4324ce26c4';
export const WORKFLOW='m44-encrypted-disaster-recovery.yml';
export const CONFIRM='BACKUP_ENCRYPT_AND_VERIFY_PROD';
const SHA=/^[0-9a-f]{40}$/;
function verify(v,reason){if(!v)throw Error('U77_'+reason);}
export function validateContext(e){
 verify(e.GITHUB_REPOSITORY===REPO,'REPOSITORY_MISMATCH');
 verify(e.GITHUB_REF==='refs/heads/'+FEATURE,'SOURCE_BRANCH_MISMATCH');
 verify(e.GITHUB_EVENT_NAME==='push','ONLY_PUSH');
 verify(e.GITHUB_RUN_ATTEMPT==='1','NO_RETRY_DISPATCH');
 verify(SHA.test(e.GITHUB_SHA||''),'SOURCE_SHA_MISSING');
 verify(typeof e.GITHUB_TOKEN==='string'&&e.GITHUB_TOKEN.length>20,'ACTION_TOKEN_MISSING');
}
export function dispatchPayload(){
 return Object.freeze({ref:CANARY,inputs:Object.freeze({confirmation:CONFIRM})});
}
async function github(path,e,options={}){
 const response=await fetch('https://api.github.com/repos/'+REPO+'/'+path,{
  method:options.method||'GET',
  headers:{Authorization:'Bearer '+e.GITHUB_TOKEN,
   Accept:'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28',
   ...(options.body?{'Content-Type':'application/json'}:{})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),
  redirect:'error',signal:AbortSignal.timeout(12000),
 });
 return response;
}
async function main(){
 const e=process.env;validateContext(e);
 const ref=await github('git/ref/heads/'+CANARY,e);
 verify(ref.ok,'CANARY_REF_UNAVAILABLE');
 const branch=await ref.json();
 verify(branch?.ref==='refs/heads/'+CANARY&&branch.object?.sha===CANARY_SHA,
  'CANARY_BASE_MOVED');
 const head=await github('git/ref/heads/'+FEATURE,e);
 verify(head.ok,'SOURCE_REF_UNAVAILABLE');
 const source=await head.json();
 verify(source?.object?.sha===e.GITHUB_SHA,'SOURCE_HEAD_MOVED');
 const recent=await github('actions/workflows/'+WORKFLOW+'/runs?branch='+
  encodeURIComponent(CANARY)+'&per_page=30',e);
 verify(recent.ok,'CANARY_M44_RUNS_UNAVAILABLE');
 const runs=await recent.json();
 verify(Array.isArray(runs?.workflow_runs),'M44_RUNS_INVALID');
 const active=runs.workflow_runs.some(r=>r.head_branch===CANARY&&
   ['workflow_dispatch','push'].includes(r.event)&&
   ['queued','in_progress','requested','waiting','pending'].includes(r.status));
 if(active){
  process.stdout.write('IBERFIT_U77_M44_ALREADY_RUNNING_NO_DUPLICATE_DISPATCH\n');
  return;
 }
 const response=await github('actions/workflows/'+WORKFLOW+'/dispatches',e,{
  method:'POST',body:dispatchPayload(),
 });
 verify(response.status===204,'PROTECTED_M44_DISPATCH_REJECTED_STATUS_'+response.status);
 process.stdout.write('IBERFIT_U77_PROTECTED_CANARY_M44_DISPATCH_ACCEPTED_NO_RESTORE_CLAIM\n');
}
if(process.argv[1]?.endsWith('/u77_dispatch_protected_m44.mjs')){
 main().catch(err=>{
  process.stderr.write('IBERFIT_U77_FAIL_CLOSED:'+
   String(err?.message||'UNEXPECTED').replace(/[^A-Za-z0-9_:]/g,'').slice(0,100)+'\n');
  process.exitCode=1;
 });
}
