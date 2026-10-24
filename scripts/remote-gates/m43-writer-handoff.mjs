import {readFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const REPO='iberfit/iberfit-m26-app';
const artifactName=(runId,attempt)=>`iberfit-m43-real-qa-${runId}-a${attempt}`;
const validRun=v=>/^[1-9][0-9]{0,19}$/.test(String(v||''));
const validAttempt=v=>/^[1-9][0-9]{0,3}$/.test(String(v||''));
const validSha=v=>/^[0-9a-f]{40}$/.test(String(v||''));

export function selectWriterArtifact(artifacts,{runId,currentAttempt}={}){
  if(!validRun(runId)||!validAttempt(currentAttempt)||!Array.isArray(artifacts))
    throw Error('M43_WRITER_HANDOFF_CONTEXT_INVALID');
  const choices=artifacts.filter(a=>{
    if(a?.expired===true||a?.name!==artifactName(runId,String(a.name||'').split('-a').at(-1)))return false;
    const attempt=String(a.name||'').split('-a').at(-1);
    return validAttempt(attempt)&&Number(attempt)<=Number(currentAttempt)
      &&Number.isSafeInteger(Number(a.id))&&Number(a.size_in_bytes)>0;
  }).sort((a,b)=>Number(b.name.split('-a').at(-1))-Number(a.name.split('-a').at(-1)));
  if(!choices[0])throw Error('M43_WRITER_SUCCESS_ARTIFACT_MISSING');
  if(choices[1]&&choices[1].name===choices[0].name)throw Error('M43_WRITER_ARTIFACT_AMBIGUOUS');
  return Object.freeze({name:choices[0].name,attempt:choices[0].name.split('-a').at(-1)});
}

export function verifyWriterEvidence(proof,{runId,writerAttempt,sourceSha}={}){
  if(!validRun(runId)||!validAttempt(writerAttempt)||!validSha(sourceSha))
    throw Error('M43_WRITER_HANDOFF_CONTEXT_INVALID');
  if(proof?.schema!=='iberfit.m43.authenticated-real-qa.v1'
    ||proof?.passed!==true||proof?.phase!=='complete'
    ||proof?.project!=='QA'||proof?.synthetic!==true
    ||proof?.productionTouched!==false||proof?.serviceRoleUsed!==false
    ||proof?.mockBackend!==false
    ||String(proof?.provenance?.runId)!==String(runId)
    ||String(proof?.provenance?.runAttempt)!==String(writerAttempt)
    ||String(proof?.provenance?.sourceSha)!==String(sourceSha))
    throw Error('M43_WRITER_HANDOFF_UNVERIFIED');
  return Object.freeze({runId:String(runId),attempt:String(writerAttempt)});
}

async function main(){
  const mode=process.argv[2],runId=process.env.GITHUB_RUN_ID;
  const currentAttempt=process.env.GITHUB_RUN_ATTEMPT;
  const sourceSha=process.env.GITHUB_SHA,repo=process.env.GITHUB_REPOSITORY;
  if(repo!==REPO||!validRun(runId)||!validAttempt(currentAttempt)||!validSha(sourceSha))
    throw Error('M43_WRITER_GITHUB_CONTEXT_INVALID');
  if(mode==='discover'){
    const token=String(process.env.GH_ACTIONS_TOKEN||'');
    if(!token)throw Error('M43_WRITER_ACTIONS_TOKEN_MISSING');
    const response=await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${runId}/artifacts?per_page=100`,{
      redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',
        authorization:'Bearer '+token},
    });
    if(!response.ok)throw Error('M43_WRITER_ARTIFACT_LOOKUP_FAILED_'+response.status);
    const data=await response.json();
    // A run with 100 or more artifacts could hide an exact earlier attempt.
    if(Number(data.total_count)>=100)throw Error('M43_WRITER_ARTIFACT_INVENTORY_TRUNCATED');
    const found=selectWriterArtifact(data.artifacts,{runId,currentAttempt});
    appendFileSync(process.env.GITHUB_OUTPUT,`name=${found.name}\nwriter_attempt=${found.attempt}\n`);
    console.log('M43_WRITER_ARTIFACT_SELECTED:verified-name-and-attempt');
    return;
  }
  if(mode==='verify'){
    const writerAttempt=String(process.env.M26_M43_SELECTED_WRITER_ATTEMPT||'');
    const json=JSON.parse(readFileSync('.tmp/m43-writer-evidence/coach-client-real-write.json','utf8'));
    const verified=verifyWriterEvidence(json,{runId,writerAttempt,sourceSha});
    appendFileSync(process.env.GITHUB_ENV,`M26_M43_WRITER_ATTEMPT=${verified.attempt}\n`);
    console.log('M43_WRITER_HANDOFF_VERIFIED:exact-run-source-attempt');
    return;
  }
  throw Error('M43_WRITER_HANDOFF_MODE_INVALID');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await main().catch(error=>{
    console.error(String(error?.message||'M43_WRITER_HANDOFF_UNKNOWN'));
    process.exitCode=1;
  });
}
