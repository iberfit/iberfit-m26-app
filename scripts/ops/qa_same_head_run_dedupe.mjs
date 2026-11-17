import {appendFileSync} from 'node:fs';

// GitHub-only QA expense gate. A draft/skipped, failed, or outdated run NEVER
// substitutes for real QA. All checks are bound to an exact head/branch/run.
const REQUIRED=new Set([
 'write-persist-idempotency-isolation','M42 private Client avatar real RLS',
 'connected360-v45-authenticated-synthetic-write',
 'M43 real Coach-Client QA E2E','M43 real Client browser current-source',
]);
const WORKFLOW='IBERFIT QA Real Write Certification';
export function priorQaRunCanSubstitute(run,jobs,{sha,branch,currentId}={}){
 if(!run||!Array.isArray(jobs)||run.name!==WORKFLOW||
    run.event!=='pull_request'||run.head_sha!==sha||
    run.head_branch!==branch||!Number.isSafeInteger(Number(run.id))||
    Number(run.id)>=Number(currentId))return false;
 if(run.status==='completed'&&run.conclusion!=='success')return false;
 if(!['completed','in_progress','queued','pending'].includes(run.status))return false;
 const real=jobs.filter(j=>REQUIRED.has(j?.name));
 // Completed runs may have individual required jobs SKIPPED despite an
 // overall successful workflow. Never treat partial coverage as certification.
 if(run.status==='completed')return REQUIRED.size===real.length
    &&real.every(j=>j.conclusion==='success');
 return real.some(j=>['queued','pending','in_progress'].includes(j.status)||
   j.conclusion==='success');
}
export async function qaSameHeadDedupe({repository,sha,branch,runId,token,
 apiBase='https://api.github.com/',fetchImpl=globalThis.fetch}={}){
 if(!/^[0-9a-f]{40}$/u.test(String(sha||''))||
   !/^[A-Za-z0-9][A-Za-z0-9._/-]{1,220}$/u.test(String(branch||''))||
   !/^[1-9][0-9]{0,18}$/u.test(String(runId||''))||
   !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(String(repository||''))||
   !token||typeof fetchImpl!=='function')throw Error('QA_DEDUPE_ARGS_INVALID');
 const api=new URL(apiBase);
 if(api.origin!=='https://api.github.com'||api.pathname!=='/')
   throw Error('QA_DEDUPE_ENDPOINT_INVALID');
 const fetchJson=async path=>{
   const response=await fetchImpl(api.origin+path,{
     headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
       'X-GitHub-Api-Version':'2022-11-28'},
     redirect:'error',signal:AbortSignal.timeout(8000),
   });
   if(!response.ok)throw Error('QA_DEDUPE_GITHUB_HTTP_'+response.status);
   return response.json();
 };
 const params=new URLSearchParams({head_sha:sha,event:'pull_request',per_page:'100'});
 const list=await fetchJson('/repos/'+repository+'/actions/runs?'+params);
 if(!Array.isArray(list.workflow_runs)||Number(list.total_count)>100)
   throw Error('QA_DEDUPE_RUN_LIST_UNVERIFIED');
 const prior=list.workflow_runs.filter(x=>x.name===WORKFLOW&&
   x.event==='pull_request'&&x.head_sha===sha&&x.head_branch===branch&&
   Number(x.id)<Number(runId)&&
   (x.status!=='completed'||x.conclusion==='success'))
   .sort((a,b)=>Number(a.id)-Number(b.id));
 for(const run of prior){
   const response=await fetchJson('/repos/'+repository+'/actions/runs/'+run.id+'/jobs?per_page=100');
   if(!Array.isArray(response.jobs)||Number(response.total_count)>100)
     throw Error('QA_DEDUPE_JOB_LIST_UNVERIFIED');
   if(priorQaRunCanSubstitute(run,response.jobs,{sha,branch,currentId:runId}))
     return Object.freeze({skip:true,priorRunId:Number(run.id)});
 }
 return Object.freeze({skip:false,priorRunId:null});
}
async function main(){
 const e=process.env;
 const outcome=await qaSameHeadDedupe({
  repository:e.GITHUB_REPOSITORY,sha:e.QA_HEAD_SHA,branch:e.QA_HEAD_BRANCH,
  runId:e.GITHUB_RUN_ID,token:e.GH_TOKEN,apiBase:e.GITHUB_API_URL,
 });
 if(!e.GITHUB_OUTPUT)throw Error('QA_DEDUPE_OUTPUT_REQUIRED');
 appendFileSync(e.GITHUB_OUTPUT,'run='+(outcome.skip?'false':'true')+'\n');
 console.log(outcome.skip?'QA_DUPLICATE_SAME_HEAD_SKIP_RUN_'+outcome.priorRunId
   :'QA_UNIQUE_CURRENT_SHA_PROCEED');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(e=>{console.error(String(e?.message||e));process.exitCode=1;});
