import {createClient} from 'npm:@supabase/supabase-js@2.112.4';
import {PDFDocument} from 'npm:pdf-lib@1.17.1';
import {buildIriReportHtml} from './vendor/workflows/iri-report-document.js';
import {confirmedFirstSessionDraft,validateFirstSessionDraft} from './vendor/workflows/iri-first-session.js';
import {
  IRI_PHOTO_VIEWS,
  normalizeManualLandmarks,
  validateManualLandmarks,
} from './vendor/workflows/iri-photogrammetry.js';
import {
  normalizePhotoCalibrations,
  interpretPhotogrammetryMeasurementsV2,
  photogrammetryDataQualityV2,
} from './vendor/workflows/iri-photogrammetry-v2.js';

const FUNCTION_VERSION='iri-report-emission-2026.10-v1';
const TEMPLATE_VERSION='m26-iri-report-premium-v2';
const ENGINE_VERSION='iri-document-governance-2026.10-v1';
const ISSUED_BUCKET='iberfit-iri-issued-reports';
const EXTERNAL_PDF_MAX_PAGES=24;
const MAX_REQUEST_CHARS=24_000;
const MAX_ARTIFACT_BYTES=78_643_200;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256=/^[0-9a-f]{64}$/u;
const QA_REF='gjztkdwfmunnzhtvxrsu';
const PROD_REF='pjhmrhejsoofmouedavw';

function text(value:unknown,max=2000){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max);
}
function deploymentRef(value:string){
  try{return new URL(value).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u)?.[1]||'';}catch{return '';}
}
function jsonEnv(primary:string,legacy:string){
  const raw=Deno.env.get(primary);
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      const value=String(parsed?.default||Object.values(parsed||{})[0]||'').trim();
      if(value)return value;
    }catch{}
  }
  return String(Deno.env.get(legacy)||'').trim();
}
function allowedOrigins(projectRef:string){
  if(projectRef===QA_REF)return new Set(['https://m26-canary.iberfit.cl']);
  if(projectRef===PROD_REF)return new Set(['https://app.iberfit.cl','https://coach.iberfit.cl']);
  return new Set<string>();
}
function canonicalAppOrigin(projectRef:string){
  if(projectRef===QA_REF)return 'https://m26-canary.iberfit.cl';
  if(projectRef===PROD_REF)return 'https://app.iberfit.cl';
  return '';
}
function cors(origin:string,allowed:Set<string>){
  const headers:Record<string,string>={
    'access-control-allow-headers':'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods':'POST, OPTIONS',
    'access-control-max-age':'600',
    'cache-control':'no-store',
    'content-type':'application/json; charset=utf-8',
    'vary':'Origin',
    'x-content-type-options':'nosniff',
    'x-iberfit-function-version':FUNCTION_VERSION,
  };
  if(allowed.has(origin))headers['access-control-allow-origin']=origin;
  return headers;
}
function json(status:number,body:unknown,origin:string,allowed:Set<string>){
  return new Response(status===204?null:JSON.stringify(body),{status,headers:cors(origin,allowed)});
}
function codeOf(error:unknown,fallback='IRI_REPORT_EMISSION_FAILED'){
  const raw=String((error as {message?:string})?.message||error||'').toUpperCase();
  return raw.match(/\b(?:IRI|M26|V26)_[A-Z0-9_:-]{3,120}\b/u)?.[0]||fallback;
}
function assertUuid(value:unknown,code:string){
  const id=text(value,80);if(!UUID.test(id))throw new Error(code);return id;
}
function audienceDb(value:unknown){
  const v=text(value,20).toLowerCase();
  if(v==='client'||v==='cliente')return 'cliente';
  if(v==='coach')return 'coach';
  throw new Error('IRI_REPORT_AUDIENCE_INVALID');
}
function audienceRenderer(value:string){return value==='cliente'?'client':'coach';}
function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  }
  return value;
}
function stableJson(value:unknown){return JSON.stringify(stable(value));}
async function sha256(bytes:Uint8Array|string){
  const source=typeof bytes==='string'?new TextEncoder().encode(bytes):bytes;
  const digest=await crypto.subtle.digest('SHA-256',source);
  return [...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,'0')).join('');
}
function latestByView(rows:any[]){
  const out:Record<string,any>={};
  for(const row of rows||[]){
    const view=String(row?.view||'');
    if(!IRI_PHOTO_VIEWS.includes(view as any)||out[view])continue;
    if(String(row?.status||'').toLowerCase()!=='active'||row?.revoked_at)continue;
    out[view]=row;
  }
  return out;
}
function analysisCaptureId(analysis:any,view:string){return analysis?.[`${view}_capture_id`]||null;}
function linkedLandmarks(analysis:any,captures:Record<string,any>){
  const normalized=normalizeManualLandmarks(analysis?.validated_landmarks||{});
  const out:Record<string,any>={};
  for(const view of IRI_PHOTO_VIEWS){
    const capture=captures[view];
    out[view]=capture&&analysisCaptureId(analysis,view)===capture.id?(normalized as any)?.[view]||{}:{};
  }
  return out;
}
function photoAnalysisMatches(analysis:any,captures:Record<string,any>){
  return IRI_PHOTO_VIEWS.every((view)=>!captures[view]||analysisCaptureId(analysis,view)===captures[view].id);
}
async function fetchExternalReport(service:any,assessmentId:string,audience:string){
  const {data,error}=await service.from('iri_external_reports_v26')
    .select('id,client_id,assessment_id,bucket_id,object_path,file_name,mime_type,size_bytes,visible_to_client,version,uploaded_by,uploaded_at,updated_at')
    .eq('assessment_id',assessmentId).order('version',{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;
  if(!data||(audience==='cliente'&&data.visible_to_client!==true))return null;
  return data;
}
async function fetchPhotogrammetry(service:any,assessmentId:string,audience:string){
  const [consents,captures,v2,v1,permission]=await Promise.all([
    service.from('iri_consents_v1').select('id,client_id,assessment_id,consent_type,status,document_version,recorded_by,recorded_at,note').eq('assessment_id',assessmentId).order('recorded_at',{ascending:false}).limit(50),
    service.from('iri_photogrammetry_captures_v1').select('id,client_id,assessment_id,consent_id,view,bucket_id,object_path,original_file_name,mime_type,size_bytes,sha256,width_px,height_px,source,protocol_version,captured_at,uploaded_by,status,revoked_at,created_at').eq('assessment_id',assessmentId).order('captured_at',{ascending:false}).limit(40),
    service.from('iri_photogrammetry_analyses_v2').select('*').eq('assessment_id',assessmentId).order('revision',{ascending:false}).limit(1).maybeSingle(),
    service.from('iri_photogrammetry_analyses_v1').select('*').eq('assessment_id',assessmentId).limit(1).maybeSingle(),
    service.from('iri_photo_report_permissions_v1').select('id,client_id,assessment_id,status,document_version,recorded_by,recorded_at,note').eq('assessment_id',assessmentId).order('recorded_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  for(const result of [consents,captures,v2,v1,permission])if(result.error)throw result.error;
  const consent=(consents.data||[]).find((item:any)=>item.consent_type==='photography')||null;
  if(!consent||consent.status!=='granted'){
    return {report:null,snapshot:{consent,captures:[],analysis:null,reportPermission:permission.data||null}};
  }
  const latest=latestByView(captures.data||[]);
  const analysis=v2.data||v1.data||null;
  const landmarks=linkedLandmarks(analysis,latest);
  const validation=validateManualLandmarks(landmarks,IRI_PHOTO_VIEWS.filter((view)=>latest[view]));
  const validated=Boolean(analysis?.status==='validated'&&validation.ok&&photoAnalysisMatches(analysis,latest));
  const calibration=normalizePhotoCalibrations(v2.data?.calibration||{});
  const quality=photogrammetryDataQualityV2({captures:Object.values(latest),landmarks,calibrationByView:calibration,validated});
  const measurements=analysis?.measurements&&typeof analysis.measurements==='object'?structuredClone(analysis.measurements):{};
  const interpretation=interpretPhotogrammetryMeasurementsV2(measurements,{quality});
  const photosAllowed=audience==='coach'||permission.data?.status==='granted';
  const photos:any[]=[];
  if(photosAllowed){
    for(const view of IRI_PHOTO_VIEWS){
      const capture=latest[view];if(!capture)continue;
      const signed=await service.storage.from(capture.bucket_id).createSignedUrl(capture.object_path,300);
      if(signed.error)throw signed.error;
      if(signed.data?.signedUrl)photos.push({
        view,url:signed.data.signedUrl,capturedAt:capture.captured_at,
        widthPx:Number(capture.width_px)||null,heightPx:Number(capture.height_px)||null,
      });
    }
  }
  const report=analysis||photos.length?{
    assessmentId,available:true,audience:audienceRenderer(audience),photosAllowed,
    photos,landmarks,calibration,quality,analysisStatus:analysis?.status||null,
    analysisRevision:Number(v2.data?.revision||analysis?.revision||0),
    protocolVersion:v2.data?.protocol_version||analysis?.protocol_version||null,
    measurements,interpretation,
    decisionSupport:v2.data?.decision_support&&typeof v2.data.decision_support==='object'?v2.data.decision_support:null,
  }:null;
  const snapshot={
    consent,
    reportPermission:permission.data||null,
    captures:Object.values(latest).map((c:any)=>({
      id:c.id,view:c.view,bucketId:c.bucket_id,objectPath:c.object_path,sha256:c.sha256,
      mimeType:c.mime_type,sizeBytes:c.size_bytes,widthPx:c.width_px,heightPx:c.height_px,
      protocolVersion:c.protocol_version,capturedAt:c.captured_at,status:c.status,
    })),
    analysis:analysis?{
      id:analysis.id,revision:Number(v2.data?.revision||analysis?.revision||0),status:analysis.status,
      protocolVersion:analysis.protocol_version,landmarkSchemaVersion:analysis.landmark_schema_version,
      captureIds:Object.fromEntries(IRI_PHOTO_VIEWS.map((view)=>[view,analysisCaptureId(analysis,view)])),
      validatedLandmarks:analysis.validated_landmarks||{},
      calibration:v2.data?.calibration||{},
      measurements:analysis.measurements||{},
      decisionSupport:v2.data?.decision_support||{},
      validatedBy:analysis.validated_by||null,validatedAt:analysis.validated_at||null,
    }:null,
  };
  return {report,snapshot};
}
async function loadExternalBytes(service:any,external:any){
  if(!external)return null;
  const download=await service.storage.from(external.bucket_id).download(external.object_path);
  if(download.error)throw download.error;
  const bytes=new Uint8Array(await download.data.arrayBuffer());
  return {bytes,fileName:text(external.file_name,240)||'bioimpedancia',mimeType:String(external.mime_type||''),sizeBytes:bytes.byteLength};
}
async function annexInfo(externalBytes:any){
  if(!externalBytes)return null;
  if(externalBytes.mimeType==='application/pdf'){
    const doc=await PDFDocument.load(externalBytes.bytes,{ignoreEncryption:false});
    const total=doc.getPageCount();
    return {kind:'pdf',totalPages:total,displayPages:Math.min(total,EXTERNAL_PDF_MAX_PAGES),truncated:total>EXTERNAL_PDF_MAX_PAGES};
  }
  if(['image/jpeg','image/png'].includes(externalBytes.mimeType))return {kind:'image',totalPages:1,displayPages:1,truncated:false};
  throw new Error('IRI_REPORT_EXTERNAL_MIME_UNSUPPORTED');
}
async function renderPdf(html:string,rendererUrl:string,rendererSecret:string){
  if(!rendererUrl||!rendererSecret)throw new Error('IRI_REPORT_RENDERER_CONFIG_MISSING');
  let endpoint:URL;
  try{endpoint=new URL(rendererUrl);}catch{throw new Error('IRI_REPORT_RENDERER_CONFIG_INVALID');}
  if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.workers.dev')||endpoint.username||endpoint.password){
    throw new Error('IRI_REPORT_RENDERER_CONFIG_INVALID');
  }
  const response=await fetch(endpoint.toString(),{
    method:'POST',
    headers:{authorization:`Bearer ${rendererSecret}`,'content-type':'application/json'},
    body:JSON.stringify({html}),
  });
  if(!response.ok){
    const detail=text(await response.text().catch(()=>''),600);
    throw new Error(`IRI_REPORT_RENDERER_FAILED:${response.status}:${detail}`);
  }
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength<1000||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error('IRI_REPORT_RENDERER_INVALID_PDF');
  return bytes;
}
async function appendExternal(mainBytes:Uint8Array,externalBytes:any,info:any){
  if(!externalBytes||!info)return mainBytes;
  const output=await PDFDocument.load(mainBytes);
  try{
    await output.attach(externalBytes.bytes,externalBytes.fileName,{
      mimeType:externalBytes.mimeType,
      description:'Documento original de bioimpedancia vinculado a la evaluación IRI',
    });
  }catch{ /* visible annex remains authoritative even if attachment metadata is unsupported */ }
  if(info.kind==='pdf'){
    const source=await PDFDocument.load(externalBytes.bytes,{ignoreEncryption:false});
    const indices=Array.from({length:info.displayPages},(_,i)=>i);
    const pages=await output.copyPages(source,indices);
    for(const page of pages)output.addPage(page);
  }else{
    const image=externalBytes.mimeType==='image/png'
      ?await output.embedPng(externalBytes.bytes)
      :await output.embedJpg(externalBytes.bytes);
    const page=output.addPage([595.28,841.89]);
    const margin=36,availW=595.28-margin*2,availH=841.89-margin*2;
    const scale=Math.min(availW/image.width,availH/image.height);
    const width=image.width*scale,height=image.height*scale;
    page.drawImage(image,{x:(595.28-width)/2,y:(841.89-height)/2,width,height});
  }
  return new Uint8Array(await output.save({useObjectStreams:true}));
}
function reportDraft(assessment:any){
  const record={id:assessment.id,clientId:assessment.client_id,...(assessment.sections||{})};
  if(!record.assessmentDate&&assessment.evaluated_at)record.assessmentDate=String(assessment.evaluated_at).slice(0,10);
  return confirmedFirstSessionDraft(record,assessment.client_id);
}
async function issueReport({userClient,service,actorUserId,assessmentId,audience,appOrigin,rendererUrl,rendererSecret}:any){
  const authz=await userClient.rpc('iberfit_authorize_iri_report_issue_v1',{p_assessment_id:assessmentId,p_audience:audience});
  if(authz.error)throw authz.error;
  if(!authz.data?.ok)throw new Error('IRI_REPORT_ISSUE_NOT_AUTHORIZED');

  const assessmentResult=await service.from('iri_assessments')
    .select('id,client_id,sections,status,revision,assessment_type,protocol_version,evaluated_at,completed_at,approved_by,approved_at,published_at,created_at,updated_at')
    .eq('id',assessmentId).single();
  if(assessmentResult.error)throw assessmentResult.error;
  const assessment=assessmentResult.data;
  const [clientResult,profileResult,external,photoState]=await Promise.all([
    service.from('clients').select('id,name').eq('id',assessment.client_id).single(),
    service.from('user_profiles').select('display_name,role').eq('user_id',actorUserId).maybeSingle(),
    fetchExternalReport(service,assessmentId,audience),
    fetchPhotogrammetry(service,assessmentId,audience),
  ]);
  if(clientResult.error)throw clientResult.error;
  if(profileResult.error)throw profileResult.error;
  const draft=reportDraft(assessment);
  const validation=validateFirstSessionDraft(draft);
  if(!validation.ok)throw new Error(`IRI_REPORT_SOURCE_INVALID:${validation.errors.join(',')}`);

  const externalBytes=await loadExternalBytes(service,external);
  const annex=await annexInfo(externalBytes);
  const externalForRender=external?{
    id:external.id,assessmentId:external.assessment_id,fileName:external.file_name,
    mimeType:external.mime_type,sizeBytes:external.size_bytes,visibleToClient:external.visible_to_client,
    version:external.version,uploadedAt:external.uploaded_at,issuedArtifactAnnex:Boolean(annex),
    issuedArtifactAnnexPageCount:annex?.displayPages||0,
    issuedArtifactAnnexTotalPages:annex?.totalPages||0,
    issuedArtifactAnnexTruncated:Boolean(annex?.truncated),
    printPreview:{pages:[]},
  }:null;
  const coachName=text(profileResult.data?.display_name,160)||'Coach IBERFIT';
  const logoUrl=`${appOrigin}/public/isotipo-iberfit.png`;
  const signatureUrl=/carlos|iberfit\.cl@gmail\.com/u.test(coachName.toLowerCase())
    ?`${appOrigin}/m26/assets/iberfit-signature-carlos.svg`:'';
  const html=buildIriReportHtml({
    draft,variant:audienceRenderer(audience),clientName:clientResult.data.name||'Cliente IBERFIT',
    coachName,clientId:assessment.client_id,logoUrl,signatureUrl,
    stylesheetHref:`${appOrigin}/m26/iri-report.css?v=${TEMPLATE_VERSION}`,
    externalReport:externalForRender,photogrammetryReport:photoState.report,
    appOrigin,iriOnly:authz.data?.iriOnly===true,
  });

  const sourceSnapshot={
    schema:'iberfit.iri.issued-source.v1',
    assessment:{
      id:assessment.id,clientId:assessment.client_id,revision:Number(assessment.revision||0),
      assessmentType:assessment.assessment_type,protocolVersion:assessment.protocol_version,
      evaluatedAt:assessment.evaluated_at,completedAt:assessment.completed_at,sections:assessment.sections,
    },
    subject:{clientId:clientResult.data.id,clientName:clientResult.data.name},
    coach:{userId:actorUserId,displayName:coachName},
    audience,
    iriOnly:authz.data?.iriOnly===true,
    externalReport:external?{
      id:external.id,bucketId:external.bucket_id,objectPath:external.object_path,fileName:external.file_name,
      mimeType:external.mime_type,sizeBytes:external.size_bytes,visibleToClient:external.visible_to_client,
      version:external.version,uploadedAt:external.uploaded_at,
    }:null,
    photogrammetry:photoState.snapshot,
  };
  const sourceJson=stableJson(sourceSnapshot);
  const sourceHash=await sha256(sourceJson);
  if(!SHA256.test(sourceHash))throw new Error('IRI_REPORT_SOURCE_HASH_INVALID');

  let pdf=await renderPdf(html,rendererUrl,rendererSecret);
  pdf=await appendExternal(pdf,externalBytes,annex);
  if(pdf.byteLength<=1000||pdf.byteLength>MAX_ARTIFACT_BYTES)throw new Error('IRI_REPORT_ARTIFACT_SIZE_INVALID');
  const artifactHash=await sha256(pdf);
  const issuanceId=crypto.randomUUID();
  const artifactPath=`${assessment.client_id}/${assessment.id}/${audience}/${issuanceId}/report.pdf`;
  const upload=await service.storage.from(ISSUED_BUCKET).upload(artifactPath,pdf,{
    contentType:'application/pdf',cacheControl:'31536000',upsert:false,
  });
  if(upload.error)throw upload.error;

  const evidenceManifest={
    schema:'iberfit.iri.evidence-manifest.v1',
    externalReport:external?{included:true,mimeType:external.mime_type,originalAttached:true,...annex}:null,
    photogrammetry:{
      included:Boolean(photoState.report),photosPublished:Boolean(photoState.report?.photos?.length),
      analysisRevision:Number(photoState.report?.analysisRevision||0),
      protocolVersion:photoState.report?.protocolVersion||null,
    },
  };
  const renderManifest={
    schema:'iberfit.iri.render-manifest.v1',
    templateVersion:TEMPLATE_VERSION,engineVersion:ENGINE_VERSION,
    renderer:'cloudflare-browser-run/worker-binding-pdf',
    taggedRequested:true,outlineRequested:true,preferCssPageSize:true,printBackground:true,
    postProcessedWithPdfLib:Boolean(externalBytes),
    pdfUaCertified:false,
    generatedAt:new Date().toISOString(),
  };
  try{
    const final=await service.rpc('iberfit_finalize_iri_report_issue_v1',{
      p_issuance_id:issuanceId,p_client_id:assessment.client_id,p_assessment_id:assessment.id,p_audience:audience,
      p_template_version:TEMPLATE_VERSION,p_engine_version:ENGINE_VERSION,p_source_revision:Number(assessment.revision||0),
      p_source_snapshot:sourceSnapshot,p_source_sha256:sourceHash,p_evidence_manifest:evidenceManifest,
      p_render_manifest:renderManifest,p_artifact_path:artifactPath,p_artifact_sha256:artifactHash,
      p_artifact_size_bytes:pdf.byteLength,p_actor_user_id:actorUserId,
    });
    if(final.error)throw final.error;
    if(!final.data?.ok)throw new Error('IRI_REPORT_FINALIZE_INVALID_RESPONSE');
    const signed=await service.storage.from(ISSUED_BUCKET).createSignedUrl(artifactPath,120);
    if(signed.error)throw signed.error;
    return {...final.data,signedUrl:signed.data?.signedUrl||null,expiresIn:120,sourceSha256:sourceHash};
  }catch(error){
    await service.storage.from(ISSUED_BUCKET).remove([artifactPath]).catch(()=>{});
    throw error;
  }
}
async function safeHistory(userClient:any,assessmentId:string){
  const result=await userClient.rpc('iberfit_iri_report_history_v1',{p_assessment_id:assessmentId});
  if(result.error)throw result.error;
  if(!result.data?.ok)throw new Error('IRI_REPORT_HISTORY_INVALID_RESPONSE');
  return result.data;
}
async function openIssued(userClient:any,service:any,issuanceId:string){
  const authz=await userClient.rpc('iberfit_authorize_iri_report_artifact_v1',{p_issuance_id:issuanceId});
  if(authz.error)throw authz.error;
  if(!authz.data?.ok)throw new Error('IRI_REPORT_ARTIFACT_NOT_AUTHORIZED');
  const signed=await service.storage.from(authz.data.artifactBucket).createSignedUrl(authz.data.artifactPath,120);
  if(signed.error)throw signed.error;
  return {...authz.data,signedUrl:signed.data?.signedUrl||null,expiresIn:120};
}

Deno.serve(async(req:Request)=>{
  const supabaseUrl=String(Deno.env.get('SUPABASE_URL')||'').trim();
  const projectRef=deploymentRef(supabaseUrl);
  const allowed=allowedOrigins(projectRef);
  const appOrigin=canonicalAppOrigin(projectRef);
  const origin=String(req.headers.get('origin')||'').trim().toLowerCase();
  if(!appOrigin||!allowed.has(origin))return json(403,{ok:false,code:'IRI_REPORT_ORIGIN_FORBIDDEN',version:FUNCTION_VERSION},origin,allowed);
  if(req.method==='OPTIONS')return json(204,{},origin,allowed);
  if(req.method!=='POST')return json(405,{ok:false,code:'IRI_REPORT_METHOD_NOT_ALLOWED',version:FUNCTION_VERSION},origin,allowed);

  const authorization=String(req.headers.get('authorization')||'').trim();
  if(!authorization.startsWith('Bearer ')||authorization.length>20_000)return json(401,{ok:false,code:'IRI_REPORT_AUTH_REQUIRED',version:FUNCTION_VERSION},origin,allowed);
  const token=authorization.slice(7).trim();
  const raw=await req.text();
  if(!raw||raw.length>MAX_REQUEST_CHARS)return json(400,{ok:false,code:'IRI_REPORT_BODY_INVALID',version:FUNCTION_VERSION},origin,allowed);
  let body:any;try{body=JSON.parse(raw);}catch{return json(400,{ok:false,code:'IRI_REPORT_BODY_INVALID',version:FUNCTION_VERSION},origin,allowed);}
  const action=text(body?.action,40).toLowerCase();

  const publishableKey=jsonEnv('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
  const secretKey=jsonEnv('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
  if(!supabaseUrl||!publishableKey||!secretKey)return json(500,{ok:false,code:'IRI_REPORT_SERVER_CONFIG_MISSING',version:FUNCTION_VERSION},origin,allowed);
  const userClient=createClient(supabaseUrl,publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{headers:{Authorization:authorization,Origin:origin}},
  });
  const auth=await userClient.auth.getUser(token);
  const actorUserId=String(auth.data?.user?.id||'');
  if(auth.error||!UUID.test(actorUserId))return json(401,{ok:false,code:'IRI_REPORT_AUTH_REQUIRED',version:FUNCTION_VERSION},origin,allowed);
  const service=createClient(supabaseUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

  try{
    if(action==='health'){
      const context=await userClient.rpc('iberfit_application_context_v14');
      if(context.error||context.data?.ok!==true)throw context.error||new Error('IRI_REPORT_APPLICATION_CONTEXT_REQUIRED');
      const roles=Array.isArray(context.data?.roles)?context.data.roles.map((value:unknown)=>String(value||'').toLowerCase()):[];
      if(!roles.some((role:string)=>role==='admin'||role==='coach'))throw new Error('IRI_REPORT_HEALTH_SCOPE_FORBIDDEN');
      const rendererUrl=String(Deno.env.get('IBERFIT_IRI_RENDERER_URL')||'').trim();
      const rendererSecret=String(Deno.env.get('IBERFIT_IRI_RENDERER_SHARED_SECRET')||'').trim();
      return json(200,{
        ok:true,version:FUNCTION_VERSION,projectRef,
        rendererConfigured:Boolean(rendererUrl&&rendererSecret),
        issuedBucket:ISSUED_BUCKET,
      },origin,allowed);
    }
    if(action==='issue'){
      const assessmentId=assertUuid(body?.assessmentId,'IRI_REPORT_ASSESSMENT_INVALID');
      const audience=audienceDb(body?.audience);
      const result=await issueReport({
        userClient,service,actorUserId,assessmentId,audience,appOrigin,
        rendererUrl:String(Deno.env.get('IBERFIT_IRI_RENDERER_URL')||'').trim(),
        rendererSecret:String(Deno.env.get('IBERFIT_IRI_RENDERER_SHARED_SECRET')||'').trim(),
      });
      return json(200,{ok:true,version:FUNCTION_VERSION,...result},origin,allowed);
    }
    if(action==='history'){
      const assessmentId=assertUuid(body?.assessmentId,'IRI_REPORT_ASSESSMENT_INVALID');
      const result=await safeHistory(userClient,assessmentId);
      return json(200,{ok:true,version:FUNCTION_VERSION,...result},origin,allowed);
    }
    if(action==='open'){
      const issuanceId=assertUuid(body?.issuanceId,'IRI_REPORT_ISSUANCE_INVALID');
      const result=await openIssued(userClient,service,issuanceId);
      return json(200,{ok:true,version:FUNCTION_VERSION,...result},origin,allowed);
    }
    if(action==='withdraw'){
      const issuanceId=assertUuid(body?.issuanceId,'IRI_REPORT_ISSUANCE_INVALID');
      const reason=text(body?.reason,1200);
      const result=await userClient.rpc('iberfit_withdraw_iri_report_issue_v1',{p_issuance_id:issuanceId,p_reason:reason});
      if(result.error)throw result.error;
      return json(200,{ok:true,version:FUNCTION_VERSION,...result.data},origin,allowed);
    }
    return json(400,{ok:false,code:'IRI_REPORT_ACTION_INVALID',version:FUNCTION_VERSION},origin,allowed);
  }catch(error){
    const code=codeOf(error);
    const status=/AUTH_REQUIRED/u.test(code)?401:/FORBIDDEN|SCOPE|PRIVILEGED|ASSURANCE|WEBAUTHN/u.test(code)?403:/NOT_FOUND/u.test(code)?404:/RENDERER|SERVER_CONFIG/u.test(code)?503:400;
    console.error('[iri-report-emission]',code);
    return json(status,{ok:false,code,version:FUNCTION_VERSION},origin,allowed);
  }
});
