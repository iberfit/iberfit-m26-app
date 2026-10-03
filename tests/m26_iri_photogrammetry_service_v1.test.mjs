import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IRI_PHOTO_BUCKET,
  IRI_PHOTO_CONSENT_VERSION,
  inspectIriPhotoFile,
  iriPhotoCaptureQuality,
  iriPhotoObjectPath,
  latestIriConsent,
  latestIriPhotoCaptures,
  resolveIriPhotogrammetryContext,
  validateIriPhotoFile,
  createIriPhotogrammetryService,
} from '../src/m26/workflows/iri-photogrammetry-service.js';

const CLIENT='11111111-1111-4111-8111-111111111111';
const ASSESSMENT='22222222-2222-4222-8222-222222222222';
const CAPTURE='33333333-3333-4333-8333-333333333333';

function runtime(){
  return {
    enabled:true,
    qaOnly:true,
    projectRef:'gjztkdwfmunnzhtvxrsu',
    url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',
    publishableKey:'pk-test',
    timeoutMs:1000,
    version:'26.0.0-test',
  };
}
function jsonResponse(payload,{status=200}={}){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get:(name)=>String(name).toLowerCase()==='content-type'?'application/json':null},
    json:async()=>payload,
    text:async()=>JSON.stringify(payload),
  };
}

test('photo path is canonical, immutable and scoped by client/assessment/view/capture',()=>{
  assert.equal(
    iriPhotoObjectPath(CLIENT,ASSESSMENT,'front',CAPTURE,'image/jpeg'),
    `${CLIENT}/${ASSESSMENT}/front/${CAPTURE}/original.jpg`
  );
  assert.throws(()=>iriPhotoObjectPath(CLIENT,ASSESSMENT,'diagonal',CAPTURE,'image/jpeg'),/VIEW_INVALID/);
  assert.throws(()=>iriPhotoObjectPath(CLIENT,ASSESSMENT,'front',CAPTURE,'image/webp'),/MIME_INVALID/);
});

test('file inspection hashes original bytes without transforming them and reports capture quality',async()=>{
  const bytes=new TextEncoder().encode('original-photo-bytes');
  const file={
    name:'frontal.jpg',
    type:'image/jpeg',
    size:bytes.byteLength,
    arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),
  };
  assert.deepEqual(validateIriPhotoFile(file),{
    fileName:'frontal.jpg',mimeType:'image/jpeg',sizeBytes:bytes.byteLength,
  });
  const inspected=await inspectIriPhotoFile(file,{
    readDimensions:async()=>({widthPx:1200,heightPx:1800}),
  });
  assert.match(inspected.sha256,/^[0-9a-f]{64}$/u);
  assert.equal(inspected.widthPx,1200);
  assert.equal(inspected.heightPx,1800);
  assert.equal(inspected.quality.level,'good');
  assert.equal(iriPhotoCaptureQuality({widthPx:1200,heightPx:700}).level,'review');
});

test('photogrammetry context is Coach/Admin only and resolves the initial baseline',()=>{
  const base={
    selectedClientId:CLIENT,
    selectedIriAssessmentId:ASSESSMENT,
    collections:{
      clients:[{id:CLIENT}],
      iriAssessments:[
        {id:ASSESSMENT,clientId:CLIENT,assessment_type:'inicial',assessmentDate:'2026-10-02'},
        {id:'44444444-4444-4444-8444-444444444444',clientId:CLIENT,assessment_type:'reevaluacion',assessmentDate:'2026-11-02'},
      ],
    },
  };
  assert.deepEqual(
    resolveIriPhotogrammetryContext({...base,identity:{role:'coach'}}),
    {role:'coach',clientId:CLIENT,assessmentId:ASSESSMENT,canManage:true}
  );
  assert.deepEqual(
    resolveIriPhotogrammetryContext({...base,identity:{role:'admin'}}),
    {role:'admin',clientId:CLIENT,assessmentId:ASSESSMENT,canManage:true}
  );
  assert.equal(resolveIriPhotogrammetryContext({...base,identity:{role:'client',clientId:CLIENT}}).canManage,false);
});

test('latest consent and captures are deterministic and never select pending uploads as visible originals',()=>{
  const consents=[
    {id:'a',consentType:'photography',status:'granted',recordedAt:'2026-10-01T10:00:00Z'},
    {id:'b',consentType:'photography',status:'revoked',recordedAt:'2026-10-02T10:00:00Z'},
  ];
  assert.equal(latestIriConsent(consents,'photography').status,'revoked');
  const latest=latestIriPhotoCaptures([
    {id:'old',view:'front',status:'active',capturedAt:'2026-10-01T10:00:00Z'},
    {id:'pending',view:'front',status:'pending_upload',capturedAt:'2026-10-03T10:00:00Z'},
    {id:'new',view:'front',status:'active',capturedAt:'2026-10-02T10:00:00Z'},
  ]);
  assert.equal(latest.front.id,'new');
});

test('immutable upload treats an existing original as recoverable instead of overwriting it',async()=>{
  const objectPath=iriPhotoObjectPath(CLIENT,ASSESSMENT,'front',CAPTURE,'image/jpeg');
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url,options});
    if(new URL(url).pathname.startsWith(`/storage/v1/object/${IRI_PHOTO_BUCKET}/`)){
      return jsonResponse({message:'The resource already exists'},{status:409});
    }
    throw new Error(`UNEXPECTED_REQUEST:${new URL(url).pathname}`);
  };
  const service=createIriPhotogrammetryService({runtime:runtime(),fetchImpl});
  const file={name:'front.jpg',type:'image/jpeg',size:4,arrayBuffer:async()=>new ArrayBuffer(4)};
  const result=await service.uploadOriginal('jwt-test',{objectPath,file});
  assert.deepEqual(result,{ok:true,kind:'already-present',objectPath});
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.headers['x-upsert'],'false');
});

test('signed original URLs remain short-lived and same-origin',async()=>{
  const objectPath=iriPhotoObjectPath(CLIENT,ASSESSMENT,'front',CAPTURE,'image/jpeg');
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url,options});
    return jsonResponse({signedURL:`/storage/v1/object/sign/${IRI_PHOTO_BUCKET}/${objectPath}?token=qa`});
  };
  const service=createIriPhotogrammetryService({runtime:runtime(),fetchImpl});
  const signed=await service.signedUrl('jwt-test',{objectPath,expiresIn:9999});
  assert.equal(new URL(signed).origin,'https://gjztkdwfmunnzhtvxrsu.supabase.co');
  assert.equal(JSON.parse(calls[0].options.body).expiresIn,600);

  const hostile=createIriPhotogrammetryService({
    runtime:runtime(),
    fetchImpl:async()=>jsonResponse({signedURL:'https://example.invalid/private-photo.jpg'}),
  });
  await assert.rejects(()=>hostile.signedUrl('jwt-test',{objectPath}),/SIGN_ORIGIN_INVALID/);
});

test('service enforces prepare -> immutable upload -> finalize and private state reads',async()=>{
  const calls=[];
  const objectPath=iriPhotoObjectPath(CLIENT,ASSESSMENT,'front',CAPTURE,'image/jpeg');
  const fetchImpl=async(url,options={})=>{
    calls.push({url,options});
    const path=new URL(url).pathname+new URL(url).search;
    if(path.startsWith('/rest/v1/iri_consents_v1?')){
      return jsonResponse([{
        id:'55555555-5555-4555-8555-555555555555',client_id:CLIENT,assessment_id:ASSESSMENT,
        consent_type:'photography',status:'granted',document_version:IRI_PHOTO_CONSENT_VERSION,
        recorded_at:'2026-10-02T10:00:00Z',
      }]);
    }
    if(path.startsWith('/rest/v1/iri_photogrammetry_captures_v1?'))return jsonResponse([]);
    if(path.startsWith('/rest/v1/iri_photogrammetry_analyses_v1?'))return jsonResponse([]);\n    if(path.startsWith('/rest/v1/iri_photogrammetry_analyses_v2?'))return jsonResponse([]);\n    if(path.startsWith('/rest/v1/iri_photo_report_permissions_v1?'))return jsonResponse([]);
    if(path==='/rest/v1/rpc/iberfit_prepare_iri_photo_v1'){
      return jsonResponse({ok:true,kind:'prepared',id:CAPTURE,clientId:CLIENT,assessmentId:ASSESSMENT,view:'front',status:'pending_upload',objectPath,sha256:'a'.repeat(64)});
    }
    if(path.startsWith(`/storage/v1/object/${IRI_PHOTO_BUCKET}/`))return jsonResponse({Key:objectPath});
    if(path==='/rest/v1/rpc/iberfit_finalize_iri_photo_v1'){
      return jsonResponse({ok:true,kind:'ack',id:CAPTURE,clientId:CLIENT,assessmentId:ASSESSMENT,view:'front',status:'active',objectPath,sha256:'a'.repeat(64)});
    }
    throw new Error(`UNEXPECTED_REQUEST:${path}`);
  };
  const service=createIriPhotogrammetryService({runtime:runtime(),fetchImpl});
  const state=await service.state('jwt-test',{assessmentId:ASSESSMENT});
  assert.equal(state.photographyConsent.status,'granted');

  const metadata={
    captureId:CAPTURE,clientId:CLIENT,assessmentId:ASSESSMENT,view:'front',
    fileName:'front.jpg',mimeType:'image/jpeg',sizeBytes:4,sha256:'a'.repeat(64),
    widthPx:1200,heightPx:1800,source:'upload',capturedAt:'2026-10-02T10:10:00Z',objectPath,
  };
  await service.prepareCapture('jwt-test',metadata);
  const file={name:'front.jpg',type:'image/jpeg',size:4,arrayBuffer:async()=>new ArrayBuffer(4)};
  await service.uploadOriginal('jwt-test',{objectPath,file});
  await service.finalizeCapture('jwt-test',{captureId:CAPTURE,clientId:CLIENT,assessmentId:ASSESSMENT});

  const upload=calls.find((call)=>new URL(call.url).pathname.startsWith(`/storage/v1/object/${IRI_PHOTO_BUCKET}/`));
  assert.equal(upload.options.method,'POST');
  assert.equal(upload.options.headers['x-upsert'],'false');
  assert.equal(upload.options.headers['cache-control'],'private, no-store');
  const prepareIndex=calls.findIndex((call)=>new URL(call.url).pathname==='/rest/v1/rpc/iberfit_prepare_iri_photo_v1');
  const uploadIndex=calls.findIndex((call)=>new URL(call.url).pathname.startsWith(`/storage/v1/object/${IRI_PHOTO_BUCKET}/`));
  const finalizeIndex=calls.findIndex((call)=>new URL(call.url).pathname==='/rest/v1/rpc/iberfit_finalize_iri_photo_v1');
  assert.ok(prepareIndex>=0&&prepareIndex<uploadIndex&&uploadIndex<finalizeIndex);
});
