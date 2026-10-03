import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {File} from 'node:buffer';
import {
  createIriPhotogrammetryService,
  iriPhotoObjectPath,
  IRI_PHOTO_CONSENT_VERSION,
} from '../../src/m26/workflows/iri-photogrammetry-service.js';
import {calculatePhotogrammetryMeasurements} from '../../src/m26/workflows/iri-photogrammetry.js';

const REQUIRED=['M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD'];
for(const key of REQUIRED)if(!String(process.env[key]||'').trim())throw new Error(`IRI_DOCUMENT_FIXTURE_ENV_MISSING:${key}`);

const base=String(process.env.M26_SUPABASE_URL).replace(/\/$/u,'');
const key=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY);
const clientId='57f56a87-d04e-47d5-b1cc-8d4939d7c804';
const assessmentId='7a000000-0000-4000-8000-000000000001';
const evidencePath='recovery/iri-report-emission/qa-fixture-evidence.json';
const captureIds=Object.freeze({
  front:'7b000000-0000-4000-8000-000000000001',
  back:'7b000000-0000-4000-8000-000000000002',
  left:'7b000000-0000-4000-8000-000000000003',
  right:'7b000000-0000-4000-8000-000000000004',
});
const pngBytes=Buffer.from('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','base64');
const sha256=createHash('sha256').update(pngBytes).digest('hex');
const runtime=Object.freeze({
  enabled:true,qaOnly:true,projectRef:'gjztkdwfmunnzhtvxrsu',
  url:base,publishableKey:key,version:'qa-iri-document-fixture-v1',
});

async function login(){
  const response=await fetch(`${base}/auth/v1/token?grant_type=password`,{
    method:'POST',headers:{apikey:key,'content-type':'application/json'},
    body:JSON.stringify({email:process.env.M26_QA_COACH_EMAIL,password:process.env.M26_QA_COACH_PASSWORD}),
    signal:AbortSignal.timeout(30_000),
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body?.access_token)throw new Error(`IRI_DOCUMENT_FIXTURE_AUTH_FAILED:${response.status}`);
  return body.access_token;
}

const landmarks=Object.freeze({
  front:Object.freeze({
    shoulderLeft:{x:.35,y:.28},shoulderRight:{x:.65,y:.30},
    pelvisLeft:{x:.40,y:.55},pelvisRight:{x:.60,y:.54},
  }),
  back:Object.freeze({
    shoulderLeft:{x:.35,y:.29},shoulderRight:{x:.65,y:.31},
    pelvisLeft:{x:.40,y:.55},pelvisRight:{x:.60,y:.54},
  }),
  left:Object.freeze({
    ear:{x:.48,y:.14},shoulder:{x:.50,y:.29},hip:{x:.52,y:.56},ankle:{x:.50,y:.88},
  }),
  right:Object.freeze({
    ear:{x:.52,y:.14},shoulder:{x:.50,y:.29},hip:{x:.48,y:.56},ankle:{x:.50,y:.88},
  }),
});
const dimensionsByView=Object.freeze({
  front:{widthPx:180,heightPx:360},back:{widthPx:180,heightPx:360},
  left:{widthPx:180,heightPx:360},right:{widthPx:180,heightPx:360},
});

const token=await login();
const service=createIriPhotogrammetryService({runtime});
let state=await service.state(token,{assessmentId});

if(state.photographyConsent?.status!=='granted'){
  await service.recordConsent(token,{
    clientId,assessmentId,consentType:'photography',status:'granted',
    documentVersion:IRI_PHOTO_CONSENT_VERSION,
    note:'Fixture sintética QA para certificar el documento IRI; no contiene fotografías reales.',
  });
  state=await service.state(token,{assessmentId});
}

for(const view of Object.keys(captureIds)){
  const captureId=captureIds[view];
  const existing=state.latestCaptures?.[view];
  if(existing?.id===captureId&&existing?.status==='active')continue;
  const file=new File([pngBytes],`qa-photogrammetry-${view}.png`,{type:'image/png'});
  const objectPath=iriPhotoObjectPath(clientId,assessmentId,view,captureId,'image/png');
  await service.prepareCapture(token,{
    captureId,clientId,assessmentId,view,fileName:file.name,mimeType:file.type,sizeBytes:file.size,
    sha256,widthPx:180,heightPx:360,source:'upload',capturedAt:'2026-10-03T21:54:00Z',objectPath,
  });
  await service.uploadOriginal(token,{objectPath,file});
  await service.finalizeCapture(token,{captureId,clientId,assessmentId});
  state=await service.state(token,{assessmentId});
}

state=await service.state(token,{assessmentId});
if(state.analysisV1?.status!=='validated'){
  const measurements=calculatePhotogrammetryMeasurements(landmarks,{dimensionsByView});
  await service.saveAnalysis(token,{
    clientId,assessmentId,baseRevision:Number(state.analysisV1?.revision||0),
    captureIds,validatedLandmarks:landmarks,measurements,validate:true,
  });
  state=await service.state(token,{assessmentId});
}

const views=Object.keys(captureIds);
const activeViews=views.filter((view)=>state.latestCaptures?.[view]?.status==='active');
if(activeViews.length!==4)throw new Error(`IRI_DOCUMENT_FIXTURE_PHOTO_VIEWS_INVALID:${activeViews.length}`);
if(state.analysisV1?.status!=='validated')throw new Error('IRI_DOCUMENT_FIXTURE_ANALYSIS_NOT_VALIDATED');

const evidence={
  schema:'iberfit.qa.iri-document-fixture.v1',
  ok:true,projectRef:runtime.projectRef,assessmentId,clientId,
  synthetic:true,realPersonData:false,
  photographyConsentGranted:true,
  reportPermissionGranted:state.reportPermission?.status==='granted',
  activePhotoViews:activeViews,
  analysisVersion:'v1',
  analysisRevision:Number(state.analysisV1?.revision||0),
  captureIds,
  imageSha256:sha256,
  generatedAt:new Date().toISOString(),
};
fs.mkdirSync(path.dirname(evidencePath),{recursive:true});
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log('IRI_DOCUMENT_QA_FIXTURE=GREEN');
console.log(JSON.stringify(evidence));
