import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SHA_RE=/^[0-9a-f]{40}$/u;

function requiredString(value,label){
  const normalized=String(value??'').trim();
  if(!normalized)throw new Error(`${label}_MISSING`);
  return normalized;
}

export function selectCanaryPreviousDeployment({
  live,
  project,
  expectedProject,
  expectedBranch,
  expectedDomain,
  expectedQaRef,
}){
  const sha=String(live?.sourceSha??'').trim().toLowerCase();
  if(!SHA_RE.test(sha))throw new Error('CANARY_PREVIOUS_LIVE_SHA_INVALID');
  if(live?.qaOnly!==true||live?.environment!=='QA'||live?.projectRef!==expectedQaRef){
    throw new Error('CANARY_PREVIOUS_LIVE_IDENTITY_INVALID');
  }

  if(!project?.success||!project?.result)throw new Error('CANARY_CF_PROJECT_LOOKUP_FAILED');
  const result=project.result;
  if(result.name!==expectedProject)throw new Error(`CANARY_WRONG_CF_PROJECT:${result.name}`);
  if(result.production_branch!==expectedBranch)throw new Error(`CANARY_CF_BRANCH_MISMATCH:${result.production_branch}`);
  if(!Array.isArray(result.domains)||!result.domains.includes(expectedDomain))throw new Error('CANARY_DOMAIN_NOT_BOUND');

  const previous=result.canonical_deployment;
  if(!previous||typeof previous!=='object')throw new Error('CANARY_CF_CANONICAL_DEPLOYMENT_MISSING');
  if(previous.environment!=='production')throw new Error(`CANARY_CF_CANONICAL_ENV_INVALID:${previous.environment}`);
  if(previous.is_skipped!==false)throw new Error('CANARY_CF_CANONICAL_DEPLOYMENT_SKIPPED');
  if(previous.latest_stage?.status!=='success')throw new Error(`CANARY_CF_CANONICAL_STATUS_INVALID:${previous.latest_stage?.status}`);
  if(previous.production_branch!==expectedBranch)throw new Error(`CANARY_CF_CANONICAL_BRANCH_MISMATCH:${previous.production_branch}`);
  if(previous.deployment_trigger?.metadata?.branch!==expectedBranch){
    throw new Error(`CANARY_CF_CANONICAL_TRIGGER_BRANCH_MISMATCH:${previous.deployment_trigger?.metadata?.branch}`);
  }

  const canonicalSha=String(previous.deployment_trigger?.metadata?.commit_hash??'').trim().toLowerCase();
  if(!SHA_RE.test(canonicalSha))throw new Error('CANARY_CF_CANONICAL_SHA_INVALID');
  if(canonicalSha!==sha)throw new Error(`CANARY_CF_CANONICAL_SHA_MISMATCH:${canonicalSha}:${sha}`);

  const deploymentId=requiredString(previous.id,'CANARY_CF_CANONICAL_DEPLOYMENT_ID');
  return {previousLiveSha:sha,previousDeploymentId:deploymentId};
}

function runCli(){
  const [livePath,projectPath]=process.argv.slice(2);
  if(!livePath||!projectPath)throw new Error('CANARY_ROLLBACK_SELECTOR_PATHS_REQUIRED');
  const outputPath=requiredString(process.env.GITHUB_ENV,'GITHUB_ENV');
  const live=JSON.parse(fs.readFileSync(livePath,'utf8'));
  const project=JSON.parse(fs.readFileSync(projectPath,'utf8'));
  const selection=selectCanaryPreviousDeployment({
    live,
    project,
    expectedProject:requiredString(process.env.CF_PROJECT,'CF_PROJECT'),
    expectedBranch:requiredString(process.env.CANARY_BRANCH,'CANARY_BRANCH'),
    expectedDomain:requiredString(process.env.CANARY_DOMAIN,'CANARY_DOMAIN'),
    expectedQaRef:requiredString(process.env.QA_SUPABASE_REF,'QA_SUPABASE_REF'),
  });
  fs.appendFileSync(outputPath,`PREVIOUS_LIVE_SHA=${selection.previousLiveSha}\nPREVIOUS_DEPLOYMENT_ID=${selection.previousDeploymentId}\n`);
  console.log(JSON.stringify({ok:true,source:'canonical_deployment',...selection}));
}

const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain)runCli();
