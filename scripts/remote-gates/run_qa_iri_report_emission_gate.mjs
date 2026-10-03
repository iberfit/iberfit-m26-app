import fs from 'node:fs';
import path from 'node:path';

const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
];
for(const key of REQUIRED)if(!String(process.env[key]||'').trim())throw new Error(`IRI_REPORT_QA_ENV_MISSING:${key}`);

const base=String(process.env.M26_SUPABASE_URL).replace(/\/$/u,'');
const key=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY);
const origin='https://m26-canary.iberfit.cl';
const assessmentId='7a000000-0000-4000-8000-000000000001';
const endpoint=`${base}/functions/v1/iberfit-iri-report-emission-v1`;
const evidencePath='recovery/iri-report-emission/qa-evidence.json';
const clientPdfPath='recovery/iri-report-emission/qa-issued-client.pdf';
const coachPdfPath='recovery/iri-report-emission/qa-issued-coach.pdf';
const pdfEvidencePath='recovery/iri-report-emission/qa-issued-report.pdf';
const hash=/^[0-9a-f]{64}$/u;

async function request(url,init={},attempts=2){
  let last;
  for(let i=0;i<attempts;i+=1){
    try{
      const response=await fetch(url,{...init,signal:AbortSignal.timeout(190_000)});
      if(i===0&&[502,503,504].includes(response.status)){await new Promise(r=>setTimeout(r,750));continue;}
      return response;
    }catch(error){last=error;if(i===0){await new Promise(r=>setTimeout(r,750));continue;}throw error;}
  }
  throw last||new Error('IRI_REPORT_QA_REQUEST_FAILED');
}
async function login(email,password){
  const response=await request(`${base}/auth/v1/token?grant_type=password`,{
    method:'POST',
    headers:{apikey:key,'content-type':'application/json'},
    body:JSON.stringify({email,password}),
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body?.access_token||!body?.user?.id)throw new Error(`IRI_REPORT_QA_AUTH_FAILED:${response.status}`);
  return {token:body.access_token,userId:body.user.id};
}
function authHeaders(token){
  return {apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json',origin};
}
async function action(token,actionName,payload={}){
  const response=await request(endpoint,{
    method:'POST',headers:authHeaders(token),body:JSON.stringify({action:actionName,...payload}),
  });
  const body=await response.json().catch(()=>({}));
  return {status:response.status,body};
}
function assert(condition,code){if(!condition)throw new Error(code);}

const [coach,client]=await Promise.all([
  login(process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD),
  login(process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD),
]);

const health=await action(coach.token,'health');
assert(health.status===200&&health.body?.ok===true,'IRI_REPORT_QA_HEALTH_FAILED');
assert(health.body?.rendererConfigured===true,'IRI_REPORT_QA_RENDERER_NOT_CONFIGURED');
assert(health.body?.projectRef==='gjztkdwfmunnzhtvxrsu','IRI_REPORT_QA_PROJECT_REF_MISMATCH');

const clientIssue=await action(client.token,'issue',{assessmentId,audience:'client'});
assert(clientIssue.status===403,'IRI_REPORT_QA_CLIENT_ISSUE_NOT_DENIED');

const issued=await action(coach.token,'issue',{assessmentId,audience:'client'});
assert(issued.status===200&&issued.body?.ok===true,`IRI_REPORT_QA_ISSUE_FAILED:${issued.status}:${String(issued.body?.code||'NO_CODE')}`);
assert(/^[0-9a-f-]{36}$/iu.test(String(issued.body?.issuanceId||'')),'IRI_REPORT_QA_ISSUANCE_ID_INVALID');
assert(Number(issued.body?.version||0)>=1,'IRI_REPORT_QA_VERSION_INVALID');
assert(hash.test(String(issued.body?.artifactSha256||'')),'IRI_REPORT_QA_ARTIFACT_HASH_INVALID');
assert(hash.test(String(issued.body?.sourceSha256||'')),'IRI_REPORT_QA_SOURCE_HASH_INVALID');

const coachIssued=await action(coach.token,'issue',{assessmentId,audience:'coach'});
assert(coachIssued.status===200&&coachIssued.body?.ok===true,`IRI_REPORT_QA_COACH_ISSUE_FAILED:${coachIssued.status}:${String(coachIssued.body?.code||'NO_CODE')}`);
assert(/^[0-9a-f-]{36}$/iu.test(String(coachIssued.body?.issuanceId||'')),'IRI_REPORT_QA_COACH_ISSUANCE_ID_INVALID');
assert(Number(coachIssued.body?.version||0)>=1,'IRI_REPORT_QA_COACH_VERSION_INVALID');
assert(hash.test(String(coachIssued.body?.artifactSha256||'')),'IRI_REPORT_QA_COACH_ARTIFACT_HASH_INVALID');
assert(hash.test(String(coachIssued.body?.sourceSha256||'')),'IRI_REPORT_QA_COACH_SOURCE_HASH_INVALID');
assert(coachIssued.body.artifactSha256!==issued.body.artifactSha256,'IRI_REPORT_QA_AUDIENCE_ARTIFACTS_NOT_DISTINCT');

const history=await action(coach.token,'history',{assessmentId});
assert(history.status===200&&history.body?.ok===true,'IRI_REPORT_QA_HISTORY_FAILED');
const historyItem=(history.body?.items||[]).find((item)=>item?.issuanceId===issued.body.issuanceId);
assert(historyItem&&historyItem.withdrawn===false,'IRI_REPORT_QA_HISTORY_ISSUANCE_MISSING');
assert(historyItem.artifactSha256===issued.body.artifactSha256,'IRI_REPORT_QA_HISTORY_HASH_MISMATCH');

const coachHistoryItem=(history.body?.items||[]).find((item)=>item?.issuanceId===coachIssued.body.issuanceId);
assert(coachHistoryItem&&coachHistoryItem.withdrawn===false,'IRI_REPORT_QA_COACH_HISTORY_ISSUANCE_MISSING');
assert(coachHistoryItem.artifactSha256===coachIssued.body.artifactSha256,'IRI_REPORT_QA_COACH_HISTORY_HASH_MISMATCH');

const clientHistory=await action(client.token,'history',{assessmentId});
assert(clientHistory.status===200&&clientHistory.body?.ok===true,'IRI_REPORT_QA_CLIENT_HISTORY_FAILED');
assert(clientHistory.body?.manager===false,'IRI_REPORT_QA_CLIENT_HISTORY_MANAGER_LEAK');
const clientItem=(clientHistory.body?.items||[]).find((item)=>item?.issuanceId===issued.body.issuanceId);
assert(clientItem,'IRI_REPORT_QA_CLIENT_HISTORY_ISSUANCE_MISSING');
assert(clientItem.artifactSha256===null&&clientItem.issuedBy===null,'IRI_REPORT_QA_CLIENT_HISTORY_PRIVATE_METADATA_LEAK');

assert(!(clientHistory.body?.items||[]).some((item)=>item?.issuanceId===coachIssued.body.issuanceId),'IRI_REPORT_QA_COACH_DOCUMENT_LEAKED_TO_CLIENT_HISTORY');

const opened=await action(client.token,'open',{issuanceId:issued.body.issuanceId});
assert(opened.status===200&&opened.body?.ok===true&&opened.body?.signedUrl,'IRI_REPORT_QA_OPEN_FAILED');
const pdfResponse=await request(opened.body.signedUrl,{headers:{origin},redirect:'error'},1);
assert(pdfResponse.ok,'IRI_REPORT_QA_PDF_DOWNLOAD_FAILED');
const pdfBytes=new Uint8Array(await pdfResponse.arrayBuffer());
assert(pdfBytes.byteLength>1_000,'IRI_REPORT_QA_PDF_TOO_SMALL');
assert(new TextDecoder().decode(pdfBytes.slice(0,5))==='%PDF-','IRI_REPORT_QA_PDF_MAGIC_INVALID');

const clientCoachOpen=await action(client.token,'open',{issuanceId:coachIssued.body.issuanceId});
assert(clientCoachOpen.status===403,'IRI_REPORT_QA_COACH_DOCUMENT_OPEN_NOT_DENIED_TO_CLIENT');

const coachOpened=await action(coach.token,'open',{issuanceId:coachIssued.body.issuanceId});
assert(coachOpened.status===200&&coachOpened.body?.ok===true&&coachOpened.body?.signedUrl,'IRI_REPORT_QA_COACH_OPEN_FAILED');
const coachPdfResponse=await request(coachOpened.body.signedUrl,{headers:{origin},redirect:'error'},1);
assert(coachPdfResponse.ok,'IRI_REPORT_QA_COACH_PDF_DOWNLOAD_FAILED');
const coachPdfBytes=new Uint8Array(await coachPdfResponse.arrayBuffer());
assert(coachPdfBytes.byteLength>1_000,'IRI_REPORT_QA_COACH_PDF_TOO_SMALL');
assert(new TextDecoder().decode(coachPdfBytes.slice(0,5))==='%PDF-','IRI_REPORT_QA_COACH_PDF_MAGIC_INVALID');
fs.mkdirSync(path.dirname(pdfEvidencePath),{recursive:true});
fs.writeFileSync(pdfEvidencePath,pdfBytes);

const withdraw=await action(coach.token,'withdraw',{issuanceId:issued.body.issuanceId,reason:'QA debe exigir assurance reforzada para retirar'});
assert(withdraw.status===403,'IRI_REPORT_QA_WITHDRAW_NOT_ASSURANCE_PROTECTED');

const evidence={
  schema:'iberfit.qa.iri-report-emission.v1',
  ok:true,
  projectRef:health.body.projectRef,
  functionVersion:health.body.version,
  rendererConfigured:true,
  renderer:String(health.body.renderer||''),
  assessmentId,
  issuanceId:issued.body.issuanceId,
  version:Number(issued.body.version),
  artifactSha256:issued.body.artifactSha256,
  sourceSha256:issued.body.sourceSha256,
  artifactBytes:pdfBytes.byteLength,
  coachIssuanceId:coachIssued.body.issuanceId,
  coachVersion:Number(coachIssued.body.version),
  coachArtifactSha256:coachIssued.body.artifactSha256,
  coachSourceSha256:coachIssued.body.sourceSha256,
  coachArtifactBytes:coachPdfBytes.byteLength,
  clientIssueDenied:true,
  clientHistoryPrivateMetadataHidden:true,
  clientOpenVerified:true,
  coachDocumentHiddenFromClient:true,
  coachOpenVerified:true,
  withdrawalRequiresPrivilegedAssurance:true,
  generatedAt:new Date().toISOString(),
};
fs.mkdirSync(path.dirname(evidencePath),{recursive:true});
fs.writeFileSync(clientPdfPath,pdfBytes);
fs.writeFileSync(coachPdfPath,coachPdfBytes);
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log('IRI_REPORT_QA_EMISSION=GREEN');
console.log(JSON.stringify(evidence));
