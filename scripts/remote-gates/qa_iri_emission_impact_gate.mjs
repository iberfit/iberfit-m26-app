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
  ".github/workflows/qa-real-write-cert.yml"
]);
const IRI_WORKFLOW='.github/workflows/qa-real-write-cert.yml';
const IRI_STEP_NAMES=Object.freeze([
  'Determine whether immutable QA IRI PDF emission needs recertification',
  'Deploy exact QA IRI report brokers',
  'Prepare synthetic private IRI document fixture',
  'Seed synthetic bioimpedance annex through QA OIDC boundary',
  'Certify immutable IRI PDF emission end to end in QA',
]);
// Compare EXACT IRI job guard/steps; unrelated CI scheduling modifications
// must not redeploy unchanged Edge functions or write duplicate QA PDFs.
// Any unknown/missing step or git-show failure is FAIL-CLOSED (certify).
export function iriWorkflowFingerprint(src){
  if(typeof src!=='string')return null;
  const start=src.indexOf('\n  qa-real-write:\n');
  const end=src.indexOf('\n  m43-real-coach-client-qa:',start+1);
  if(start<0||end<=start)return null;
  const job=src.slice(start,end);
  const marker='\n    steps:\n';
  const index=job.indexOf(marker);
  if(index<0)return null;
  const signature=[job.slice(0,index+marker.length)];
  for(const name of IRI_STEP_NAMES){
    const key='\n      - name: '+name+'\n';
    const at=job.indexOf(key);
    if(at<0||job.indexOf(key,at+key.length)>=0)return null;
    const next=job.indexOf('\n      - name: ',at+key.length);
    signature.push(job.slice(at,next<0?job.length:next));
  }
  return signature.join('\n');
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
 if(eventName==='workflow_dispatch')return {run:true,reason:'manual'};
 if(!['push','pull_request'].includes(eventName))return {run:true,reason:'unknown-event'};
 const base=String(env.QA_IRI_BASE_SHA||'');
 const head=String(env.GITHUB_SHA||'');
 if(!SHA.test(base)||!SHA.test(head)||base===head)return {run:true,reason:'invalid-sha'};
 try{
  // PR merge and Canary squash both include their before/base SHA at depth 2.
  // No authenticated network fetch after checkout (credentials are intentionally erased).
  git('git',['cat-file','-e',base+'^{commit}'],{timeout:5000,stdio:'pipe'});
  const raw=git('git',['diff','--name-only','-z',base,'HEAD'],{timeout:15000,maxBuffer:1024*1024});
  const files=Buffer.from(raw).toString('utf8').split('\0').filter(Boolean);
  const hasWorkflow=files.includes(IRI_WORKFLOW);
  if(hasWorkflow){
    const previous=git('git',['show',base+':'+IRI_WORKFLOW],{timeout:15000,maxBuffer:2*1024*1024});
    const current=git('git',['show','HEAD:'+IRI_WORKFLOW],{timeout:15000,maxBuffer:2*1024*1024});
    const was=iriWorkflowFingerprint(Buffer.from(previous).toString('utf8'));
    const now=iriWorkflowFingerprint(Buffer.from(current).toString('utf8'));
    if(!was||!now||was!==now)return {run:true,reason:'iri-workflow-changed',filesCount:files.length};
    const remaining=files.filter(file=>file!==IRI_WORKFLOW);
    if(remaining.length===0)return {run:false,reason:'unrelated-workflow-change',filesCount:files.length};
    return {run:shouldCertifyIriReport(remaining,eventName),reason:'scoped-git-diff',filesCount:files.length};
  }
  return {run:shouldCertifyIriReport(files,eventName),reason:'scoped-git-diff',filesCount:files.length};
 }catch{return {run:true,reason:'git-diff-unavailable'};} // never silently skip certification
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const decision=detectIriImpact();
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'run_iri='+(decision.run?'true':'false')+'\n');
 console.log('QA_IRI_REPORT_IMPACT:'+JSON.stringify(decision));
}
