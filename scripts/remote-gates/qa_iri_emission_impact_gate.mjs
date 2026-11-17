import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const SHA=/^[0-9a-f]{40}$/iu;
export const IRI_CERTIFICATION_PATHS=Object.freeze([
  "src/m26/workflows/**",
  "src/m26/security/**",
  "src/m26/app/**",
  "src/m26/supabase-transport.js",
  "supabase/migrations/**",
  "supabase/qa-migrations/**",
  "supabase/qa-rollbacks/**",
  "supabase/functions/iberfit-iri-report-emission-v1/**",
  "supabase/functions/iberfit-qa-iri-document-fixture/**",
  "supabase/functions/iberfit-admin-client-invite-v1/**",
  "scripts/remote-gates/run_qa_iri_report_emission_gate.mjs",
  "scripts/remote-gates/prepare_qa_iri_document_fixture.mjs",
  "scripts/remote-gates/qa_iri_emission_impact_gate.mjs",
  "tests/m26_qa_iri_emission_impact_contract.test.mjs",
  ".github/workflows/qa-real-write-cert.yml"
]);
// Only actual bundled Edge Function code or function deployment configuration
// requires a fresh deploy. All other IRI-sensitive changes still run the
// immutable report certification against the currently deployed QA functions.
export const IRI_BROKER_DEPLOY_PATHS=Object.freeze([
  "supabase/functions/iberfit-iri-report-emission-v1/**",
  "supabase/functions/iberfit-qa-iri-document-fixture/**",
  "supabase/config.toml",
]);
const deployFile=(file)=>IRI_BROKER_DEPLOY_PATHS.some(pattern=>pattern.endsWith('/**')
 ?file.startsWith(pattern.slice(0,-3)+'/')
 :file===pattern);
export function shouldDeployIriBrokers(files,eventName='push'){
 if(eventName==='workflow_dispatch')return true;
 if(!Array.isArray(files)||files.length===0||files.length>4096)return true;
 if(files.some(file=>typeof file!=='string'||!file||file.includes('\\0')))return true;
 return files.some(deployFile);
}
const relevantFile=(file)=>IRI_CERTIFICATION_PATHS.some(pattern=>pattern.endsWith('/**')
 ?file.startsWith(pattern.slice(0,-3)+'/')
 :file===pattern);
export function shouldCertifyIriReport(files,eventName='push'){
 if(eventName==='workflow_dispatch')return true;
 if(!Array.isArray(files)||files.length===0||files.length>4096)return true; // fail closed
 if(files.some(file=>typeof file!=='string'||!file||file.includes('\0')))return true;
 return files.some(relevantFile);
}
export function detectIriImpact({env=process.env,git=execFileSync}={}){
 const eventName=env.QA_IRI_EVENT_NAME||env.GITHUB_EVENT_NAME||'unknown';
 if(eventName==='workflow_dispatch')return {run:true,deploy:true,reason:'manual'};
 if(!['push','pull_request'].includes(eventName))return {run:true,deploy:true,reason:'unknown-event'};
 const base=String(env.QA_IRI_BASE_SHA||'');
 const head=String(env.GITHUB_SHA||'');
 if(!SHA.test(base)||!SHA.test(head)||base===head)return {run:true,deploy:true,reason:'invalid-sha'};
 try{
  // PR merge and Canary squash both include their before/base SHA at depth 2.
  // No authenticated network fetch after checkout (credentials are intentionally erased).
  git('git',['cat-file','-e',base+'^{commit}'],{timeout:5000,stdio:'pipe'});
  const raw=git('git',['diff','--name-only','-z',base,'HEAD'],{timeout:15000,maxBuffer:1024*1024});
  const files=Buffer.from(raw).toString('utf8').split('\0').filter(Boolean);
  return {run:shouldCertifyIriReport(files,eventName),deploy:shouldDeployIriBrokers(files,eventName),reason:'scoped-git-diff',filesCount:files.length};
 }catch{return {run:true,deploy:true,reason:'git-diff-unavailable'};} // never silently skip certification
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const decision=detectIriImpact();
 if(process.env.GITHUB_OUTPUT){
  appendFileSync(process.env.GITHUB_OUTPUT,'run_iri='+(decision.run?'true':'false')+'\n');
  appendFileSync(process.env.GITHUB_OUTPUT,'deploy_iri='+(decision.deploy?'true':'false')+'\n');
 }
 console.log('QA_IRI_REPORT_IMPACT:'+JSON.stringify(decision));
}
