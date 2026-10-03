import {createClient} from 'npm:@supabase/supabase-js@2.112.4';
import {PDFDocument,StandardFonts,rgb} from 'npm:pdf-lib@1.17.1';
import {confirmedFirstSessionDraft,firstSessionCompletion,validateFirstSessionDraft} from './vendor/workflows/iri-first-session.js';
import {scoreIriPerformance} from './vendor/norms/iri-scoring.js';
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
  return raw.match(/\b(?:IBERFIT|IRI|M26|V26)_[A-Z0-9_:-]{3,120}\b/u)?.[0]||fallback;
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

const PDF_W=595.28,PDF_H=841.89,PDF_M=48;
const PDF_C=Object.freeze({
  dark:rgb(11/255,19/255,16/255),
  ink:rgb(19/255,34/255,28/255),
  ink2:rgb(37/255,67/255,56/255),
  gold:rgb(197/255,160/255,89/255),
  gold2:rgb(215/255,186/255,124/255),
  cream:rgb(245/255,245/255,240/255),
  cream2:rgb(205/255,212/255,208/255),
  muted:rgb(154/255,168/255,161/255),
});
function pdfSafe(value:unknown,max=4000){
  return text(value,max).replace(/[–—]/gu,'-').replace(/[“”]/gu,'"').replace(/[‘’]/gu,"'").replace(/[^\u0020-\u00ff]/gu,' ');
}
function pdfNum(value:unknown,digits=0){
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString('es-ES',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
}
function pdfDate(value:unknown){
  const raw=pdfSafe(value,64),m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return m?m[3]+'/'+m[2]+'/'+m[1]:(raw||'Sin fecha');
}
function pdfWrap(font:any,size:number,value:unknown,maxWidth:number){
  const words=pdfSafe(value).split(/\s+/u).filter(Boolean),lines:string[]=[];
  let line='';
  for(const word of words){
    const next=line?line+' '+word:word;
    if(font.widthOfTextAtSize(next,size)<=maxWidth){line=next;continue;}
    if(line)lines.push(line);
    line=word;
  }
  if(line)lines.push(line);
  return lines.length?lines:['—'];
}
function pdfText(page:any,font:any,value:unknown,x:number,y:number,width:number,size=9.2,lineHeight=12.5,color=PDF_C.ink,maxLines=8){
  const lines=pdfWrap(font,size,value,width).slice(0,maxLines);
  lines.forEach((line,index)=>page.drawText(line,{x,y:y-index*lineHeight,size,font,color}));
  return y-lines.length*lineHeight;
}
function pdfFooter(page:any,fonts:any,n:number,audience:string){
  page.drawLine({start:{x:PDF_M,y:35},end:{x:PDF_W-PDF_M,y:35},thickness:.55,color:PDF_C.gold,opacity:.35});
  page.drawText('IBERFIT · Diagnóstico, planificación, control y seguimiento',{x:PDF_M,y:19,size:7.2,font:fonts.regular,color:PDF_C.muted});
  page.drawText((audience==='cliente'?'Cliente':'Coach/Admin')+' · '+String(n).padStart(2,'0'),{x:PDF_W-PDF_M-88,y:19,size:7.2,font:fonts.regular,color:PDF_C.muted});
}
function pdfPage(doc:any,fonts:any,n:number,audience:string,index:string,title:string,subtitle=''){
  const page=doc.addPage([PDF_W,PDF_H]);
  page.drawRectangle({x:0,y:0,width:PDF_W,height:PDF_H,color:PDF_C.cream});
  if(fonts.brandMark){
    const watermark=pdfFit(fonts.brandMark,180,180);
    page.drawImage(fonts.brandMark,{
      x:(PDF_W-watermark.w)/2,y:(PDF_H-watermark.h)/2-24,
      width:watermark.w,height:watermark.h,opacity:.028,
    });
  }
  page.drawRectangle({x:0,y:PDF_H-18,width:PDF_W,height:18,color:PDF_C.ink});
  page.drawText('IBERFIT',{x:PDF_W-92,y:PDF_H-15,size:7.5,font:fonts.bold,color:PDF_C.gold2});
  page.drawText(index,{x:PDF_M,y:PDF_H-65,size:10,font:fonts.bold,color:PDF_C.gold});
  page.drawText(pdfSafe(title,120),{x:PDF_M+28,y:PDF_H-70,size:21,font:fonts.serifBold,color:PDF_C.ink});
  if(subtitle)page.drawText(pdfSafe(subtitle,180),{x:PDF_M+28,y:PDF_H-90,size:8.2,font:fonts.regular,color:PDF_C.muted});
  page.drawLine({start:{x:PDF_M,y:PDF_H-105},end:{x:PDF_W-PDF_M,y:PDF_H-105},thickness:1,color:PDF_C.gold,opacity:.55});
  pdfFooter(page,fonts,n,audience);
  return page;
}
function pdfMetric(page:any,fonts:any,label:string,value:unknown,x:number,y:number,w=147,note=''){
  page.drawRectangle({x,y:y-54,width:w,height:54,color:PDF_C.cream,borderColor:PDF_C.gold,borderWidth:.6,borderOpacity:.35});
  page.drawText(pdfSafe(label,64).toUpperCase(),{x:x+10,y:y-16,size:6.8,font:fonts.bold,color:PDF_C.muted});
  page.drawText(pdfSafe(value,80),{x:x+10,y:y-35,size:14,font:fonts.serifBold,color:PDF_C.ink});
  if(note)page.drawText(pdfSafe(note,90),{x:x+10,y:y-48,size:6.1,font:fonts.regular,color:PDF_C.muted});
}
function pdfField(page:any,fonts:any,label:string,value:unknown,y:number){
  page.drawText(pdfSafe(label,70),{x:PDF_M,y,size:7,font:fonts.bold,color:PDF_C.muted});
  return pdfText(page,fonts.regular,value||'—',PDF_M,y-14,PDF_W-PDF_M*2,9.2,12.5,PDF_C.ink,5)-7;
}
function pdfBullets(page:any,fonts:any,title:string,items:unknown[],x:number,y:number,w:number){
  page.drawText(pdfSafe(title,80),{x,y,size:10.5,font:fonts.bold,color:PDF_C.ink});
  let cy=y-18;
  const list=(Array.isArray(items)?items:[]).map((v)=>pdfSafe(v,420)).filter(Boolean).slice(0,6);
  for(const item of list.length?list:['Sin registro']){
    page.drawCircle({x:x+3,y:cy+3,size:1.7,color:PDF_C.gold});
    cy=pdfText(page,fonts.regular,item,x+12,cy,w-12,9,12,PDF_C.ink2,4)-4;
  }
  return cy;
}
async function pdfImage(doc:any,url:string){
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(12_000)});
    if(!response.ok)return null;
    const bytes=new Uint8Array(await response.arrayBuffer());
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    if(type.includes('png'))return await doc.embedPng(bytes);
    if(type.includes('jpeg')||type.includes('jpg'))return await doc.embedJpg(bytes);
  }catch{}
  return null;
}
async function pdfSvgPath(url:string){
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(12_000)});
    if(!response.ok)return '';
    const svg=await response.text();
    return svg.match(/<path\b[^>]*\bd=["']([^"']+)["']/iu)?.[1]||'';
  }catch{return '';}
}

function pdfFit(image:any,w:number,h:number){
  const scale=Math.min(w/image.width,h/image.height);
  return {w:image.width*scale,h:image.height*scale};
}
function photoQuality(report:any){
  const raw=String(report?.quality?.level||report?.quality?.status||report?.quality?.grade||'').toLowerCase();
  if(raw.includes('high')||raw.includes('alta')||raw==='good')return 'Alta';
  if(raw.includes('medium')||raw.includes('moder')||raw.includes('media'))return 'Moderada';
  if(raw.includes('low')||raw.includes('baja'))return 'Baja';
  return report?.analysisStatus==='validated'?'Validada':'Pendiente de validación';
}
function measureLines(value:any,prefix='',depth=0,out:string[]=[]){
  if(depth>2||out.length>=10||value===null||value===undefined)return out;
  if(['number','string','boolean'].includes(typeof value)){
    out.push((prefix||'Medición').replaceAll('_',' ')+': '+pdfSafe(value,100));
    return out;
  }
  if(Array.isArray(value)){
    value.slice(0,5).forEach((item,index)=>measureLines(item,(prefix+' '+String(index+1)).trim(),depth+1,out));
    return out;
  }
  if(typeof value==='object'){
    Object.entries(value).slice(0,10).forEach(([key,item])=>measureLines(item,prefix?prefix+' · '+key:key,depth+1,out));
  }
  return out;
}
function pdfBool(value:unknown){
  return value===true?'Sí':value===false?'No':'—';
}
function pdfJoin(values:unknown[],fallback='Sin registro'){
  const out=values.map((value)=>pdfSafe(value,240)).filter((value)=>value&&value!=='—');
  return out.length?out.join(' · '):fallback;
}
function pdfTrials(values:unknown){
  return Array.isArray(values)&&values.length?values.map((value,index)=>'I'+String(index+1)+' '+pdfNum(value,1)).join(' · '):'Sin intentos registrados';
}
function pdfDomainScore(scoring:any,key:string){
  const domain=scoring?.domains?.[key]||scoring?.[key]||{};
  const score=Number(domain?.score10??domain?.score);
  return Number.isFinite(score)?pdfNum(score,1)+'/10':'—';
}
function pdfProtocolName(cardio:any){
  const protocol=String(cardio?.protocol||'');
  if(protocol==='treadmill-3min-field')return 'Cinta · 3 minutos';
  if(protocol==='ymca-3min-standard')return 'YMCA Step Test · 3 minutos';
  if(protocol==='1msts-standard')return '1MSTS · 60 segundos';
  if(protocol==='iberfit-3min-adapted')return 'Step 3 min adaptado';
  return protocol||'Protocolo no identificado';
}
function pdfStrengthVariant(value:unknown){
  const variant=String(value||'').trim().toLowerCase();
  if(variant==='standard')return 'Flexión estándar';
  if(variant==='incline')return 'Flexión inclinada';
  if(variant==='knees'||variant==='knees-supported')return 'Apoyo de rodillas';
  return pdfSafe(value,80)||'Variante no registrada';
}
function pdfPhotoView(value:unknown){
  const view=String(value||'').trim().toLowerCase();
  return ({front:'Frontal',back:'Posterior',left:'Lateral izquierda',right:'Lateral derecha'} as Record<string,string>)[view]||pdfSafe(value,60)||'Vista';
}
function pdfPhotoMeasurementRows(measurements:any){
  const metrics=Array.isArray(measurements?.metrics)?measurements.metrics:[];
  return metrics.flatMap((item:any)=>{
    const n=Number(item?.value);
    if(!Number.isFinite(n))return [];
    const unit=String(item?.unit||'').toLowerCase();
    const suffix=unit==='deg'?'°':unit==='cm'?' cm':unit?' '+pdfSafe(unit,12):'';
    return [pdfPhotoView(item?.view)+' · '+pdfSafe(item?.label||item?.id||'Medición',110)+': '+pdfNum(n,1)+suffix];
  }).slice(0,8);
}
function pdfPhotoDecisionRows(report:any){
  const support=report?.decisionSupport&&typeof report.decisionSupport==='object'?report.decisionSupport:{};
  const findings=Array.isArray(support?.findings)?support.findings.slice(0,2):[];
  if(findings.length)return findings.map((item:any)=>pdfSafe(item?.title||'Hallazgo',90)+': '+pdfSafe(item?.action||item?.meaning||'',260));
  const considerations=Array.isArray(support?.trainingConsiderations)?support.trainingConsiderations.slice(0,2):[];
  return considerations.map((item:any)=>pdfSafe(item,300));
}
async function renderPdf({draft,audience,clientName,coachName,iriOnly,photoReport,annex,appOrigin,assessmentMeta,signatureEligible}:any){
  const doc=await PDFDocument.create();
  doc.setTitle('Informe IRI · '+pdfSafe(clientName,120));
  doc.setAuthor('IBERFIT');
  doc.setSubject(audience==='cliente'?'Diagnóstico inicial IRI':'Dossier técnico IRI');
  doc.setCreator('IBERFIT '+ENGINE_VERSION);
  doc.setProducer('pdf-lib');
  const fonts:any={
    regular:await doc.embedFont(StandardFonts.Helvetica),
    bold:await doc.embedFont(StandardFonts.HelveticaBold),
    serifBold:await doc.embedFont(StandardFonts.TimesRomanBold),
    serifItalic:await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  const client=pdfSafe(clientName,140)||'Cliente IBERFIT';
  const coach=pdfSafe(coachName,140)||'Coach IBERFIT';
  const scoring=scoreIriPerformance(draft);
  const global=scoring?.global||{};
  const completion=firstSessionCompletion(draft);
  const logo=await pdfImage(doc,appOrigin+'/public/isotipo-iberfit.png');
  const signaturePath=signatureEligible?await pdfSvgPath(appOrigin+'/m26/assets/iberfit-signature-carlos.svg'):'';
  if(logo)fonts.brandMark=logo;

  let n=1;
  const sectionIndex=()=>String(n-1).padStart(2,'0');
  const cover=doc.addPage([PDF_W,PDF_H]);
  cover.drawRectangle({x:0,y:0,width:PDF_W,height:PDF_H,color:PDF_C.dark});
  cover.drawRectangle({x:0,y:0,width:14,height:PDF_H,color:PDF_C.gold});
  if(logo){
    const fit=pdfFit(logo,74,74);
    cover.drawImage(logo,{x:PDF_W-PDF_M-fit.w,y:PDF_H-112,width:fit.w,height:fit.h,opacity:.96});
  }
  cover.drawText('INFORME IRI',{x:48,y:671,size:11,font:fonts.bold,color:PDF_C.gold2});
  cover.drawText(audience==='cliente'?'Diagnóstico inicial':'Dossier técnico del diagnóstico inicial',{x:48,y:618,size:25,font:fonts.serifBold,color:PDF_C.cream});
  cover.drawText(client,{x:48,y:568,size:18,font:fonts.regular,color:PDF_C.cream2});
  cover.drawText(iriOnly?'Evaluación IRI independiente':'Punto de partida para la planificación',{x:48,y:539,size:10,font:fonts.regular,color:PDF_C.gold2});
  cover.drawText(pdfDate(draft?.assessmentDate),{x:48,y:514,size:9.5,font:fonts.regular,color:PDF_C.muted});
  cover.drawText('Entrenamiento personal con criterio:',{x:48,y:115,size:10,font:fonts.bold,color:PDF_C.cream2});
  cover.drawText('diagnóstico, planificación, control y seguimiento.',{x:48,y:96,size:10,font:fonts.regular,color:PDF_C.cream2});
  cover.drawText(coach,{x:48,y:59,size:8.5,font:fonts.serifItalic,color:PDF_C.gold2});

  n+=1;
  {
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Lectura ejecutiva','Qué encontramos y cómo condiciona la planificación');
    pdfMetric(page,fonts,'Completitud',String(Number(completion?.percent||0))+'%',PDF_M,674,147,String(completion?.complete||0)+'/'+String(completion?.total||0)+' etapas');
    pdfMetric(page,fonts,'Puntuación funcional',global?.available?pdfNum(global.score10,1)+'/10':'—',PDF_M+160,674,147,global?.available?String(global?.coverage?.scoredDomains||0)+'/3 dominios':'Cobertura insuficiente');
    pdfMetric(page,fonts,'Confianza',global?.confidence==='high'?'Alta':global?.confidence==='moderate'?'Moderada':'Insuficiente',PDF_M+320,674,147,'Sin sobreinterpretar datos');
    let y=588;
    y=pdfField(page,fonts,'OBJETIVO PRINCIPAL',draft?.personProfile?.primaryObjective||'Sin objetivo registrado',y);
    y=pdfField(page,fonts,'FRECUENCIA RECOMENDADA',draft?.diagnosis?.recommendedFrequency||String(draft?.personProfile?.weeklyFrequency||'—')+' sesiones/semana',y);
    y=pdfField(page,fonts,'PLAN INICIAL',draft?.diagnosis?.initialPlan,y);
    y=pdfField(page,fonts,'IMPLICACIONES PARA EL ENTRENAMIENTO',draft?.diagnosis?.trainingImplications,y);
    const leftY=pdfBullets(page,fonts,'Fortalezas',draft?.diagnosis?.strengths||[],PDF_M,315,230);
    pdfBullets(page,fonts,'Prioridades',draft?.diagnosis?.priorities||[],PDF_M+270,315,230);
    page.drawText('Interpretación del coach',{x:PDF_M,y:Math.min(leftY,195),size:10.5,font:fonts.bold,color:PDF_C.ink});
    pdfText(page,fonts.regular,draft?.diagnosis?.coachInterpretation||'Sin interpretación adicional registrada.',PDF_M,Math.min(leftY,177),PDF_W-PDF_M*2,9,12,PDF_C.ink2,7);
  }

  n+=1;
  {
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Contexto y objetivos','La planificación parte de la realidad de la persona, no solo de sus métricas');
    const profile=draft?.personProfile||{};
    const interview=draft?.interview||{};
    let y=674;
    y=pdfField(page,fonts,'OBJETIVO PRINCIPAL',profile?.primaryObjective||'Sin objetivo principal registrado',y);
    y=pdfField(page,fonts,'OBJETIVOS SECUNDARIOS',Array.isArray(profile?.secondaryObjectives)&&profile.secondaryObjectives.length?profile.secondaryObjectives.join(' · '):'Sin objetivos secundarios registrados',y);
    y=pdfField(page,fonts,'EXPERIENCIA Y ACTIVIDAD ACTUAL',pdfJoin([interview?.trainingExperience,interview?.currentTraining]),y);
    y=pdfField(page,fonts,'DISPONIBILIDAD',pdfJoin([interview?.availability,profile?.preferredSchedule]),y);
    y=pdfField(page,fonts,'MODALIDAD Y ENTORNO',pdfJoin([profile?.modality,profile?.locationType,profile?.trainingAddress]),y);
    y=pdfField(page,fonts,'MATERIAL DISPONIBLE',Array.isArray(profile?.equipment)&&profile.equipment.length?profile.equipment.join(' · '):'Sin material registrado',y);
    y=pdfField(page,fonts,'PREFERENCIAS',interview?.preferences||'Sin preferencias especiales registradas',y);
    pdfField(page,fonts,'CONSIDERACIONES DECLARADAS',interview?.restrictions||'Sin restricciones declaradas',y);
    pdfText(page,fonts.regular,'El Diagnóstico IRI describe el punto de partida para decidir mejor. El seguimiento y la evolución se registran después, de forma separada.',PDF_M,82,PDF_W-PDF_M*2,8.5,11.5,PDF_C.ink2,4);
  }

  n+=1;
  {
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Composición y movilidad','Referencia inicial; no sustituye valoración clínica');
    const body=draft?.bodyComposition||{};
    const mobility=draft?.mobility||{};
    pdfMetric(page,fonts,'Peso',body?.skipped?'No evaluado':pdfNum(body.weightKg,1)+' kg',PDF_M,674);
    pdfMetric(page,fonts,'Grasa corporal',body?.skipped?'No evaluado':pdfNum(body.bodyFatPercent,1)+' %',PDF_M+160,674);
    pdfMetric(page,fonts,'Masa magra',body?.skipped?'No evaluado':pdfNum(body.leanMassKg,1)+' kg',PDF_M+320,674);
    pdfMetric(page,fonts,'Cintura',body?.skipped?'No evaluado':pdfNum(body.waistCm,1)+' cm',PDF_M,605);
    pdfMetric(page,fonts,'Agua corporal',body?.skipped?'No evaluado':pdfNum(body.bodyWaterPercent,1)+' %',PDF_M+160,605);
    pdfMetric(page,fonts,'Grasa visceral',body?.skipped?'No evaluado':pdfNum(body.visceralFatLevel),PDF_M+320,605);
    let y=515;
    y=pdfField(page,fonts,'TOBILLO · RODILLA A PARED',mobility?.ankle?.skipped?'No evaluado':'Izq. '+pdfNum(mobility?.ankle?.leftBest,1)+' cm · Der. '+pdfNum(mobility?.ankle?.rightBest,1)+' cm · asimetría '+pdfNum(mobility?.ankle?.asymmetryCm,1)+' cm',y);
    y=pdfField(page,fonts,'CADENA POSTERIOR',mobility?.posteriorChain?.skipped?'No evaluado':'Izq. '+pdfNum(mobility?.posteriorChain?.leftBest,1)+' cm · Der. '+pdfNum(mobility?.posteriorChain?.rightBest,1)+' cm · asimetría '+pdfNum(mobility?.posteriorChain?.asymmetryCm,1)+' cm',y);
    y=pdfField(page,fonts,'ROTACIÓN DE CADERA',mobility?.hipRotation?.skipped?'No evaluado':mobility?.hipRotation?.result,y);
    y=pdfField(page,fonts,'SENTADILLA ASISTIDA',mobility?.assistedSquat?.skipped?'No evaluado':[mobility?.assistedSquat?.depth,mobility?.assistedSquat?.heels,mobility?.assistedSquat?.knees,mobility?.assistedSquat?.trunk].filter(Boolean).join(' · ')||'Sin detalle',y);
    y=pdfField(page,fonts,'MÉTODO DE COMPOSICIÓN',body?.skipped?body?.skipReason:(body?.method||body?.device||'Sin método registrado'),y);
    pdfField(page,fonts,'CONDICIONES DE MEDICIÓN',body?.measurementConditions||'Sin observaciones adicionales',y);
  }

  n+=1;
  {
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Fuerza y capacidad funcional','Comparar siempre con la misma variante y configuración');
    const strength=draft?.strengthAssessment||draft?.strength||{};
    const cardio=draft?.cardio||{};
    pdfMetric(page,fonts,'Silla 30 s',strength?.lowerBody?.skipped?'No evaluado':pdfNum(strength?.chairStand?.repetitions)+' rep',PDF_M,674);
    pdfMetric(page,fonts,'Empuje',strength?.push?.skipped?'No evaluado':pdfNum(strength?.push?.repetitions)+' rep',PDF_M+160,674,147,pdfStrengthVariant(strength?.push?.variant));
    pdfMetric(page,fonts,'Remo TRX',strength?.trxRow?.skipped?'No evaluado':pdfNum(strength?.trxRow?.repetitions)+' rep',PDF_M+320,674);
    pdfMetric(page,fonts,'Plancha frontal',strength?.core?.skipped?'No evaluado':pdfNum(strength?.core?.frontPlankSeconds)+' s',PDF_M,605);
    pdfMetric(page,fonts,'Lateral izq.',strength?.core?.skipped?'No evaluado':pdfNum(strength?.core?.sidePlankLeftSeconds)+' s',PDF_M+160,605);
    pdfMetric(page,fonts,'Lateral der.',strength?.core?.skipped?'No evaluado':pdfNum(strength?.core?.sidePlankRightSeconds)+' s',PDF_M+320,605);
    const protocol=String(cardio?.protocol||'');
    const protocolLabel=protocol==='treadmill-3min-field'?'Cinta · 3 minutos':protocol==='ymca-3min-standard'?'YMCA Step Test · 3 minutos':protocol==='1msts-standard'?'1MSTS · 60 segundos':protocol==='iberfit-3min-adapted'?'Step 3 min adaptado':'Protocolo no identificado';
    let y=515;
    y=pdfField(page,fonts,'PROTOCOLO DE ESFUERZO',cardio?.skipped?'No evaluado':protocolLabel,y);
    y=pdfField(page,fonts,'RESULTADO',cardio?.skipped?cardio?.skipReason:[
      Number.isFinite(Number(cardio?.speedKmh))&&pdfNum(cardio.speedKmh,1)+' km/h',
      Number.isFinite(Number(cardio?.inclinePercent))&&pdfNum(cardio.inclinePercent,1)+'% inclinación',
      Number.isFinite(Number(cardio?.repetitions))&&pdfNum(cardio.repetitions)+' rep',
      Number.isFinite(Number(cardio?.finalHr))&&'FC final '+pdfNum(cardio.finalHr)+' lpm',
      Number.isFinite(Number(cardio?.oneMinuteHr))&&'FC 1 min '+pdfNum(cardio.oneMinuteHr)+' lpm',
      Number.isFinite(Number(cardio?.deltaOneMinute))&&'recuperación '+pdfNum(cardio.deltaOneMinute)+' lpm',
    ].filter(Boolean).join(' · ')||'Sin resultado interpretable',y);
    y=pdfField(page,fonts,'CONFIGURACIÓN TRX',strength?.trxRow?.skipped?'No evaluado':[
      Number.isFinite(Number(strength?.trxRow?.handleHeightCm))&&'asas '+pdfNum(strength.trxRow.handleHeightCm)+' cm',
      Number.isFinite(Number(strength?.trxRow?.heelDistanceCm))&&'talones '+pdfNum(strength.trxRow.heelDistanceCm)+' cm',
      Number.isFinite(Number(strength?.trxRow?.bodyAngleDeg))&&'ángulo '+pdfNum(strength.trxRow.bodyAngleDeg)+'°',
    ].filter(Boolean).join(' · ')||strength?.trxRow?.position||'Sin detalle',y);
    y=pdfField(page,fonts,'OBSERVACIONES DE FUERZA',strength?.notes||'Sin observaciones adicionales',y);
    pdfField(page,fonts,'OBSERVACIONES DE ESFUERZO',cardio?.notes||'Sin observaciones adicionales',y);
  }

  n+=1;
  {
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),audience==='cliente'?'Dirección del entrenamiento':'Decisión y planificación','Cómo se traduce la evaluación en acciones concretas');
    const diagnosis=draft?.diagnosis||{};
    const records=Array.isArray(diagnosis?.priorityRecords)?diagnosis.priorityRecords.slice(0,3):[];
    page.drawText('Prioridades',{x:PDF_M,y:674,size:11,font:fonts.serifBold,color:PDF_C.ink});
    let y=650;
    if(records.length){
      for(let index=0;index<records.length;index+=1){
        const item=records[index]||{};
        page.drawText(String(index+1).padStart(2,'0'),{x:PDF_M,y,size:8,font:fonts.bold,color:PDF_C.gold});
        page.drawText(pdfSafe(item?.rationale||item?.target||diagnosis?.priorities?.[index]||'Prioridad',120),{x:PDF_M+30,y,size:10,font:fonts.bold,color:PDF_C.ink});
        y-=16;
        y=pdfText(page,fonts.regular,item?.strategy||item?.target||diagnosis?.trainingImplications,PDF_M+30,y,PDF_W-PDF_M*2-30,8.7,11.5,PDF_C.ink2,4)-7;
      }
    }else{
      y=pdfBullets(page,fonts,'',diagnosis?.priorities||[],PDF_M,y,PDF_W-PDF_M*2);
    }
    y=Math.min(y,410);
    y=pdfField(page,fonts,'FRECUENCIA',diagnosis?.recommendedFrequency||String(draft?.personProfile?.weeklyFrequency||'—')+' sesiones/semana',y);
    y=pdfField(page,fonts,'PLAN INICIAL',diagnosis?.initialPlan||'Plan pendiente de validación',y);
    y=pdfField(page,fonts,'REVISIÓN / REEVALUACIÓN',diagnosis?.reevaluationDate?pdfDate(diagnosis.reevaluationDate):'Fecha por definir',y);
    const protocols=(Array.isArray(draft?.protocolRecords)?draft.protocolRecords:[]).slice(0,6).map((record:any)=>pdfJoin([record?.testName,record?.variant,record?.configuration,record?.protocolVersion]));
    pdfField(page,fonts,'QUÉ DEBE REPETIRSE DE FORMA COMPARABLE',protocols.length?protocols.join(' | '):'Repetir las mismas variantes, configuraciones y protocolos registrados cuando corresponda',y);
    if(signaturePath){
      page.drawSvgPath(signaturePath,{x:PDF_W-PDF_M-150,y:190,scale:.23,color:PDF_C.ink,opacity:.92});
      page.drawText('Carlos · IBERFIT',{x:PDF_W-PDF_M-142,y:116,size:7.2,font:fonts.serifItalic,color:PDF_C.muted});
    }
    pdfText(page,fonts.regular,'La puntuación funcional no incorpora composición corporal ni fotogrametría. Las decisiones se apoyan en resultados, contexto, calidad de dato y criterio profesional.',PDF_M,78,PDF_W-PDF_M*2,8.4,11.5,PDF_C.ink2,5);
  }

  if(photoReport?.available){
    n+=1;
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Fotogrametría','Mediciones posturales con trazabilidad y calidad de dato');
    page.drawText('Estado: '+photoQuality(photoReport)+' · revisión '+String(Number(photoReport.analysisRevision||0)),{x:PDF_M,y:674,size:9.5,font:fonts.bold,color:PDF_C.gold});
    const lines=pdfPhotoMeasurementRows(photoReport?.measurements||{});
    let y=650;
    for(const line of lines)y=pdfText(page,fonts.regular,line,PDF_M,y,225,8.4,11,PDF_C.ink2,2)-3;
    const decisions=pdfPhotoDecisionRows(photoReport);
    if(decisions.length){
      y=Math.min(y-6,455);
      page.drawText('Lectura para entrenamiento',{x:PDF_M,y,size:9.5,font:fonts.bold,color:PDF_C.ink});
      y-=17;
      for(const item of decisions){
        page.drawCircle({x:PDF_M+3,y:y+3,size:1.6,color:PDF_C.gold});
        y=pdfText(page,fonts.regular,item,PDF_M+12,y,213,8.1,10.8,PDF_C.ink2,5)-5;
      }
    }
    const photos=Array.isArray(photoReport?.photos)?photoReport.photos.slice(0,4):[];
    const slots=[{x:315,y:510},{x:425,y:510},{x:315,y:340},{x:425,y:340}];
    for(let i=0;i<photos.length;i+=1){
      const image=await pdfImage(doc,String(photos[i]?.url||''));
      if(!image)continue;
      const slot=slots[i],fit=pdfFit(image,100,145);
      page.drawRectangle({x:slot.x-3,y:slot.y-3,width:106,height:151,borderColor:PDF_C.gold,borderWidth:.5,borderOpacity:.35});
      page.drawImage(image,{x:slot.x+(100-fit.w)/2,y:slot.y+(145-fit.h)/2,width:fit.w,height:fit.h});
      page.drawText(pdfPhotoView(photos[i]?.view||'Vista '+String(i+1)),{x:slot.x,y:slot.y-14,size:6.7,font:fonts.bold,color:PDF_C.muted});
    }
    pdfText(page,fonts.regular,'La fotogrametría describe alineación y asimetrías visibles bajo las condiciones de captura. No constituye por sí sola un diagnóstico médico.',PDF_M,165,PDF_W-PDF_M*2,8.8,12,PDF_C.ink2,5);
  }

  if(audience==='coach'){
    const profile=draft?.personProfile||{};
    const interview=draft?.interview||{};
    const body=draft?.bodyComposition||{};
    const mobility=draft?.mobility||{};
    const strength=draft?.strengthAssessment||draft?.strength||{};
    const cardio=draft?.cardio||{};
    const diagnosis=draft?.diagnosis||{};

    n+=1;
    {
      const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Cribado y condiciones relevantes','Solo Coach/Admin · contexto de seguridad y límites declarados');
      pdfMetric(page,fonts,'Sueño',Number.isFinite(Number(interview?.sleepScore))?pdfNum(interview.sleepScore,1)+'/10':'—',PDF_M,674);
      pdfMetric(page,fonts,'Estrés',Number.isFinite(Number(interview?.stressScore))?pdfNum(interview.stressScore,1)+'/10':'—',PDF_M+160,674);
      pdfMetric(page,fonts,'Energía',Number.isFinite(Number(interview?.energyScore))?pdfNum(interview.energyScore,1)+'/10':'—',PDF_M+320,674);
      let y=585;
      y=pdfField(page,fonts,'ANTECEDENTES DECLARADOS',interview?.healthHistory||'Sin antecedentes declarados',y);
      y=pdfField(page,fonts,'RESTRICCIONES',interview?.restrictions||'Sin restricciones declaradas',y);
      y=pdfField(page,fonts,'DOLOR / SÍNTOMAS ACTUALES',interview?.currentPain||'Sin dolor actual registrado',y);
      y=pdfField(page,fonts,'CRIBADO ACEPTADO',pdfBool(interview?.screeningAccepted),y);
      y=pdfField(page,fonts,'NOTAS DE CRIBADO',interview?.screeningNotes||'Sin notas adicionales',y);
      pdfField(page,fonts,'PRUEBAS OMITIDAS',pdfJoin([
        body?.skipped&&('Composición: '+pdfSafe(body?.skipReason,120)),
        mobility?.skipped&&('Movilidad: '+pdfSafe(mobility?.skipReason,120)),
        strength?.skipped&&('Fuerza: '+pdfSafe(strength?.skipReason,120)),
        cardio?.skipped&&('Cardio: '+pdfSafe(cardio?.skipReason,120)),
      ],'Ninguna omisión global registrada'),y);
    }

    n+=1;
    {
      const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Movilidad · detalle técnico','Mediciones bilaterales, intentos, síntomas y observación estructurada');
      let y=674;
      y=pdfField(page,fonts,'TOBILLO · INTENTOS IZQUIERDA',pdfTrials(mobility?.ankle?.leftTrials),y);
      y=pdfField(page,fonts,'TOBILLO · INTENTOS DERECHA',pdfTrials(mobility?.ankle?.rightTrials),y);
      y=pdfField(page,fonts,'TOBILLO · RESUMEN',mobility?.ankle?.skipped?('No realizado: '+pdfSafe(mobility?.ankle?.skipReason,180)):'Izq. '+pdfNum(mobility?.ankle?.leftBest,1)+' cm · Der. '+pdfNum(mobility?.ankle?.rightBest,1)+' cm · asimetría '+pdfNum(mobility?.ankle?.asymmetryCm,1)+' cm · dolor '+pdfSafe(mobility?.ankle?.pain||'no registrado',120),y);
      y=pdfField(page,fonts,'CADENA POSTERIOR · INTENTOS',pdfJoin([pdfTrials(mobility?.posteriorChain?.leftTrials),pdfTrials(mobility?.posteriorChain?.rightTrials)]),y);
      y=pdfField(page,fonts,'THOMAS MODIFICADO',pdfJoin([mobility?.modifiedThomas?.left,mobility?.modifiedThomas?.right,mobility?.modifiedThomas?.pelvicControl,mobility?.modifiedThomas?.pain]),y);
      y=pdfField(page,fonts,'ROTACIÓN DE CADERA',pdfJoin([mobility?.hipRotation?.result,mobility?.hipRotation?.pain,mobility?.hipRotation?.compensation]),y);
      y=pdfField(page,fonts,'SENTADILLA OBSERVACIONAL',pdfJoin([mobility?.assistedSquat?.depth,mobility?.assistedSquat?.heels,mobility?.assistedSquat?.knees,mobility?.assistedSquat?.trunk,mobility?.assistedSquat?.lateralShift,mobility?.assistedSquat?.assistanceResponse,mobility?.assistedSquat?.pain]),y);
      pdfField(page,fonts,'OBSERVACIONES',mobility?.notes||'Sin observaciones adicionales',y);
    }

    n+=1;
    {
      const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Fuerza · detalle técnico','Variantes, configuración, validez y resultados por patrón');
      let y=674;
      y=pdfField(page,fonts,'TREN INFERIOR',strength?.lowerBody?.skipped?('No realizado: '+pdfSafe(strength?.lowerBody?.skipReason,180)):pdfJoin([
        'Silla '+pdfNum(strength?.chairStand?.repetitions)+' rep',
        Number.isFinite(Number(strength?.chairStand?.chairHeightCm))&&'altura '+pdfNum(strength.chairStand.chairHeightCm,1)+' cm',
        'válida '+pdfBool(strength?.chairStand?.valid),
        Number.isFinite(Number(strength?.squat60?.repetitions))&&'sentadilla 60 s '+pdfNum(strength.squat60.repetitions)+' rep',
      ]),y);
      y=pdfField(page,fonts,'EMPUJE',strength?.push?.skipped?('No realizado: '+pdfSafe(strength?.push?.skipReason,180)):pdfJoin([
        pdfStrengthVariant(strength?.push?.variant),
        pdfNum(strength?.push?.repetitions)+' rep',
        Number.isFinite(Number(strength?.push?.supportHeightCm))&&'apoyo '+pdfNum(strength.push.supportHeightCm,1)+' cm',
        'válida '+pdfBool(strength?.push?.valid),
        strength?.push?.notes,
      ]),y);
      y=pdfField(page,fonts,'REMO TRX',strength?.trxRow?.skipped?('No realizado: '+pdfSafe(strength?.trxRow?.skipReason,180)):pdfJoin([
        pdfNum(strength?.trxRow?.repetitions)+' rep',
        Number.isFinite(Number(strength?.trxRow?.handleHeightCm))&&'asas '+pdfNum(strength.trxRow.handleHeightCm,1)+' cm',
        Number.isFinite(Number(strength?.trxRow?.heelDistanceCm))&&'talones '+pdfNum(strength.trxRow.heelDistanceCm,1)+' cm',
        Number.isFinite(Number(strength?.trxRow?.bodyAngleDeg))&&'ángulo '+pdfNum(strength.trxRow.bodyAngleDeg,1)+'°',
        strength?.trxRow?.position,
        'válida '+pdfBool(strength?.trxRow?.valid),
      ]),y);
      y=pdfField(page,fonts,'TRONCO / ESTABILIDAD',strength?.core?.skipped?('No realizado: '+pdfSafe(strength?.core?.skipReason,180)):pdfJoin([
        'frontal '+pdfNum(strength?.core?.frontPlankSeconds)+' s',
        'lateral izq. '+pdfNum(strength?.core?.sidePlankLeftSeconds)+' s',
        'lateral der. '+pdfNum(strength?.core?.sidePlankRightSeconds)+' s',
        strength?.core?.quality,
        strength?.core?.pain,
      ]),y);
      y=pdfField(page,fonts,'CADENA POSTERIOR',pdfJoin([strength?.posteriorChain?.protocol,Number.isFinite(Number(strength?.posteriorChain?.seconds))&&pdfNum(strength.posteriorChain.seconds)+' s',strength?.posteriorChain?.notPerformedReason,strength?.posteriorChain?.pain]),y);
      pdfField(page,fonts,'OBSERVACIONES GENERALES',strength?.notes||'Sin observaciones adicionales',y);
    }

    n+=1;
    {
      const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Capacidad de esfuerzo','Protocolo, recuperación, síntomas y validez');
      pdfMetric(page,fonts,'FC reposo',Number.isFinite(Number(cardio?.restingHr))?pdfNum(cardio.restingHr)+' lpm':'—',PDF_M,674);
      pdfMetric(page,fonts,'FC final',Number.isFinite(Number(cardio?.finalHr))?pdfNum(cardio.finalHr)+' lpm':'—',PDF_M+160,674);
      pdfMetric(page,fonts,'Recuperación 1 min',Number.isFinite(Number(cardio?.deltaOneMinute))?pdfNum(cardio.deltaOneMinute)+' lpm':'—',PDF_M+320,674);
      let y=585;
      y=pdfField(page,fonts,'PROTOCOLO',cardio?.skipped?('No realizado: '+pdfSafe(cardio?.skipReason,180)):pdfProtocolName(cardio),y);
      y=pdfField(page,fonts,'CONFIGURACIÓN',pdfJoin([
        Number.isFinite(Number(cardio?.durationSeconds))&&pdfNum(cardio.durationSeconds)+' s',
        Number.isFinite(Number(cardio?.speedKmh))&&pdfNum(cardio.speedKmh,1)+' km/h',
        Number.isFinite(Number(cardio?.inclinePercent))&&pdfNum(cardio.inclinePercent,1)+'% inclinación',
        Number.isFinite(Number(cardio?.stepHeightCm))&&'escalón '+pdfNum(cardio.stepHeightCm,1)+' cm',
        Number.isFinite(Number(cardio?.cadenceBpm))&&pdfNum(cardio.cadenceBpm)+' pulsos/min',
        Number.isFinite(Number(cardio?.chairHeightCm))&&'silla '+pdfNum(cardio.chairHeightCm,1)+' cm',
      ]),y);
      y=pdfField(page,fonts,'RECUPERACIÓN',pdfJoin([
        Number.isFinite(Number(cardio?.oneMinuteHr))&&'FC +1 min '+pdfNum(cardio.oneMinuteHr)+' lpm',
        Number.isFinite(Number(cardio?.twoMinuteHr))&&'FC +2 min '+pdfNum(cardio.twoMinuteHr)+' lpm',
        Number.isFinite(Number(cardio?.deltaTwoMinute))&&'Δ 2 min '+pdfNum(cardio.deltaTwoMinute)+' lpm',
        cardio?.recoveryMode,
      ]),y);
      y=pdfField(page,fonts,'ESFUERZO / VALIDEZ',pdfJoin([Number.isFinite(Number(cardio?.rpe))&&'RPE '+pdfNum(cardio.rpe,1)+'/10','válida '+pdfBool(cardio?.valid),cardio?.hrMethod]),y);
      y=pdfField(page,fonts,'SÍNTOMAS',cardio?.symptoms||'Sin síntomas registrados',y);
      y=pdfField(page,fonts,'MOTIVO DE DETENCIÓN',cardio?.stopReason||'Sin detención anticipada registrada',y);
      pdfField(page,fonts,'NOTAS',cardio?.notes||'Sin observaciones adicionales',y);
    }

    n+=1;
    {
      const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Cobertura, validez y limitaciones','Qué puede concluirse y qué debe conservarse como referencia individual');
      pdfMetric(page,fonts,'Movilidad',pdfDomainScore(scoring,'mobility'),PDF_M,674);
      pdfMetric(page,fonts,'Fuerza funcional',pdfDomainScore(scoring,'strength'),PDF_M+160,674);
      pdfMetric(page,fonts,'Capacidad funcional',pdfDomainScore(scoring,'cardio'),PDF_M+320,674);
      let y=585;
      y=pdfField(page,fonts,'PUNTUACIÓN GLOBAL',global?.available?pdfNum(global?.score10,1)+'/10 · confianza '+(global?.confidence==='high'?'alta':global?.confidence==='moderate'?'moderada':'insuficiente'):'No disponible · cobertura insuficiente',y);
      y=pdfField(page,fonts,'COBERTURA NORMATIVA',String(global?.coverage?.scoredDomains||0)+'/3 dominios puntuables',y);
      y=pdfField(page,fonts,'COMPOSICIÓN CORPORAL','Descriptiva y longitudinal; no modifica la nota funcional',y);
      y=pdfField(page,fonts,'FOTOGRAMETRÍA',photoReport?.available?('Disponible · calidad '+photoQuality(photoReport)):'Sin evidencia fotogramétrica incorporada',y);
      y=pdfField(page,fonts,'BIOIMPEDANCIA ORIGINAL',annex?'Incorporada como anexo del documento emitido':'Sin documento externo incorporado',y);
      y=pdfField(page,fonts,'CRITERIO DE INTERPRETACIÓN','No se mezclan baremos incompatibles. Los protocolos adaptados se conservan como referencia individual y cada reevaluación debe respetar variante y configuración.',y);
      pdfField(page,fonts,'LÍMITE','Evaluación de rendimiento y entrenamiento; no sustituye una evaluación clínica ni convierte una ausencia de dato en normalidad.',y);
    }

    n+=1;
    {
      const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Trazabilidad técnica','Versiones, comparabilidad y evidencia del documento emitido');
      let y=674;
      y=pdfField(page,fonts,'VERSIÓN DE PROTOCOLO',assessmentMeta?.protocolVersion||'Sin versión registrada',y);
      y=pdfField(page,fonts,'CIERRE DE LA SESIÓN',assessmentMeta?.completedAt||draft?.updatedAt||'Sin registro',y);
      y=pdfField(page,fonts,'MOTOR DE BAREMOS',scoring?.engineVersion||'Sin versión registrada',y);
      y=pdfField(page,fonts,'EXPEDIENTE',profile?.email?pdfJoin([profile?.email,profile?.phone]):'Identidad vinculada al cliente del expediente',y);
      page.drawText('Protocolos registrados',{x:PDF_M,y,size:10.5,font:fonts.bold,color:PDF_C.ink});
      y-=19;
      const records=Array.isArray(draft?.protocolRecords)?draft.protocolRecords.slice(0,12):[];
      if(!records.length)page.drawText('Sin registros adicionales.',{x:PDF_M,y,size:9,font:fonts.regular,color:PDF_C.muted});
      for(const record of records){
        const row=[record?.testName||'Prueba',record?.side,record?.variant&&'variante '+record.variant,record?.configuration&&'config. '+record.configuration,record?.protocolVersion&&'v. '+record.protocolVersion,record?.valid===true?'válida':record?.valid===false?'no válida':'sin confirmar'].filter(Boolean).join(' · ');
        y=pdfText(page,fonts.regular,row,PDF_M,y,PDF_W-PDF_M*2,8.2,10.8,PDF_C.ink2,2)-4;
        if(y<120)break;
      }
      pdfText(page,fonts.regular,'El Diagnóstico IRI conserva el punto de partida. El seguimiento y la evolución permanecen separados para no mezclar la evaluación inicial con el progreso posterior.',PDF_M,82,PDF_W-PDF_M*2,8.8,12,PDF_C.ink2,5);
    }
  }

  if(annex){
    n+=1;
    const page=pdfPage(doc,fonts,n,audience,audience==='cliente'?'05':'06','Bioimpedancia original','Anexo incorporado al documento emitido');
    page.drawText('Documento original incorporado',{x:PDF_M,y:640,size:15,font:fonts.serifBold,color:PDF_C.ink});
    pdfText(page,fonts.regular,annex.kind==='pdf'?'Se adjuntan '+String(annex.displayPages)+' de '+String(annex.totalPages)+' página(s) del documento original de bioimpedancia a continuación.':'La imagen original de bioimpedancia se incorpora como la siguiente página del informe.',PDF_M,610,PDF_W-PDF_M*2,10,15,PDF_C.ink2,5);
    if(annex.truncated)pdfText(page,fonts.bold,'Por seguridad de tamaño, el anexo visible se limita a '+String(annex.displayPages)+' páginas. El original se conserva vinculado al IRI.',PDF_M,540,PDF_W-PDF_M*2,9.2,13,PDF_C.gold,4);
  }

  return new Uint8Array(await doc.save({useObjectStreams:true,addDefaultPage:false}));
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
async function issueReport({userClient,service,actorUserId,actorEmail,assessmentId,audience,appOrigin}:any){
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
  const coachName=text(profileResult.data?.display_name,160)||'Coach IBERFIT';
  const logoUrl=`${appOrigin}/public/isotipo-iberfit.png`;
  const signatureUrl=/carlos|iberfit\.cl@gmail\.com/u.test(coachName.toLowerCase())
    ?`${appOrigin}/m26/assets/iberfit-signature-carlos.svg`:'';
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

  let pdf=await renderPdf({draft,audience,clientName:clientResult.data.name||'Cliente IBERFIT',coachName,iriOnly:authz.data?.iriOnly===true,photoReport:photoState.report,annex,appOrigin,assessmentMeta:{protocolVersion:assessment.protocol_version,completedAt:assessment.completed_at},signatureEligible:/carlos/iu.test(coachName)||String(actorEmail||'').toLowerCase()==='iberfit.cl@gmail.com'});
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
    renderer:'pdf-lib/deterministic-v1',
    taggedRequested:false,outlineRequested:false,preferCssPageSize:false,printBackground:false,deterministicLayout:true,
    postProcessedWithPdfLib:true,
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
  const actorEmail=String(auth.data?.user?.email||'').trim().toLowerCase();
  if(auth.error||!UUID.test(actorUserId))return json(401,{ok:false,code:'IRI_REPORT_AUTH_REQUIRED',version:FUNCTION_VERSION},origin,allowed);
  const service=createClient(supabaseUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

  try{
    if(action==='health'){
      const context=await userClient.rpc('iberfit_application_context_v14');
      if(context.error||context.data?.ok!==true)throw context.error||new Error('IRI_REPORT_APPLICATION_CONTEXT_REQUIRED');
      const roles=Array.isArray(context.data?.roles)?context.data.roles.map((value:unknown)=>String(value||'').toLowerCase()):[];
      if(!roles.some((role:string)=>role==='admin'||role==='coach'))throw new Error('IRI_REPORT_HEALTH_SCOPE_FORBIDDEN');
      return json(200,{
        ok:true,version:FUNCTION_VERSION,projectRef,
        rendererConfigured:true,
        renderer:'pdf-lib/deterministic-v1',
        issuedBucket:ISSUED_BUCKET,
      },origin,allowed);
    }
    if(action==='issue'){
      const assessmentId=assertUuid(body?.assessmentId,'IRI_REPORT_ASSESSMENT_INVALID');
      const audience=audienceDb(body?.audience);
      const result=await issueReport({
        userClient,service,actorUserId,actorEmail,assessmentId,audience,appOrigin,
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
    const status=/AUTH_REQUIRED/u.test(code)?401:/FORBIDDEN|SCOPE|PRIVILEGED|ASSURANCE|WEBAUTHN/u.test(code)?403:/NOT_FOUND/u.test(code)?404:/SERVER_CONFIG/u.test(code)?503:400;
    console.error('[iri-report-emission]',code);
    return json(status,{ok:false,code,version:FUNCTION_VERSION},origin,allowed);
  }
});
