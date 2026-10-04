import {
  M26_PRODUCTION_PROJECT_REF,
  M26_PRODUCTION_SUPABASE_ORIGIN,
  M26_QA_PROJECT_REF,
  M26_QA_SUPABASE_ORIGIN,
} from '../supabase-transport.js';
import {resolveSupabaseStorageSignedUrl} from '../supabase-storage-url.js';

export const IRI_PHOTO_BUCKET='iberfit-iri-photogrammetry';
export const IRI_PHOTO_MAX_BYTES=15_000_000;
export const IRI_PHOTO_MIME_TYPES=Object.freeze(['image/jpeg','image/png']);
export const IRI_PHYSICAL_CONSENT_VERSION='iri-physical-2026.10-v1';
export const IRI_PHOTO_CONSENT_VERSION='iri-photo-2026.10-v1';
export const IRI_PHOTO_REPORT_PERMISSION_VERSION='iri-photo-report-2026.10-v1';
export const IRI_PHOTO_REQUEST_TIMEOUT_MS=15_000;
export const IRI_PHOTO_UPLOAD_TIMEOUT_MS=180_000;

const MIME_TYPES=new Set(IRI_PHOTO_MIME_TYPES);
const VIEWS=new Set(['front','back','left','right']);
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN=/^[0-9a-f]{64}$/;
const CAPTURE_SELECT=[
  'id','client_id','assessment_id','consent_id','view','bucket_id','object_path',
  'original_file_name','mime_type','size_bytes','sha256','width_px','height_px',
  'source','protocol_version','captured_at','uploaded_by','status','revoked_at','created_at',
].join(',');
const ANALYSIS_SELECT=[
  'id','client_id','assessment_id','front_capture_id','back_capture_id',
  'left_capture_id','right_capture_id','protocol_version','landmark_schema_version',
  'auto_landmarks','validated_landmarks','measurements','status','revision',
  'validated_by','validated_at','created_by','created_at','updated_at',
].join(',');
const ANALYSIS_V2_SELECT=[
  'id','client_id','assessment_id','revision','front_capture_id','back_capture_id',
  'left_capture_id','right_capture_id','protocol_version','landmark_schema_version',
  'validated_landmarks','calibration','measurements','decision_support','status',
  'validated_by','validated_at','created_by','created_at',
].join(',');
const REPORT_PERMISSION_SELECT=[
  'id','client_id','assessment_id','status','document_version',
  'recorded_by','recorded_at','note',
].join(',');
const CONSENT_SELECT=[
  'id','client_id','assessment_id','consent_type','status','document_version',
  'recorded_by','recorded_at','note',
].join(',');

function cleanText(value,max=1000){
  return String(value??'')
    .replace(/[\u0000-\u001f\u007f]/gu,' ')
    .replace(/\s+/gu,' ')
    .trim()
    .slice(0,max);
}
function validateUuid(value,code){
  const id=cleanText(value,80);
  if(!UUID_PATTERN.test(id))throw new Error(code);
  return id;
}
function encodedPath(path){
  return String(path).split('/').map((part)=>encodeURIComponent(part)).join('/');
}
function responseMessage(payload,status){
  const message=cleanText(payload?.message||payload?.error_description||payload?.error||payload?.code,600);
  return message||`M26_IRI_PHOTO_HTTP_${status}`;
}
function normalizeRole(value){
  const role=cleanText(value,40).toLowerCase();
  if(['admin','administrator','administrador'].includes(role))return 'admin';
  if(['coach','entrenador'].includes(role))return 'coach';
  if(['client','cliente'].includes(role))return 'client';
  return role||'unknown';
}
function recordBody(record={}){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:record;
}
function recordClientId(record={}){
  const body=recordBody(record);
  return cleanText(record?.clientId||record?.client_id||body?.clientId||body?.client_id,80);
}
function recordId(record={}){
  const body=recordBody(record);
  return cleanText(record?.id||body?.id,80);
}
function recordType(record={}){
  const body=recordBody(record);
  return cleanText(record?.assessmentType||record?.assessment_type||body?.assessmentType||body?.assessment_type,40).toLowerCase();
}
function recordDate(record={}){
  const body=recordBody(record);
  return cleanText(body?.assessmentDate||body?.assessment_date||record?.assessmentDate||record?.assessment_date||record?.createdAt||record?.created_at,80);
}
function validateRuntime(runtime={}){
  if(!runtime.enabled)throw new Error('M26_IRI_PHOTO_BACKEND_DISABLED');
  const expected=runtime.qaOnly===true
    ?{projectRef:M26_QA_PROJECT_REF,origin:M26_QA_SUPABASE_ORIGIN}
    :{projectRef:M26_PRODUCTION_PROJECT_REF,origin:M26_PRODUCTION_SUPABASE_ORIGIN};
  if(runtime.projectRef!==expected.projectRef)throw new Error('M26_IRI_PHOTO_PROJECT_MISMATCH');
  let origin;
  try{origin=new URL(String(runtime.url||'')).origin;}catch{throw new Error('M26_IRI_PHOTO_URL_INVALID');}
  if(origin!==expected.origin)throw new Error('M26_IRI_PHOTO_ORIGIN_MISMATCH');
  const publishableKey=cleanText(runtime.publishableKey,20_000);
  if(publishableKey.length<2)throw new Error('M26_IRI_PHOTO_KEY_REQUIRED');
  return Object.freeze({
    origin,
    publishableKey,
    version:cleanText(runtime.version||'26.0.0',80),
    timeoutMs:Math.max(1_000,Math.min(Number(runtime.timeoutMs||IRI_PHOTO_REQUEST_TIMEOUT_MS),30_000)),
    uploadTimeoutMs:Math.max(60_000,Math.min(Number(runtime.iriPhotoUploadTimeoutMs||IRI_PHOTO_UPLOAD_TIMEOUT_MS),300_000)),
  });
}

export function resolveIriPhotogrammetryContext(state={}){
  const role=normalizeRole(state?.identity?.role);
  const clients=Array.isArray(state?.collections?.clients)?state.collections.clients:[];
  const selectedClientId=cleanText(state?.selectedClientId,80);
  const ownClientId=cleanText(state?.identity?.clientId||state?.identity?.client_id,80);
  const clientId=role==='client'?ownClientId:selectedClientId||(clients.length===1?cleanText(clients[0]?.id,80):'');
  if(!UUID_PATTERN.test(clientId))return Object.freeze({role,clientId:null,assessmentId:null,canManage:false});
  if(!['admin','coach'].includes(role))return Object.freeze({role,clientId,assessmentId:null,canManage:false});
  if(clients.length&&clients.every((client)=>cleanText(client?.id,80)!==clientId)){
    return Object.freeze({role,clientId:null,assessmentId:null,canManage:false});
  }
  const assessments=(Array.isArray(state?.collections?.iriAssessments)?state.collections.iriAssessments:[])
    .filter((record)=>{
      if(recordClientId(record)!==clientId||!UUID_PATTERN.test(recordId(record)))return false;
      const type=recordType(record);
      return !type||type==='inicial';
    })
    .sort((a,b)=>recordDate(b).localeCompare(recordDate(a)));
  const selected=assessments.find((record)=>recordId(record)===state?.selectedIriAssessmentId)||assessments[0]||null;
  return Object.freeze({
    role,
    clientId,
    assessmentId:selected?recordId(selected):null,
    canManage:Boolean(selected),
  });
}

export function iriPhotoObjectPath(clientId,assessmentId,view,captureId,mimeType){
  const client=validateUuid(clientId,'M26_IRI_PHOTO_CLIENT_INVALID');
  const assessment=validateUuid(assessmentId,'M26_IRI_PHOTO_ASSESSMENT_INVALID');
  const capture=validateUuid(captureId,'M26_IRI_PHOTO_CAPTURE_INVALID');
  const side=cleanText(view,20).toLowerCase();
  if(!VIEWS.has(side))throw new Error('M26_IRI_PHOTO_VIEW_INVALID');
  const mime=cleanText(mimeType,80).toLowerCase();
  if(!MIME_TYPES.has(mime))throw new Error('M26_IRI_PHOTO_MIME_INVALID');
  const ext=mime==='image/jpeg'?'jpg':'png';
  return `${client}/${assessment}/${side}/${capture}/original.${ext}`;
}

export function validateIriPhotoFile(file){
  if(!file||typeof file!=='object')throw new Error('M26_IRI_PHOTO_FILE_REQUIRED');
  const fileName=cleanText(file.name,240);
  const mimeType=cleanText(file.type,80).toLowerCase();
  const sizeBytes=Number(file.size);
  if(!fileName)throw new Error('M26_IRI_PHOTO_FILE_NAME_INVALID');
  if(!MIME_TYPES.has(mimeType))throw new Error('M26_IRI_PHOTO_MIME_INVALID');
  if(!Number.isInteger(sizeBytes)||sizeBytes<1||sizeBytes>IRI_PHOTO_MAX_BYTES)throw new Error('M26_IRI_PHOTO_SIZE_INVALID');
  if(typeof file.arrayBuffer!=='function')throw new Error('M26_IRI_PHOTO_FILE_READ_UNAVAILABLE');
  return Object.freeze({fileName,mimeType,sizeBytes});
}

function bytesToHex(buffer){
  return [...new Uint8Array(buffer)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}
export async function sha256IriPhotoFile(file,{subtle=globalThis.crypto?.subtle}={}){
  validateIriPhotoFile(file);
  if(!subtle?.digest)throw new Error('M26_IRI_PHOTO_CRYPTO_UNAVAILABLE');
  const bytes=await file.arrayBuffer();
  const digest=await subtle.digest('SHA-256',bytes);
  const sha256=bytesToHex(digest);
  if(!SHA256_PATTERN.test(sha256))throw new Error('M26_IRI_PHOTO_SHA256_INVALID');
  return sha256;
}

export async function defaultIriPhotoDimensions(file){
  validateIriPhotoFile(file);
  if(typeof globalThis.createImageBitmap==='function'){
    const bitmap=await globalThis.createImageBitmap(file);
    try{
      const width=Number(bitmap?.width),height=Number(bitmap?.height);
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('M26_IRI_PHOTO_DIMENSIONS_INVALID');
      return Object.freeze({widthPx:width,heightPx:height});
    }finally{try{bitmap?.close?.();}catch{}}
  }
  const ImageCtor=globalThis.Image;
  const createObjectURL=globalThis.URL?.createObjectURL?.bind(globalThis.URL);
  const revokeObjectURL=globalThis.URL?.revokeObjectURL?.bind(globalThis.URL);
  if(typeof ImageCtor!=='function'||typeof createObjectURL!=='function')throw new Error('M26_IRI_PHOTO_DIMENSIONS_UNAVAILABLE');
  const url=createObjectURL(file);
  try{
    return await new Promise((resolve,reject)=>{
      const image=new ImageCtor();
      image.onload=()=>{
        const width=Number(image.naturalWidth||image.width),height=Number(image.naturalHeight||image.height);
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)return reject(new Error('M26_IRI_PHOTO_DIMENSIONS_INVALID'));
        resolve(Object.freeze({widthPx:width,heightPx:height}));
      };
      image.onerror=()=>reject(new Error('M26_IRI_PHOTO_DECODE_FAILED'));
      image.src=url;
    });
  }finally{try{revokeObjectURL?.(url);}catch{}}
}

export function iriPhotoCaptureQuality({widthPx,heightPx}={}){
  const width=Number(widthPx),height=Number(heightPx);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1){
    return Object.freeze({level:'invalid',warnings:Object.freeze(['Dimensiones no disponibles.'])});
  }
  const warnings=[];
  if(Math.min(width,height)<720)warnings.push('Resolución baja: intenta que el lado corto tenga al menos 720 px.');
  if(width>=height)warnings.push('Encuadre horizontal: para cuerpo completo suele ser más reproducible una captura vertical.');
  const ratio=height/width;
  if(ratio<1.15)warnings.push('Encuadre poco vertical para una captura corporal completa.');
  return Object.freeze({level:warnings.length?'review':'good',warnings:Object.freeze(warnings)});
}

export async function inspectIriPhotoFile(file,{subtle=globalThis.crypto?.subtle,readDimensions=defaultIriPhotoDimensions}={}){
  const base=validateIriPhotoFile(file);
  const [sha256,dimensions]=await Promise.all([
    sha256IriPhotoFile(file,{subtle}),
    Promise.resolve(readDimensions(file)),
  ]);
  const widthPx=Number(dimensions?.widthPx),heightPx=Number(dimensions?.heightPx);
  if(!Number.isInteger(widthPx)||!Number.isInteger(heightPx)||widthPx<1||heightPx<1||widthPx>20000||heightPx>20000){
    throw new Error('M26_IRI_PHOTO_DIMENSIONS_INVALID');
  }
  return Object.freeze({...base,sha256,widthPx,heightPx,quality:iriPhotoCaptureQuality({widthPx,heightPx})});
}

function normalizeConsent(row){
  if(!row||typeof row!=='object'||Array.isArray(row))return null;
  const id=cleanText(row.id,80),clientId=cleanText(row.client_id||row.clientId,80),assessmentId=cleanText(row.assessment_id||row.assessmentId,80);
  if(!UUID_PATTERN.test(id)||!UUID_PATTERN.test(clientId)||!UUID_PATTERN.test(assessmentId))return null;
  return Object.freeze({
    id,clientId,assessmentId,
    consentType:cleanText(row.consent_type||row.consentType,60),
    status:cleanText(row.status,40),
    documentVersion:cleanText(row.document_version||row.documentVersion,80),
    recordedBy:cleanText(row.recorded_by||row.recordedBy,80)||null,
    recordedAt:row.recorded_at||row.recordedAt||null,
    note:cleanText(row.note,600)||null,
  });
}
function normalizeCapture(row){
  if(!row||typeof row!=='object'||Array.isArray(row))return null;
  const id=cleanText(row.id,80),clientId=cleanText(row.client_id||row.clientId,80),assessmentId=cleanText(row.assessment_id||row.assessmentId,80);
  const view=cleanText(row.view,20),objectPath=cleanText(row.object_path||row.objectPath,700);
  if(!UUID_PATTERN.test(id)||!UUID_PATTERN.test(clientId)||!UUID_PATTERN.test(assessmentId)||!VIEWS.has(view)||!objectPath)return null;
  return Object.freeze({
    id,clientId,assessmentId,view,objectPath,
    bucketId:cleanText(row.bucket_id||row.bucketId,160),
    consentId:cleanText(row.consent_id||row.consentId,80),
    fileName:cleanText(row.original_file_name||row.originalFileName,240),
    mimeType:cleanText(row.mime_type||row.mimeType,80),
    sizeBytes:Number(row.size_bytes??row.sizeBytes??0),
    sha256:cleanText(row.sha256,64).toLowerCase(),
    widthPx:Number(row.width_px??row.widthPx??0),
    heightPx:Number(row.height_px??row.heightPx??0),
    source:cleanText(row.source,30),
    protocolVersion:cleanText(row.protocol_version||row.protocolVersion,80),
    capturedAt:row.captured_at||row.capturedAt||null,
    status:cleanText(row.status,40),
    createdAt:row.created_at||row.createdAt||null,
  });
}
function normalizeAnalysis(row){
  if(!row||typeof row!=='object'||Array.isArray(row))return null;
  const id=cleanText(row.id,80),clientId=cleanText(row.client_id||row.clientId,80),assessmentId=cleanText(row.assessment_id||row.assessmentId,80);
  if(!UUID_PATTERN.test(id)||!UUID_PATTERN.test(clientId)||!UUID_PATTERN.test(assessmentId))return null;
  return Object.freeze({
    id,clientId,assessmentId,
    frontCaptureId:cleanText(row.front_capture_id||row.frontCaptureId,80)||null,
    backCaptureId:cleanText(row.back_capture_id||row.backCaptureId,80)||null,
    leftCaptureId:cleanText(row.left_capture_id||row.leftCaptureId,80)||null,
    rightCaptureId:cleanText(row.right_capture_id||row.rightCaptureId,80)||null,
    protocolVersion:cleanText(row.protocol_version||row.protocolVersion,80),
    landmarkSchemaVersion:cleanText(row.landmark_schema_version||row.landmarkSchemaVersion,80),
    autoLandmarks:row.auto_landmarks&&typeof row.auto_landmarks==='object'?structuredClone(row.auto_landmarks):{},
    validatedLandmarks:row.validated_landmarks&&typeof row.validated_landmarks==='object'?structuredClone(row.validated_landmarks):{},
    measurements:row.measurements&&typeof row.measurements==='object'?structuredClone(row.measurements):{},
    status:cleanText(row.status,40),
    revision:Number(row.revision||0),
    validatedAt:row.validated_at||row.validatedAt||null,
    updatedAt:row.updated_at||row.updatedAt||null,
  });
}
function normalizeAnalysisV2(row){
  const base=normalizeAnalysis(row);
  if(!base)return null;
  return Object.freeze({
    ...base,
    sourceVersion:'v2',
    calibration:row.calibration&&typeof row.calibration==='object'&&!Array.isArray(row.calibration)?structuredClone(row.calibration):{},
    decisionSupport:row.decision_support&&typeof row.decision_support==='object'&&!Array.isArray(row.decision_support)?structuredClone(row.decision_support):{},
    createdAt:row.created_at||row.createdAt||null,
  });
}
function normalizeReportPermission(row){
  if(!row||typeof row!=='object'||Array.isArray(row))return null;
  const id=cleanText(row.id,80),clientId=cleanText(row.client_id||row.clientId,80),assessmentId=cleanText(row.assessment_id||row.assessmentId,80);
  if(!UUID_PATTERN.test(id)||!UUID_PATTERN.test(clientId)||!UUID_PATTERN.test(assessmentId))return null;
  return Object.freeze({
    id,clientId,assessmentId,
    status:cleanText(row.status,40),
    documentVersion:cleanText(row.document_version||row.documentVersion,80),
    recordedBy:cleanText(row.recorded_by||row.recordedBy,80)||null,
    recordedAt:row.recorded_at||row.recordedAt||null,
    note:cleanText(row.note,600)||null,
  });
}
export function latestIriConsent(consents=[],type){
  return (Array.isArray(consents)?consents:[])
    .filter((item)=>item?.consentType===type)
    .sort((a,b)=>String(b.recordedAt||'').localeCompare(String(a.recordedAt||''))||String(b.id||'').localeCompare(String(a.id||'')))[0]||null;
}
export function latestIriPhotoCaptures(captures=[]){
  const latest={};
  for(const capture of (Array.isArray(captures)?captures:[])
    .filter((item)=>item?.status==='active'&&VIEWS.has(item?.view))
    .sort((a,b)=>String(b.capturedAt||b.createdAt||'').localeCompare(String(a.capturedAt||a.createdAt||'')))){
    if(!latest[capture.view])latest[capture.view]=capture;
  }
  return Object.freeze(latest);
}

export function createIriPhotogrammetryService({runtime,fetchImpl=globalThis.fetch}={}){
  const config=validateRuntime(runtime);
  if(typeof fetchImpl!=='function')throw new Error('M26_IRI_PHOTO_FETCH_UNAVAILABLE');

  async function request(path,{token,method='GET',headers={},body,timeoutMs=config.timeoutMs}={}){
    const accessToken=cleanText(token,20_000);
    if(!accessToken)throw new Error('M26_IRI_PHOTO_AUTH_REQUIRED');
    if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))throw new Error('M26_IRI_PHOTO_PATH_INVALID');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(`${config.origin}${path}`,{
        method,body,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
        headers:{...headers,apikey:config.publishableKey,authorization:`Bearer ${accessToken}`,'x-client-info':`iberfit-m26-web/${config.version}`},
      });
      const contentType=response.headers?.get?.('content-type')||'';
      const payload=response.status===204?null:contentType.includes('application/json')
        ?await response.json().catch(()=>({}))
        :await response.text().catch(()=>'');
      if(!response.ok){
        const failure=new Error(responseMessage(payload,response.status));
        failure.status=response.status;failure.body=payload;throw failure;
      }
      return payload;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('M26_IRI_PHOTO_TIMEOUT');
      throw error;
    }finally{clearTimeout(timer);}
  }

  async function state(token,{assessmentId}={}){
    const assessment=validateUuid(assessmentId,'M26_IRI_PHOTO_ASSESSMENT_INVALID');
    const query=(select,extra='')=>`select=${encodeURIComponent(select)}&assessment_id=eq.${encodeURIComponent(assessment)}${extra}`;
    const [consentRows,captureRows,analysisRows,analysisV2Rows,permissionRows]=await Promise.all([
      request(`/rest/v1/iri_consents_v1?${query(CONSENT_SELECT,'&order=recorded_at.desc&limit=50')}`,{token}),
      request(`/rest/v1/iri_photogrammetry_captures_v1?${query(CAPTURE_SELECT,'&order=captured_at.desc&limit=40')}`,{token}),
      request(`/rest/v1/iri_photogrammetry_analyses_v1?${query(ANALYSIS_SELECT,'&limit=1')}`,{token}),
      request(`/rest/v1/iri_photogrammetry_analyses_v2?${query(ANALYSIS_V2_SELECT,'&order=revision.desc&limit=1')}`,{token}),
      request(`/rest/v1/iri_photo_report_permissions_v1?${query(REPORT_PERMISSION_SELECT,'&order=recorded_at.desc&limit=1')}`,{token}),
    ]);
    if(!Array.isArray(consentRows)||!Array.isArray(captureRows)||!Array.isArray(analysisRows)||!Array.isArray(analysisV2Rows)||!Array.isArray(permissionRows)||analysisRows.length>1||analysisV2Rows.length>1||permissionRows.length>1){
      throw new Error('M26_IRI_PHOTO_STATE_INVALID_RESPONSE');
    }
    const consents=consentRows.map(normalizeConsent).filter(Boolean);
    const captures=captureRows.map(normalizeCapture).filter(Boolean);
    const analysisV1=normalizeAnalysis(analysisRows[0]);
    const analysisV2=normalizeAnalysisV2(analysisV2Rows[0]);
    const reportPermission=normalizeReportPermission(permissionRows[0]);
    return Object.freeze({
      consents:Object.freeze(consents),
      captures:Object.freeze(captures),
      analysis:analysisV2||analysisV1,
      analysisV1,
      analysisV2,
      reportPermission,
      physicalConsent:latestIriConsent(consents,'physical_assessment'),
      photographyConsent:latestIriConsent(consents,'photography'),
      latestCaptures:latestIriPhotoCaptures(captures),
    });
  }

  async function recordConsent(token,{clientId,assessmentId,consentType,status,documentVersion,note=''}={}){
    const client=validateUuid(clientId,'M26_IRI_PHOTO_CLIENT_INVALID');
    const assessment=validateUuid(assessmentId,'M26_IRI_PHOTO_ASSESSMENT_INVALID');
    const type=cleanText(consentType,60),nextStatus=cleanText(status,40),version=cleanText(documentVersion,80);
    if(!['physical_assessment','photography'].includes(type))throw new Error('M26_IRI_CONSENT_TYPE_INVALID');
    if(!['granted','declined','revoked'].includes(nextStatus))throw new Error('M26_IRI_CONSENT_STATUS_INVALID');
    if(!/^[A-Za-z0-9._-]{1,40}$/u.test(version))throw new Error('M26_IRI_CONSENT_VERSION_INVALID');
    const payload=await request('/rest/v1/rpc/iberfit_record_iri_consent_v1',{
      token,method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        p_client_id:client,p_assessment_id:assessment,p_consent_type:type,
        p_status:nextStatus,p_document_version:version,p_note:cleanText(note,600)||null,
      }),
    });
    if(!payload||payload.ok!==true||cleanText(payload.clientId||payload.client_id,80)!==client||cleanText(payload.assessmentId||payload.assessment_id,80)!==assessment){
      throw new Error('M26_IRI_CONSENT_INVALID_RESPONSE');
    }
    return Object.freeze({...payload});
  }

  async function recordReportPermission(token,{clientId,assessmentId,status,documentVersion=IRI_PHOTO_REPORT_PERMISSION_VERSION,note=''}={}){
    const client=validateUuid(clientId,'M26_IRI_PHOTO_CLIENT_INVALID');
    const assessment=validateUuid(assessmentId,'M26_IRI_PHOTO_ASSESSMENT_INVALID');
    const nextStatus=cleanText(status,40),version=cleanText(documentVersion,80);
    if(!['granted','declined','revoked'].includes(nextStatus))throw new Error('M26_IRI_REPORT_PERMISSION_STATUS_INVALID');
    if(!/^[A-Za-z0-9._-]{1,40}$/u.test(version))throw new Error('M26_IRI_REPORT_PERMISSION_VERSION_INVALID');
    const payload=await request('/rest/v1/rpc/iberfit_record_iri_photo_report_permission_v1',{
      token,method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        p_client_id:client,p_assessment_id:assessment,p_status:nextStatus,
        p_document_version:version,p_note:cleanText(note,600)||null,
      }),
    });
    if(!payload||payload.ok!==true||cleanText(payload.clientId||payload.client_id,80)!==client||cleanText(payload.assessmentId||payload.assessment_id,80)!==assessment){
      throw new Error('M26_IRI_REPORT_PERMISSION_INVALID_RESPONSE');
    }
    return Object.freeze({...payload});
  }

  async function prepareCapture(token,metadata={}){
    const client=validateUuid(metadata.clientId,'M26_IRI_PHOTO_CLIENT_INVALID');
    const assessment=validateUuid(metadata.assessmentId,'M26_IRI_PHOTO_ASSESSMENT_INVALID');
    const capture=validateUuid(metadata.captureId,'M26_IRI_PHOTO_CAPTURE_INVALID');
    const view=cleanText(metadata.view,20).toLowerCase();
    if(!VIEWS.has(view))throw new Error('M26_IRI_PHOTO_VIEW_INVALID');
    const sha256=cleanText(metadata.sha256,64).toLowerCase();
    if(!SHA256_PATTERN.test(sha256))throw new Error('M26_IRI_PHOTO_SHA256_INVALID');
    const expectedPath=iriPhotoObjectPath(client,assessment,view,capture,metadata.mimeType);
    if(cleanText(metadata.objectPath,700)!==expectedPath)throw new Error('M26_IRI_PHOTO_OBJECT_PATH_INVALID');
    const payload=await request('/rest/v1/rpc/iberfit_prepare_iri_photo_v1',{
      token,method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        p_capture_id:capture,p_client_id:client,p_assessment_id:assessment,p_view:view,
        p_file_name:cleanText(metadata.fileName,240),p_mime_type:cleanText(metadata.mimeType,80),
        p_size_bytes:Number(metadata.sizeBytes),p_sha256:sha256,p_width_px:Number(metadata.widthPx),
        p_height_px:Number(metadata.heightPx),p_source:metadata.source==='camera'?'camera':'upload',
        p_captured_at:metadata.capturedAt,p_object_path:expectedPath,
      }),
    });
    if(!payload||payload.ok!==true||cleanText(payload.id,80)!==capture||cleanText(payload.objectPath||payload.object_path,700)!==expectedPath){
      throw new Error('M26_IRI_PHOTO_PREPARE_INVALID_RESPONSE');
    }
    return Object.freeze({...payload});
  }

  async function uploadOriginal(token,{objectPath,file}={}){
    const details=validateIriPhotoFile(file);
    const path=cleanText(objectPath,700);
    if(!path||!path.endsWith(details.mimeType==='image/jpeg'?'/original.jpg':'/original.png'))throw new Error('M26_IRI_PHOTO_OBJECT_PATH_INVALID');
    try{
      await request(`/storage/v1/object/${encodeURIComponent(IRI_PHOTO_BUCKET)}/${encodedPath(path)}`,{
        token,method:'POST',body:file,timeoutMs:config.uploadTimeoutMs,
        headers:{'content-type':details.mimeType,'cache-control':'private, no-store','x-upsert':'false'},
      });
      return Object.freeze({ok:true,kind:'uploaded',objectPath:path});
    }catch(error){
      if(Number(error?.status)===409)return Object.freeze({ok:true,kind:'already-present',objectPath:path});
      throw error;
    }
  }

  async function finalizeCapture(token,{captureId,clientId,assessmentId}={}){
    const capture=validateUuid(captureId,'M26_IRI_PHOTO_CAPTURE_INVALID');
    const client=validateUuid(clientId,'M26_IRI_PHOTO_CLIENT_INVALID');
    const assessment=validateUuid(assessmentId,'M26_IRI_PHOTO_ASSESSMENT_INVALID');
    const payload=await request('/rest/v1/rpc/iberfit_finalize_iri_photo_v1',{
      token,method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({p_capture_id:capture,p_client_id:client,p_assessment_id:assessment}),
    });
    if(!payload||payload.ok!==true||cleanText(payload.id,80)!==capture||cleanText(payload.status,40)!=='active'){
      throw new Error('M26_IRI_PHOTO_FINALIZE_INVALID_RESPONSE');
    }
    return Object.freeze({...payload});
  }

  async function signedUrl(token,{objectPath,expiresIn=300}={}){
    const path=cleanText(objectPath,700);
    if(!path||!/\/original\.(?:jpg|png)$/u.test(path))throw new Error('M26_IRI_PHOTO_OBJECT_PATH_INVALID');
    const seconds=Math.max(60,Math.min(Number(expiresIn)||300,600));
    const payload=await request(`/storage/v1/object/sign/${encodeURIComponent(IRI_PHOTO_BUCKET)}/${encodedPath(path)}`,{
      token,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expiresIn:seconds}),
    });
    const raw=cleanText(payload?.signedURL||payload?.signedUrl,4000);
    return resolveSupabaseStorageSignedUrl({
      origin:config.origin,
      signedPath:raw,
      bucketId:IRI_PHOTO_BUCKET,
      errorPrefix:'M26_IRI_PHOTO_SIGN',
    });
  }

  async function saveAnalysis(token,{clientId,assessmentId,baseRevision=0,captureIds={},validatedLandmarks={},measurements={},validate=false}={}){
    const client=validateUuid(clientId,'M26_IRI_PHOTO_CLIENT_INVALID');
    const assessment=validateUuid(assessmentId,'M26_IRI_PHOTO_ASSESSMENT_INVALID');
    const idOrNull=(value)=>value?validateUuid(value,'M26_IRI_PHOTO_CAPTURE_INVALID'):null;
    const revision=Number(baseRevision);
    if(!Number.isInteger(revision)||revision<0)throw new Error('M26_IRI_PHOTO_REVISION_INVALID');
    const payload=await request('/rest/v1/rpc/iberfit_save_iri_photogrammetry_analysis_v1',{
      token,method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        p_client_id:client,p_assessment_id:assessment,p_base_revision:revision,
        p_front_capture_id:idOrNull(captureIds.front),
        p_back_capture_id:idOrNull(captureIds.back),
        p_left_capture_id:idOrNull(captureIds.left),
        p_right_capture_id:idOrNull(captureIds.right),
        p_validated_landmarks:validatedLandmarks&&typeof validatedLandmarks==='object'?validatedLandmarks:{},
        p_measurements:measurements&&typeof measurements==='object'?measurements:{},
        p_validate:Boolean(validate),
      }),
    });
    if(!payload||payload.ok!==true||cleanText(payload.assessmentId||payload.assessment_id,80)!==assessment||!Number.isInteger(Number(payload.revision))){
      throw new Error('M26_IRI_PHOTO_ANALYSIS_INVALID_RESPONSE');
    }
    return Object.freeze({...payload,revision:Number(payload.revision)});
  }

  async function saveAnalysisV2(token,{clientId,assessmentId,baseRevision=0,captureIds={},validatedLandmarks={},calibration={},measurements={},decisionSupport={},validate=false}={}){
    const client=validateUuid(clientId,'M26_IRI_PHOTO_CLIENT_INVALID');
    const assessment=validateUuid(assessmentId,'M26_IRI_PHOTO_ASSESSMENT_INVALID');
    const idOrNull=(value)=>value?validateUuid(value,'M26_IRI_PHOTO_CAPTURE_INVALID'):null;
    const revision=Number(baseRevision);
    if(!Number.isInteger(revision)||revision<0)throw new Error('M26_IRI_PHOTO_REVISION_INVALID');
    const payload=await request('/rest/v1/rpc/iberfit_save_iri_photogrammetry_analysis_v2',{
      token,method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        p_client_id:client,p_assessment_id:assessment,p_base_revision:revision,
        p_front_capture_id:idOrNull(captureIds.front),
        p_back_capture_id:idOrNull(captureIds.back),
        p_left_capture_id:idOrNull(captureIds.left),
        p_right_capture_id:idOrNull(captureIds.right),
        p_validated_landmarks:validatedLandmarks&&typeof validatedLandmarks==='object'?validatedLandmarks:{},
        p_calibration:calibration&&typeof calibration==='object'?calibration:{},
        p_measurements:measurements&&typeof measurements==='object'?measurements:{},
        p_decision_support:decisionSupport&&typeof decisionSupport==='object'?decisionSupport:{},
        p_validate:Boolean(validate),
      }),
    });
    if(!payload||payload.ok!==true||cleanText(payload.assessmentId||payload.assessment_id,80)!==assessment||!Number.isInteger(Number(payload.revision))){
      throw new Error('M26_IRI_PHOTO_ANALYSIS_V2_INVALID_RESPONSE');
    }
    return Object.freeze({...payload,revision:Number(payload.revision)});
  }

  return Object.freeze({state,recordConsent,recordReportPermission,prepareCapture,uploadOriginal,finalizeCapture,signedUrl,saveAnalysis,saveAnalysisV2});
}

export function friendlyIriPhotoError(error){
  const code=String(error?.message||error||'');
  if(/FILE_REQUIRED/.test(code))return 'Selecciona una fotografía.';
  if(/MIME_INVALID/.test(code))return 'Usa una imagen JPG o PNG.';
  if(/SIZE_INVALID|413/.test(code))return 'La fotografía debe pesar como máximo 15 MB.';
  if(/CONSENT|PHOTOGRAPHY_CONSENT_REQUIRED/.test(code))return 'Registra primero el consentimiento fotográfico.';
  if(/ROLE|FORBIDDEN|COACH_OR_ADMIN/.test(code))return 'No tienes permiso para gestionar estas fotografías.';
  if(/REVISION_CONFLICT|40001/.test(code))return 'El análisis cambió en otro dispositivo. Actualiza antes de guardar de nuevo.';
  if(/OBJECT_NOT_FOUND|PREPARE_REQUIRED/.test(code))return 'La subida quedó incompleta. Selecciona de nuevo la misma fotografía para recuperarla.';
  if(/TIMEOUT|NETWORK|FETCH|AbortError/i.test(code))return 'La conexión se interrumpió. El original y su estado permanecen protegidos; puedes reintentar.';
  return 'No fue posible completar la operación de fotogrametría. Revisa el estado e inténtalo de nuevo.';
}

export const __iriPhotoServiceInternals=Object.freeze({
  cleanText,normalizeRole,recordBody,recordClientId,recordId,recordType,recordDate,
  normalizeConsent,normalizeCapture,normalizeAnalysis,encodedPath,validateRuntime,
});
