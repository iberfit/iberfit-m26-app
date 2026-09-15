import {mkdir,writeFile} from 'node:fs/promises';
import {evaluateExactSourceChecks,REQUIRED_EXACT_SOURCE_CHECKS} from './exact-source-quality.mjs';

const token=String(process.env.GITHUB_TOKEN||'').trim();
const repository=String(process.env.GITHUB_REPOSITORY||'').trim();
const sourceSha=String(process.env.SOURCE_SHA||'').trim().toLowerCase();
const apiBase=String(process.env.GITHUB_API_URL||'https://api.github.com').replace(/\/$/u,'');
const evidencePath='recovery/exact-source-quality/EXACT_SOURCE_QUALITY.json';

function requiredChecks(){
  const configured=String(process.env.IBERFIT_REQUIRED_SOURCE_CHECKS||'').trim();
  return configured
    ?configured.split(',').map((name)=>name.trim()).filter(Boolean)
    :REQUIRED_EXACT_SOURCE_CHECKS;
}

async function fetchJson(url,{attempts=3}={}){
  let lastError=null;
  for(let attempt=1;attempt<=attempts;attempt+=1){
    try{
      const response=await fetch(url,{
        headers:{
          accept:'application/vnd.github+json',
          authorization:`Bearer ${token}`,
          'x-github-api-version':'2022-11-28',
          'user-agent':'iberfit-exact-source-promotion-gate',
        },
        signal:AbortSignal.timeout(20_000),
      });
      if(response.ok)return await response.json();
      const retryable=[429,502,503,504].includes(response.status);
      const body=await response.text().catch(()=>'');
      lastError=new Error(`EXACT_SOURCE_GITHUB_HTTP_${response.status}:${body.slice(0,120)}`);
      if(!retryable||attempt===attempts)throw lastError;
    }catch(error){
      lastError=error;
      if(attempt===attempts)throw error;
    }
    await new Promise((resolve)=>setTimeout(resolve,250*attempt));
  }
  throw lastError||new Error('EXACT_SOURCE_GITHUB_FETCH_FAILED');
}

async function fetchCheckRuns(){
  const all=[];
  for(let page=1;page<=5;page+=1){
    const url=`${apiBase}/repos/${repository}/commits/${sourceSha}/check-runs?filter=all&per_page=100&page=${page}`;
    const body=await fetchJson(url);
    const runs=Array.isArray(body?.check_runs)?body.check_runs:[];
    all.push(...runs);
    if(runs.length<100)return all;
  }
  throw new Error('EXACT_SOURCE_CHECK_RUN_PAGINATION_LIMIT');
}

async function persist(evidence){
  await mkdir('recovery/exact-source-quality',{recursive:true});
  await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n','utf8');
}

async function main(){
  if(!token)throw new Error('EXACT_SOURCE_GITHUB_TOKEN_MISSING');
  if(!/^[^/]+\/[^/]+$/u.test(repository))throw new Error('EXACT_SOURCE_REPOSITORY_INVALID');
  if(!/^[0-9a-f]{40}$/u.test(sourceSha))throw new Error('EXACT_SOURCE_SHA_INVALID');

  try{
    const checkRuns=await fetchCheckRuns();
    const evaluation=evaluateExactSourceChecks({
      sourceSha,
      checkRuns,
      requiredChecks:requiredChecks(),
    });
    const evidence={
      schema:'iberfit.exact-source-quality.v1',
      generatedAt:new Date().toISOString(),
      repository,
      ...evaluation,
    };
    await persist(evidence);
    console.log(JSON.stringify(evidence,null,2));
    if(!evaluation.ok){
      const missing=evaluation.missing.join(',')||'none';
      const notSuccess=evaluation.notSuccess.map((item)=>`${item.name}:${item.status}/${item.conclusion||'none'}`).join(',')||'none';
      throw new Error(`EXACT_SOURCE_QUALITY_FAILED:missing=${missing};not_success=${notSuccess}`);
    }
  }catch(error){
    try{
      const fallback={
        schema:'iberfit.exact-source-quality.v1',
        generatedAt:new Date().toISOString(),
        repository,
        sourceSha,
        ok:false,
        error:String(error?.message||error||'UNKNOWN').replace(/[\r\n]+/gu,' ').slice(0,500),
      };
      await persist(fallback);
    }catch{}
    throw error;
  }
}

await main();
