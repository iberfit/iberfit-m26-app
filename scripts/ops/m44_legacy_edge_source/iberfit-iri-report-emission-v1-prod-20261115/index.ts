import {createClient} from 'npm:@supabase/supabase-js@2.112.4';
import {PDFDocument,StandardFonts,rgb} from 'npm:pdf-lib@1.17.1';
import {confirmedFirstSessionDraft,firstSessionCompletion,validateFirstSessionDraft} from './vendor/workflows/iri-first-session.js';
import {iriProtocolById} from './vendor/workflows/iri-protocol-catalog.js';
import {scoreIriPerformance} from './vendor/norms/iri-scoring.js';
import {clientIriAreaRatings} from './vendor/workflows/iri-client-area-ratings.js';
import {buildIriPhotogrammetryDecisionSupport} from './vendor/workflows/iri-evidence-engine.js';
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
const TEMPLATE_VERSION='m26-iri-report-premium-v4';
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
  page.drawLine({start:{x,y:y-2},end:{x:x+w,y:y-2},thickness:1.05,color:PDF_C.gold,opacity:.72});
  page.drawText(pdfSafe(label,64).toUpperCase(),{x,y:y-17,size:6.6,font:fonts.bold,color:PDF_C.muted});
  page.drawText(pdfSafe(value,80),{x,y:y-39,size:15.2,font:fonts.serifBold,color:PDF_C.ink});
  if(note)page.drawText(pdfSafe(note,90),{x,y:y-51,size:6.15,font:fonts.regular,color:PDF_C.muted});
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
function pdfEditorialPanel(page:any,fonts:any,title:string,items:unknown[],x:number,topY:number,w:number){
  const rows=(Array.isArray(items)?items:[]).map((item)=>pdfSafe(item,420)).filter(Boolean).slice(0,4);
  if(!rows.length)return topY;
  const wrapped=rows.map((item)=>pdfWrap(fonts.regular,8.45,item,w-40).slice(0,3));
  const height=34+wrapped.reduce((sum,lines)=>sum+lines.length*11.1+7,0);
  const bottom=topY-height;
  page.drawRectangle({x,y:bottom,width:w,height,color:PDF_C.cream2,opacity:.13,borderColor:PDF_C.gold,borderWidth:.55,borderOpacity:.32});
  page.drawRectangle({x,y:bottom,width:3,height,color:PDF_C.gold,opacity:.78});
  page.drawText(pdfSafe(title,90),{x:x+15,y:topY-21,size:10,font:fonts.bold,color:PDF_C.ink});
  let cy=topY-42;
  for(const lines of wrapped){
    page.drawCircle({x:x+18,y:cy+3,size:1.55,color:PDF_C.gold});
    lines.forEach((line,index)=>page.drawText(line,{x:x+29,y:cy-index*11.1,size:8.45,font:fonts.regular,color:PDF_C.ink2}));
    cy-=lines.length*11.1+7;
  }
  return bottom-8;
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
  if(protocol==='ymca-3min-standard')return 'Prueba de escalón YMCA · 3 minutos';
  if(protocol==='1msts-standard')return 'Sentarse y levantarse · 1 minuto';
  if(protocol==='iberfit-3min-adapted')return 'Escalón adaptado · 3 minutos';
  return protocol||'Protocolo no identificado';
}
function pdfClientProtocolName(value:unknown){
  const raw=pdfSafe(value,100);
  const lower=raw.toLocaleLowerCase('es');
  if(lower.includes('back-saver')||lower.includes('sit-and-reach'))return 'Flexión anterior sentado unilateral';
  if(lower.includes('thomas'))return 'Thomas modificado';
  if(lower.includes('1msts'))return 'Sentarse y levantarse · 1 minuto';
  if(lower.includes('ymca'))return 'Prueba de escalón YMCA · 3 minutos';
  if(lower.includes('step'))return raw.replace(/step/giu,'escalón');
  return raw||'Prueba';
}
function pdfClientCardioValue(value:unknown){
  const original=String(value||'').trim();
  const raw=original.toLowerCase();
  const labels:Record<string,string>={
    jog:'Trote suave',walk:'Caminar',run:'Correr',
    manual:'Medición manual',watch:'Reloj / sensor óptico','chest-strap':'Banda pectoral',treadmill:'Sensor de la cinta',
    'standing-passive':'De pie · pasiva','walking-active':'Caminando · activa','seated-passive':'Sentada · pasiva','other-documented':'Otra · documentada',
    knees:'Rodillas apoyadas','knees-supported':'Rodillas apoyadas',
    'standard-barefoot':'Descalza · protocolo estándar','box-standard':'Caja estándar','table-edge-standard':'Borde de camilla',
    'seated-90-90':'Sentada 90/90','counterbalance-support':'Apoyo con contrapeso','bioimpedancia-tetrapolar':'Bioimpedancia tetrapolar',
  };
  return labels[raw]||pdfSafe(original.replaceAll('-',' '),100);
}
function pdfAreaRating(rating:any){
  return rating&&Number.isFinite(Number(rating.score))?pdfNum(rating.score,1)+'/10':'—';
}
function pdfStrengthVariant(value:unknown){
  const variant=String(value||'').trim().toLowerCase();
  if(variant==='standard')return 'Flexión estándar';
  if(variant==='incline')return 'Flexión inclinada';
  if(variant==='knees'||variant==='knees-supported')return 'Apoyo de rodillas';
  return pdfSafe(value,80)||'Variante no registrada';
}
function pdfProtocolSide(value:unknown){
  const side=String(value||'').trim().toLowerCase();
  const labels=({left:'Izquierda',right:'Derecha',bilateral:'Bilateral',both:'Bilateral','not-applicable':'','not applicable':'','not_applicable':'',na:'','n/a':''} as Record<string,string>);
  if(Object.prototype.hasOwnProperty.call(labels,side))return labels[side];
  return pdfSafe(String(value||'').replaceAll('-',' '),70);
}
function pdfTraceVersion(value:unknown){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const match=raw.match(/^iri-scoring-(\d{4}\.\d{2})-v(\d+)$/u);
  if(match)return 'Motor IRI '+match[1]+' · v'+match[2];
  return pdfSafe(raw.replaceAll('_',' ').replaceAll('-',' '),90);
}
function pdfTraceDateTime(value:unknown){
  const raw=String(value||'').trim();
  if(!raw)return 'Sin registro';
  const date=new Date(raw);
  if(Number.isNaN(date.getTime()))return pdfSafe(raw,80);
  return new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Santiago'}).format(date).replace(',', ' ·');
}
function pdfProtocolVersion(value:unknown){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const catalog=raw.match(/^iri-protocols-(\d{4}\.\d{2})-v(\d+)$/u);
  if(catalog)return 'Catálogo IRI '+catalog[1]+' · v'+catalog[2];
  return pdfSafe(raw.replaceAll('_',' ').replaceAll('-',' '),90);
}
function pdfProtocolVariant(record:any){
  const variant=String(record?.variant||'').trim();
  if(!variant)return '';
  const protocol=iriProtocolById(record?.testId);
  const catalogLabel=protocol?.variants?.find((item:any)=>String(item?.id||'')===variant)?.label;
  if(catalogLabel)return pdfSafe(catalogLabel,120);
  if(String(record?.testId||'')==='push-test')return pdfStrengthVariant(variant);
  return pdfSafe(variant.replaceAll('-',' '),120);
}
function pdfClientProtocolRows(records:any[]){
  const groups=new Map<string,{name:string,sides:string[],variants:string[],configurations:string[]}>();
  for(const record of Array.isArray(records)?records:[]){
    const key=String(record?.testId||record?.testName||'prueba');
    const group=groups.get(key)||{name:pdfClientProtocolName(record?.testName||'Prueba'),sides:[],variants:[],configurations:[]};
    const side=pdfProtocolSide(record?.side);
    const variant=pdfClientCardioValue(pdfProtocolVariant(record));
    const configuration=pdfClientCardioValue(record?.configuration);
    if(side&&!group.sides.includes(side))group.sides.push(side);
    if(variant&&!group.variants.includes(variant))group.variants.push(variant);
    if(configuration&&!group.configurations.includes(configuration)&&!group.variants.includes(configuration))group.configurations.push(configuration);
    groups.set(key,group);
  }
  return [...groups.values()].slice(0,6).map((group)=>{
    const sides=group.sides.length?group.sides.join(' y '):'';
    return pdfJoin([group.name,sides,group.variants.join(' / '),group.configurations.join(' / ')]);
  }).filter(Boolean);
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

function pdfClientFinite(value:unknown){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function pdfClientBasisLabel(rating:any){
  return rating?.basis==='baremo-compatible'?'Baremo compatible':'Valoración IBERFIT';
}
function pdfClientFooter(page:any,fonts:any,n:number){
  page.drawLine({start:{x:PDF_M,y:38},end:{x:PDF_W-PDF_M,y:38},thickness:.45,color:PDF_C.ink,opacity:.18});
  page.drawText('IBERFIT',{x:PDF_M,y:22,size:6.4,font:fonts.bold,color:PDF_C.ink});
  page.drawText('Diagnóstico, planificación, control y seguimiento',{x:PDF_M+37,y:22,size:5.9,font:fonts.regular,color:PDF_C.muted});
  page.drawText(String(n).padStart(2,'0'),{x:PDF_W-PDF_M-12,y:22,size:6.1,font:fonts.bold,color:PDF_C.muted});
}
function pdfClientPage(doc:any,fonts:any,n:number,kicker:string,title:string,subtitle=''){
  const page=doc.addPage([PDF_W,PDF_H]);
  page.drawRectangle({x:0,y:0,width:PDF_W,height:PDF_H,color:PDF_C.cream});
  page.drawText(String(Math.max(1,n-1)).padStart(2,'0'),{x:PDF_M,y:PDF_H-67,size:15,font:fonts.serifBold,color:PDF_C.gold});
  page.drawText(pdfSafe(kicker,90).toUpperCase(),{x:PDF_M+62,y:PDF_H-49,size:6.2,font:fonts.bold,color:PDF_C.muted});
  page.drawText(pdfSafe(title,120),{x:PDF_M+62,y:PDF_H-72,size:22.5,font:fonts.serifBold,color:PDF_C.ink});
  page.drawLine({start:{x:PDF_M,y:PDF_H-91},end:{x:PDF_W-PDF_M,y:PDF_H-91},thickness:.55,color:PDF_C.ink,opacity:.22});
  if(subtitle)pdfText(page,fonts.serif,subtitle,PDF_M,PDF_H-124,PDF_W-PDF_M*2,10.1,13.4,PDF_C.ink2,4);
  pdfClientFooter(page,fonts,n);
  return page;
}
function pdfClientLabel(page:any,fonts:any,label:string,value:unknown,x:number,y:number,w:number){
  page.drawLine({start:{x,y:y+8},end:{x:x+w,y:y+8},thickness:.45,color:PDF_C.ink,opacity:.18});
  page.drawText(pdfSafe(label,72).toUpperCase(),{x,y,size:6.1,font:fonts.bold,color:PDF_C.gold});
  return pdfText(page,fonts.serif,value||'—',x,y-18,w,10.1,13.4,PDF_C.ink,5);
}
function pdfClientAreaMetric(page:any,fonts:any,label:string,rating:any,x:number,y:number,w:number){
  page.drawLine({start:{x,y:y+8},end:{x:x+w,y:y+8},thickness:.55,color:PDF_C.gold,opacity:.7});
  page.drawText(pdfSafe(label,72).toUpperCase(),{x,y,size:6.2,font:fonts.bold,color:PDF_C.muted});
  page.drawText(pdfAreaRating(rating),{x:x+w-55,y:y-2,size:14.5,font:fonts.serifBold,color:PDF_C.ink});
  page.drawText(pdfClientBasisLabel(rating),{x,y:y-20,size:6.2,font:fonts.regular,color:PDF_C.muted});
}
function pdfClientRecoveryGraph(page:any,fonts:any,cardio:any,x:number,y:number,w:number,h:number){
  const points=[
    {label:'Final',value:pdfClientFinite(cardio?.finalHr)},
    {label:'1 min',value:pdfClientFinite(cardio?.oneMinuteHr)},
    {label:'2 min',value:pdfClientFinite(cardio?.twoMinuteHr)},
  ].filter((item)=>item.value!==null);
  if(points.length<2)return;
  const values=points.map((item)=>Number(item.value));
  const min=Math.min(...values)-8,max=Math.max(...values)+8,range=Math.max(1,max-min);
  const coords=points.map((item,index)=>({
    ...item,
    px:x+(points.length===1?0:index*(w/(points.length-1))),
    py:y+((Number(item.value)-min)/range)*h,
  }));
  page.drawLine({start:{x,y},end:{x:x+w,y},thickness:.45,color:PDF_C.ink,opacity:.2});
  for(let index=0;index<coords.length-1;index+=1){
    page.drawLine({start:{x:coords[index].px,y:coords[index].py},end:{x:coords[index+1].px,y:coords[index+1].py},thickness:1.6,color:PDF_C.ink2,opacity:.85});
  }
  for(const point of coords){
    page.drawCircle({x:point.px,y:point.py,size:3.1,color:PDF_C.gold});
    page.drawText(String(point.value),{x:point.px-6,y:point.py+9,size:6.5,font:fonts.bold,color:PDF_C.ink});
    page.drawText(point.label,{x:point.px-9,y:y-16,size:6,font:fonts.regular,color:PDF_C.muted});
  }
}
async function renderClientPdf({draft,clientName,coachName,iriOnly,photoReport,annex,appOrigin,assessmentMeta,signatureEligible}:any){
  const doc=await PDFDocument.create();
  doc.setTitle('Informe IRI · '+pdfSafe(clientName,120));
  doc.setAuthor('IBERFIT');
  doc.setSubject('Diagnóstico inicial IRI');
  doc.setCreator('IBERFIT '+ENGINE_VERSION);
  doc.setProducer('pdf-lib');
  const fonts:any={
    regular:await doc.embedFont(StandardFonts.Helvetica),
    bold:await doc.embedFont(StandardFonts.HelveticaBold),
    serif:await doc.embedFont(StandardFonts.TimesRoman),
    serifBold:await doc.embedFont(StandardFonts.TimesRomanBold),
    serifItalic:await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  const client=pdfSafe(clientName,140)||'Cliente IBERFIT';
  const coach=pdfSafe(coachName,140)||'IBERFIT';
  const scoring=scoreIriPerformance(draft);
  const ratings=clientIriAreaRatings(draft,scoring);
  const logo=await pdfImage(doc,appOrigin+'/public/isotipo-iberfit.png');
  const signaturePath=signatureEligible?await pdfSvgPath(appOrigin+'/m26/assets/iberfit-signature-carlos.svg'):'';
  if(logo)fonts.brandMark=logo;

  let n=1;
  {
    const page=doc.addPage([PDF_W,PDF_H]);
    page.drawRectangle({x:0,y:0,width:PDF_W,height:PDF_H,color:PDF_C.dark});
    page.drawRectangle({x:0,y:0,width:5,height:PDF_H,color:PDF_C.gold});
    if(logo){
      const logoFit=pdfFit(logo,72,72);
      page.drawImage(logo,{x:PDF_M,y:PDF_H-92,width:logoFit.w,height:logoFit.h});
      const watermark=pdfFit(logo,330,330);
      page.drawImage(logo,{x:PDF_W-watermark.w+48,y:280,width:watermark.w,height:watermark.h,opacity:.045});
    }else{
      page.drawText('IBERFIT',{x:PDF_M,y:PDF_H-74,size:9,font:fonts.bold,color:PDF_C.gold2});
    }
    page.drawText(iriOnly?'EVALUACIÓN INDEPENDIENTE · SOLO IRI':'DIAGNÓSTICO INICIAL IRI',{x:PDF_M,y:PDF_H-158,size:6.5,font:fonts.bold,color:PDF_C.gold2});
    page.drawText('Tu punto',{x:PDF_M,y:PDF_H-214,size:31,font:fonts.serifBold,color:PDF_C.cream});
    page.drawText('de partida.',{x:PDF_M,y:PDF_H-249,size:31,font:fonts.serifBold,color:PDF_C.cream});
    page.drawLine({start:{x:PDF_M,y:PDF_H-268},end:{x:PDF_M+92,y:PDF_H-268},thickness:1.2,color:PDF_C.gold});
    pdfText(page,fonts.serif,'Una fotografía clara de dónde estás hoy y qué merece atención primero.',PDF_M,PDF_H-292,250,10.2,13.4,PDF_C.cream2,4);
    page.drawLine({start:{x:PDF_M,y:176},end:{x:PDF_W-PDF_M,y:176},thickness:.55,color:PDF_C.cream2,opacity:.35});
    page.drawText('PERSONA EVALUADA',{x:PDF_M,y:152,size:6.1,font:fonts.bold,color:PDF_C.gold2});
    page.drawText(client,{x:PDF_M,y:130,size:15.5,font:fonts.serifBold,color:PDF_C.cream});
    page.drawText(pdfDate(draft?.assessmentDate),{x:PDF_M,y:114,size:6.5,font:fonts.regular,color:PDF_C.muted});
    page.drawLine({start:{x:PDF_M,y:92},end:{x:PDF_W-PDF_M,y:92},thickness:.55,color:PDF_C.gold,opacity:.6});
    page.drawText('DOCUMENTO',{x:PDF_M,y:76,size:5.8,font:fonts.bold,color:PDF_C.muted});
    page.drawText(iriOnly?'IRI independiente':'IRI · punto de partida',{x:PDF_M,y:61,size:7.8,font:fonts.bold,color:PDF_C.cream2});
    page.drawText('Entrenamiento personal con criterio · diagnóstico · planificación · control · seguimiento',{x:PDF_M,y:43,size:5.6,font:fonts.regular,color:PDF_C.gold2});
  }

  n+=1;
  {
    const page=pdfClientPage(doc,fonts,n,'Síntesis','Tu punto de partida','Este informe ordena lo que sabemos hoy sobre tu punto de partida y convierte la evaluación en prioridades que puedan guiar decisiones reales.');
    pdfClientAreaMetric(page,fonts,'Movimiento y movilidad',ratings.movement,PDF_M,650,205);
    pdfClientAreaMetric(page,fonts,'Fuerza',ratings.strength,PDF_M,596,205);
    pdfClientAreaMetric(page,fonts,'Recuperación',ratings.recovery,PDF_M,542,205);
    page.drawText('FORTALEZA PRINCIPAL',{x:315,y:650,size:6.1,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,Array.isArray(draft?.diagnosis?.strengths)&&draft.diagnosis.strengths.length?draft.diagnosis.strengths[0]:'Fortaleza pendiente de revisión',315,628,220,12.5,15.2,PDF_C.ink,5);
    page.drawLine({start:{x:315,y:570},end:{x:535,y:570},thickness:.45,color:PDF_C.ink,opacity:.18});
    page.drawText('PRIORIDAD PRINCIPAL',{x:315,y:549,size:6.1,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,Array.isArray(draft?.diagnosis?.priorities)&&draft.diagnosis.priorities.length?draft.diagnosis.priorities[0]:'Prioridad pendiente de revisión',315,527,220,12.5,15.2,PDF_C.ink,5);
    page.drawLine({start:{x:PDF_M,y:470},end:{x:535,y:470},thickness:.45,color:PDF_C.ink,opacity:.18});
    page.drawText('COMPARABILIDAD NORMATIVA',{x:PDF_M,y:447,size:6.2,font:fonts.bold,color:PDF_C.gold});
    const domains=scoring?.domainScores||{};
    const normText=[
      'Movilidad: '+(domains?.mobility?.scored?'baremo compatible':'valoración orientativa'),
      'Fuerza funcional: '+(domains?.strength?.scored?'baremo compatible':'valoración orientativa'),
      'Capacidad funcional: '+(domains?.cardio?.scored?'baremo compatible':'referencia individual'),
    ].join(' · ');
    pdfText(page,fonts.regular,normText,PDF_M,427,487,7.5,10.5,PDF_C.ink2,4);
    pdfText(page,fonts.serif,'Las valoraciones IBERFIT ayudan a entender el punto de partida. No se presenta una nota global cuando la cobertura normativa es parcial y no se extrapolan baremos de una prueba a otra.',PDF_M,375,487,9.5,13,PDF_C.ink2,6);
    page.drawText('LECTURA DEL ENTRENADOR',{x:PDF_M,y:300,size:6.2,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,draft?.diagnosis?.coachInterpretation||'Sin interpretación adicional registrada.',PDF_M,278,487,10.8,14.3,PDF_C.ink,8);
  }

  n+=1;
  {
    const page=pdfClientPage(doc,fonts,n,'Tu contexto','Contexto y objetivos','Comprender tu realidad permite interpretar mejor los resultados y decidir qué merece atención primero.');
    const profile=draft?.personProfile||{},interview=draft?.interview||{};
    pdfClientLabel(page,fonts,'Objetivo principal',profile?.primaryObjective||'Sin objetivo principal registrado',PDF_M,646,225);
    pdfClientLabel(page,fonts,'Objetivos secundarios',Array.isArray(profile?.secondaryObjectives)&&profile.secondaryObjectives.length?profile.secondaryObjectives.join(' · '):'Sin objetivos secundarios registrados',315,646,220);
    pdfClientLabel(page,fonts,'Experiencia y actividad actual',pdfJoin([interview?.trainingExperience,interview?.currentTraining]),PDF_M,530,225);
    pdfClientLabel(page,fonts,'Disponibilidad',pdfJoin([interview?.availability,profile?.preferredSchedule]),315,530,220);
    pdfClientLabel(page,fonts,'Entorno de entrenamiento',pdfJoin([profile?.modality,profile?.locationType,profile?.trainingAddress]),PDF_M,414,225);
    pdfClientLabel(page,fonts,'Material disponible',Array.isArray(profile?.equipment)&&profile.equipment.length?profile.equipment.join(' · '):'Sin material registrado',315,414,220);
    pdfClientLabel(page,fonts,'Preferencias',interview?.preferences||'Sin preferencias especiales registradas',PDF_M,298,487);
    pdfClientLabel(page,fonts,'Consideraciones declaradas',interview?.restrictions||'Sin restricciones declaradas',PDF_M,194,487);
  }

  n+=1;
  {
    const page=pdfClientPage(doc,fonts,n,'Composición corporal','Composición corporal','La composición corporal describe el punto de partida medido y las condiciones de esa medición. Se utiliza para seguimiento, no como juicio estético ni como nota funcional.');
    const body=draft?.bodyComposition||{};
    page.drawText('GRASA CORPORAL',{x:PDF_M,y:612,size:6.1,font:fonts.bold,color:PDF_C.gold});
    page.drawText(body?.skipped?'—':pdfNum(body.bodyFatPercent,1)+'%',{x:PDF_M,y:558,size:39,font:fonts.serifBold,color:PDF_C.ink});
    page.drawText('Método · '+pdfClientCardioValue(body?.method||body?.device||'Sin método registrado'),{x:PDF_M,y:536,size:6.2,font:fonts.regular,color:PDF_C.muted});
    const lean=pdfClientFinite(body?.leanMassKg)!==null?body.leanMassKg:body?.muscleMassKg;
    const metrics=[
      ['Peso',body?.skipped?'No evaluado':pdfNum(body?.weightKg,1)+' kg'],
      ['Masa grasa',body?.skipped?'No evaluado':(pdfClientFinite(body?.fatMassKg)!==null?pdfNum(body.fatMassKg,1)+' kg':'—')],
      ['Masa libre de grasa',body?.skipped?'No evaluado':(pdfClientFinite(body?.leanMassKg)!==null?pdfNum(body.leanMassKg,1)+' kg':'—')],
      ['Masa muscular',body?.skipped?'No evaluado':(pdfClientFinite(body?.muscleMassKg)!==null?pdfNum(body.muscleMassKg,1)+' kg':'—')],
      ['Agua corporal',body?.skipped?'No evaluado':pdfNum(body?.bodyWaterPercent,1)+'%'],
      ['Cintura',body?.skipped?'No evaluado':pdfNum(body?.waistCm,1)+' cm'],
      ['Grasa visceral',body?.skipped?'No evaluado':pdfNum(body?.visceralFatLevel)],
    ];
    let y=618;
    for(const [label,value] of metrics){
      page.drawLine({start:{x:315,y:y+8},end:{x:535,y:y+8},thickness:.4,color:PDF_C.ink,opacity:.16});
      page.drawText(label,{x:315,y,size:6.1,font:fonts.regular,color:PDF_C.muted});
      page.drawText(String(value),{x:455,y,size:8.2,font:fonts.bold,color:PDF_C.ink});
      y-=42;
    }
    page.drawLine({start:{x:PDF_M,y:290},end:{x:535,y:290},thickness:.55,color:PDF_C.gold,opacity:.6});
    page.drawText('DOCUMENTO COMPLEMENTARIO',{x:PDF_M,y:268,size:6.1,font:fonts.bold,color:PDF_C.gold});
    page.drawText(annex?'Informe de bioimpedancia incorporado':'Sin documento original incorporado',{x:PDF_M,y:244,size:11.5,font:fonts.serifBold,color:PDF_C.ink});
    pdfText(page,fonts.regular,annex?'El archivo original se incorpora íntegro al final de este informe emitido. Sus valores no se reconstruyen ni se inventan; se conserva como evidencia del punto de partida.':'La composición registrada se conserva con el método y las condiciones disponibles en la evaluación.',PDF_M,219,487,8.3,11.6,PDF_C.ink2,6);
    if(pdfClientFinite(lean)!==null)page.drawText('Referencia de masa magra/muscular disponible: '+pdfNum(lean,1)+' kg',{x:PDF_M,y:145,size:6.4,font:fonts.regular,color:PDF_C.muted});
    page.drawText('CONDICIONES REGISTRADAS',{x:PDF_M,y:114,size:6.1,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.regular,body?.measurementConditions||'Sin condiciones de medición adicionales registradas.',PDF_M,96,487,7.4,10,PDF_C.ink2,3);
  }

  n+=1;
  {
    const page=pdfClientPage(doc,fonts,n,'Movimiento y movilidad','Movimiento y movilidad','Las mediciones se interpretan junto con control, calidad de movimiento y simetría. El objetivo es saber qué conviene preservar y qué merece trabajo.');
    const mobility=draft?.mobility||{};
    const al=pdfClientFinite(mobility?.ankle?.leftBest),ar=pdfClientFinite(mobility?.ankle?.rightBest);
    const pl=pdfClientFinite(mobility?.posteriorChain?.leftBest),pr=pdfClientFinite(mobility?.posteriorChain?.rightBest);
    pdfClientAreaMetric(page,fonts,'Valoración de movimiento',ratings.movement,PDF_M,646,205);
    page.drawText('RODILLA A PARED',{x:PDF_M,y:568,size:6.2,font:fonts.bold,color:PDF_C.gold});
    page.drawText('Izquierda',{x:PDF_M,y:542,size:6.2,font:fonts.regular,color:PDF_C.muted});
    page.drawText(al===null?'—':pdfNum(al,1)+' cm',{x:PDF_M,y:513,size:18,font:fonts.serifBold,color:PDF_C.ink});
    page.drawText('Derecha',{x:170,y:542,size:6.2,font:fonts.regular,color:PDF_C.muted});
    page.drawText(ar===null?'—':pdfNum(ar,1)+' cm',{x:170,y:513,size:18,font:fonts.serifBold,color:PDF_C.ink});
    page.drawText('Diferencia',{x:285,y:542,size:6.2,font:fonts.regular,color:PDF_C.muted});
    page.drawText(al!==null&&ar!==null?pdfNum(Math.abs(al-ar),1)+' cm':'—',{x:285,y:513,size:18,font:fonts.serifBold,color:PDF_C.ink});
    page.drawLine({start:{x:PDF_M,y:477},end:{x:535,y:477},thickness:.45,color:PDF_C.ink,opacity:.16});
    page.drawText('FLEXIÓN ANTERIOR SENTADO UNILATERAL',{x:PDF_M,y:451,size:6.2,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,pl!==null&&pr!==null?'Izquierda '+pdfNum(pl,1)+' cm · Derecha '+pdfNum(pr,1)+' cm · diferencia '+pdfNum(Math.abs(pl-pr),1)+' cm':'No evaluado o sin datos comparables',PDF_M,427,487,10,13.5,PDF_C.ink,4);
    page.drawText('SENTADILLA OBSERVADA',{x:PDF_M,y:361,size:6.2,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,pdfJoin([mobility?.assistedSquat?.depth,mobility?.assistedSquat?.knees,mobility?.assistedSquat?.trunk]),PDF_M,337,487,10,13.5,PDF_C.ink,5);
    page.drawText('LECTURA DEL ENTRENADOR',{x:PDF_M,y:252,size:6.2,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,draft?.diagnosis?.trainingImplications||draft?.diagnosis?.coachInterpretation||'Sin interpretación adicional registrada.',PDF_M,228,487,10.4,14,PDF_C.ink,7);
  }

  if(photoReport?.available){
    n+=1;
    const page=pdfClientPage(doc,fonts,n,'Evidencia visual','Análisis fotogramétrico','La fotogrametría documenta el punto de partida y se interpreta junto con movilidad, fuerza, síntomas y repetibilidad.');
    const lines=pdfPhotoMeasurementRows(photoReport?.measurements||{});
    const decisions=pdfPhotoDecisionRows(photoReport);
    page.drawText('CALIDAD DEL REGISTRO',{x:PDF_M,y:644,size:6.1,font:fonts.bold,color:PDF_C.gold});
    page.drawText(photoQuality(photoReport),{x:PDF_M,y:621,size:11.5,font:fonts.serifBold,color:PDF_C.ink});
    page.drawText('TRAZABILIDAD',{x:205,y:644,size:6.1,font:fonts.bold,color:PDF_C.gold});
    page.drawText('Revisión '+String(Number(photoReport.analysisRevision||0)),{x:205,y:621,size:11.5,font:fonts.serifBold,color:PDF_C.ink});
    let y=570;
    page.drawText('MEDICIONES VALIDADAS',{x:PDF_M,y,size:6.1,font:fonts.bold,color:PDF_C.gold});y-=23;
    for(const line of lines.length?lines:['Sin mediciones numéricas publicables en este informe.']){
      y=pdfText(page,fonts.serif,line,PDF_M,y,230,9.4,12.6,PDF_C.ink,3)-7;
      if(y<320)break;
    }
    page.drawText('LECTURA PARA ENTRENAMIENTO',{x:315,y:570,size:6.1,font:fonts.bold,color:PDF_C.gold});
    let rightY=547;
    for(const item of decisions.length?decisions:['La fotogrametría se conserva como referencia inicial y no se interpreta de forma aislada.']){
      rightY=pdfText(page,fonts.serif,item,315,rightY,220,9.4,12.6,PDF_C.ink,5)-10;
      if(rightY<320)break;
    }
    const photos=Array.isArray(photoReport?.photos)?photoReport.photos.slice(0,4):[];
    if(photos.length){
      page.drawText('LÁMINA AUTORIZADA',{x:PDF_M,y:274,size:6.1,font:fonts.bold,color:PDF_C.gold});
      const slots=[{x:PDF_M,y:104},{x:171,y:104},{x:294,y:104},{x:417,y:104}];
      for(let i=0;i<photos.length;i+=1){
        const image=await pdfImage(doc,String(photos[i]?.url||''));
        if(!image)continue;
        const fit=pdfFit(image,105,145),slot=slots[i];
        page.drawImage(image,{x:slot.x+(105-fit.w)/2,y:slot.y+(145-fit.h)/2,width:fit.w,height:fit.h});
        page.drawText(pdfPhotoView(photos[i]?.view),{x:slot.x,y:88,size:5.8,font:fonts.bold,color:PDF_C.muted});
      }
    }else{
      page.drawLine({start:{x:PDF_M,y:280},end:{x:535,y:280},thickness:.45,color:PDF_C.gold,opacity:.55});
      page.drawText('PRIVACIDAD DE LAS IMÁGENES',{x:PDF_M,y:254,size:6.1,font:fonts.bold,color:PDF_C.gold});
      pdfText(page,fonts.serif,'Las fotografías permanecen privadas porque no existe permiso específico para publicarlas en el documento Cliente. Las mediciones y conclusiones validadas pueden conservarse sin mostrar los originales.',PDF_M,230,487,9.4,12.8,PDF_C.ink2,6);
    }
  }

  n+=1;
  {
    const page=pdfClientPage(doc,fonts,n,'Fuerza por patrones','Fuerza','Cada prueba conserva su variante y configuración real. Las cifras se presentan como resultados observados y solo son comparables cuando se repite una referencia equivalente.');
    const strength=draft?.strength||draft?.strengthAssessment||{};
    const squat=pdfClientFinite(strength?.squat60?.repetitions);
    const chair=pdfClientFinite(strength?.chairStand?.repetitions);
    const lowerLabel=squat!==null?'Sentadilla libre · 60 s':'Silla · 30 s';
    const lowerValue=squat!==null?squat:chair;
    const push=pdfClientFinite(strength?.push?.repetitions),trx=pdfClientFinite(strength?.trxRow?.repetitions),plank=pdfClientFinite(strength?.core?.frontPlankSeconds);
    pdfClientAreaMetric(page,fonts,'Valoración de fuerza',ratings.strength,PDF_M,650,205);
    const boxes=[
      [lowerLabel,lowerValue===null?'—':pdfNum(lowerValue)+' rep',PDF_M,555],
      ['Empuje',push===null?'—':pdfNum(push)+' rep',315,555],
      ['Tracción · TRX',trx===null?'—':pdfNum(trx)+' rep',PDF_M,430],
      ['Estabilidad de tronco',plank===null?'—':pdfNum(plank)+' s',315,430],
    ];
    for(const [label,value,x,y] of boxes){
      page.drawLine({start:{x:Number(x),y:Number(y)+12},end:{x:Number(x)+220,y:Number(y)+12},thickness:.45,color:PDF_C.ink,opacity:.18});
      page.drawText(String(label).toUpperCase(),{x:Number(x),y:Number(y),size:6.1,font:fonts.bold,color:PDF_C.gold});
      page.drawText(String(value),{x:Number(x),y:Number(y)-33,size:20,font:fonts.serifBold,color:PDF_C.ink});
    }
    page.drawText('CÓMO SE HIZO',{x:PDF_M,y:278,size:6.1,font:fonts.bold,color:PDF_C.gold});
    const method=[
      strength?.push?.variant&&'Empuje: '+pdfStrengthVariant(strength.push.variant),
      strength?.trxRow?.handleHeightCm&&'TRX: asas '+pdfNum(strength.trxRow.handleHeightCm)+' cm',
      strength?.trxRow?.bodyAngleDeg&&'ángulo '+pdfNum(strength.trxRow.bodyAngleDeg)+'°',
      strength?.core?.quality&&'Plancha: '+pdfSafe(strength.core.quality,120),
    ].filter(Boolean).join(' · ');
    pdfText(page,fonts.serif,method||'La variante y configuración quedan registradas para poder repetir una referencia equivalente.',PDF_M,255,487,9.5,13,PDF_C.ink,6);
    page.drawText('DECISIÓN QUE APOYA',{x:PDF_M,y:165,size:6.1,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,draft?.diagnosis?.trainingImplications||'Progresar la fuerza de forma gradual, manteniendo técnica y referencias comparables.',PDF_M,142,487,9.8,13.2,PDF_C.ink2,5);
  }

  n+=1;
  {
    const page=pdfClientPage(doc,fonts,n,'Capacidad de esfuerzo','Capacidad de esfuerzo','La recuperación se lee dentro del protocolo realizado. En una prueba de campo se utiliza como referencia individual y no hereda baremos de otros protocolos.');
    const cardio=draft?.cardio||{};
    page.drawText(pdfProtocolName(cardio),{x:PDF_M,y:636,size:13,font:fonts.serifBold,color:PDF_C.ink});
    pdfClientRecoveryGraph(page,fonts,cardio,PDF_M+15,510,230,90);
    const metrics=[
      ['Velocidad',pdfClientFinite(cardio?.speedKmh)!==null?pdfNum(cardio.speedKmh,1)+' km/h':'—'],
      ['Inclinación',pdfClientFinite(cardio?.inclinePercent)!==null?pdfNum(cardio.inclinePercent,1)+'%':'—'],
      ['Recuperación 1 min',pdfClientFinite(cardio?.deltaOneMinute)!==null?pdfNum(cardio.deltaOneMinute)+' lpm':'—'],
      ['Recuperación 2 min',pdfClientFinite(cardio?.deltaTwoMinute)!==null?pdfNum(cardio.deltaTwoMinute)+' lpm':'—'],
    ];
    let mx=PDF_M,my=450;
    for(let i=0;i<metrics.length;i+=1){
      const [label,value]=metrics[i],x=i%2===0?PDF_M:170,y=i<2?my:my-76;
      page.drawText(label.toUpperCase(),{x,y,size:5.9,font:fonts.bold,color:PDF_C.gold});
      page.drawText(value,{x,y:y-27,size:16,font:fonts.serifBold,color:PDF_C.ink});
    }
    page.drawText('CÓMO SE REALIZÓ',{x:315,y:636,size:6.1,font:fonts.bold,color:PDF_C.gold});
    const how=[
      cardio?.locomotionMode&&'Modo: '+pdfClientCardioValue(cardio.locomotionMode),
      cardio?.hrMethod&&'Frecuencia cardiaca: '+pdfClientCardioValue(cardio.hrMethod),
      cardio?.recoveryMode&&'Recuperación: '+pdfClientCardioValue(cardio.recoveryMode),
      pdfClientFinite(cardio?.rpe)!==null&&'Esfuerzo percibido: '+pdfNum(cardio.rpe,1)+'/10',
    ].filter(Boolean);
    let y=610;
    for(const item of how)y=pdfText(page,fonts.serif,item,315,y,220,9,12.2,PDF_C.ink,3)-7;
    page.drawText('VALORACIÓN IBERFIT',{x:315,y:440,size:6.1,font:fonts.bold,color:PDF_C.gold});
    page.drawText(pdfAreaRating(ratings.recovery),{x:315,y:409,size:20,font:fonts.serifBold,color:PDF_C.ink});
    page.drawText(pdfClientBasisLabel(ratings.recovery),{x:315,y:392,size:6.1,font:fonts.regular,color:PDF_C.muted});
    page.drawLine({start:{x:PDF_M,y:300},end:{x:535,y:300},thickness:.45,color:PDF_C.ink,opacity:.18});
    page.drawText('DECISIÓN DEL ENTRENADOR',{x:PDF_M,y:275,size:6.1,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,draft?.diagnosis?.trainingImplications||'Usar esta recuperación como referencia individual y repetir el mismo protocolo cuando se quiera comparar evolución.',PDF_M,250,487,10,13.5,PDF_C.ink,7);
  }

  n+=1;
  {
    const page=pdfClientPage(doc,fonts,n,'Decisión','Qué merece atención','Una prioridad clara es más útil que una lista de defectos. El informe distingue qué conviene mejorar de lo que merece preservarse.');
    const diagnosis=draft?.diagnosis||{};
    page.drawText('LECTURA DEL DIAGNÓSTICO',{x:PDF_M,y:600,size:6.1,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,Array.isArray(diagnosis?.priorities)&&diagnosis.priorities.length?diagnosis.priorities[0]:'Prioridad pendiente de revisión',PDF_M,565,430,19,22,PDF_C.ink,5);
    pdfText(page,fonts.serif,diagnosis?.trainingImplications||diagnosis?.coachInterpretation||'Sin estrategia adicional registrada.',PDF_M,455,430,10.5,14,PDF_C.ink2,8);
    page.drawLine({start:{x:PDF_M,y:335},end:{x:310,y:335},thickness:.7,color:PDF_C.gold,opacity:.7});
    page.drawText('FORTALEZA QUE CONVIENE PRESERVAR',{x:PDF_M,y:311,size:6.1,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,Array.isArray(diagnosis?.strengths)&&diagnosis.strengths.length?diagnosis.strengths[0]:'Fortaleza pendiente de revisión',PDF_M,286,310,11.2,14.5,PDF_C.ink,6);
    pdfEditorialPanel(page,fonts,'Qué significa para el siguiente paso',[
      diagnosis?.initialPlan||'Convertir la prioridad principal en trabajo progresivo y medible.',
      iriOnly?'Este IRI documenta el punto de partida; no implica seguimiento contractual activo.':'La planificación debe transformar los hallazgos en decisiones simples, progresivas y revisables.',
    ],PDF_M,180,487);
  }

  n+=1;
  {
    const page=pdfClientPage(doc,fonts,n,'Comparabilidad futura','Qué repetiremos para saber si mejoras','El seguimiento solo tiene valor cuando repetimos pruebas y condiciones suficientemente equivalentes. Este IRI deja documentadas las referencias iniciales.');
    const protocols=pdfClientProtocolRows(Array.isArray(draft?.protocolRecords)?draft.protocolRecords:[]);
    let y=620;
    for(const row of protocols.length?protocols:['Repetir las mismas variantes y configuraciones registradas cuando corresponda.']){
      page.drawLine({start:{x:PDF_M,y:y+10},end:{x:535,y:y+10},thickness:.42,color:PDF_C.ink,opacity:.16});
      y=pdfText(page,fonts.serif,row,PDF_M,y-8,487,9.4,12.8,PDF_C.ink,3)-18;
      if(y<190)break;
    }
    page.drawLine({start:{x:PDF_M,y:155},end:{x:535,y:155},thickness:.55,color:PDF_C.gold,opacity:.6});
    pdfText(page,fonts.regular,'Importante: esta página no puntúa resultados; conserva cómo se hizo la evaluación para que una reevaluación futura pueda compararse de forma válida.',PDF_M,132,487,7.6,10.6,PDF_C.ink2,5);
  }

  n+=1;
  {
    const page=pdfClientPage(doc,fonts,n,'Siguiente paso','Cierre','El valor del IRI no está en acumular datos, sino en dejar un punto de partida comprensible y útil para decidir mejor.');
    page.drawText('QUÉ SABEMOS AHORA',{x:PDF_M,y:610,size:6.1,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,draft?.diagnosis?.coachInterpretation||'Tu punto de partida queda documentado con resultados, contexto y prioridades concretas.',PDF_M,575,430,18,21.5,PDF_C.ink,6);
    page.drawLine({start:{x:PDF_M,y:410},end:{x:420,y:410},thickness:.7,color:PDF_C.gold,opacity:.7});
    page.drawText('SIGUIENTE PASO',{x:PDF_M,y:384,size:6.1,font:fonts.bold,color:PDF_C.gold});
    pdfText(page,fonts.serif,iriOnly?'Conserva este informe como referencia. Si más adelante quieres reevaluar o iniciar un proceso de entrenamiento, las prioridades y pruebas iniciales quedan documentadas para poder comparar.':(draft?.diagnosis?.initialPlan||'Convertir las prioridades identificadas en una planificación progresiva y revisable.'),PDF_M,355,430,11,14.8,PDF_C.ink2,9);
    if(signaturePath){
      page.drawText('FIRMA DEL ENTRENADOR',{x:PDF_M,y:215,size:5.8,font:fonts.bold,color:PDF_C.muted});
      page.drawSvgPath(signaturePath,{x:PDF_M+5,y:118,scale:.23,color:PDF_C.ink,opacity:.92});
      page.drawText(coach,{x:PDF_M,y:91,size:6.5,font:fonts.serifItalic,color:PDF_C.ink});
    }else{
      page.drawText('IBERFIT',{x:PDF_M,y:115,size:9,font:fonts.bold,color:PDF_C.ink});
    }
    page.drawText('Documento emitido desde la evaluación IRI confirmada.',{x:PDF_M,y:66,size:6.1,font:fonts.regular,color:PDF_C.muted});
    if(assessmentMeta?.completedAt)page.drawText('Evaluación confirmada · '+pdfTraceDateTime(assessmentMeta.completedAt),{x:PDF_M,y:52,size:5.9,font:fonts.regular,color:PDF_C.muted});
  }

  return new Uint8Array(await doc.save({useObjectStreams:true,addDefaultPage:false}));
}

async function renderPdf({draft,audience,clientName,coachName,iriOnly,photoReport,annex,appOrigin,assessmentMeta,signatureEligible}:any){
  if(audience==='cliente')return renderClientPdf({draft,clientName,coachName,iriOnly,photoReport,annex,appOrigin,assessmentMeta,signatureEligible});
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
  const ratings=clientIriAreaRatings(draft,scoring);
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
    const watermark=pdfFit(logo,300,300);
    cover.drawImage(logo,{x:PDF_W-watermark.w-12,y:230,width:watermark.w,height:watermark.h,opacity:.034});
    const fit=pdfFit(logo,74,74);
    cover.drawImage(logo,{x:PDF_W-PDF_M-fit.w,y:PDF_H-112,width:fit.w,height:fit.h,opacity:.96});
  }
  cover.drawText('INFORME IRI',{x:48,y:671,size:11,font:fonts.bold,color:PDF_C.gold2});
  cover.drawText(audience==='cliente'?'CLIENTE':'COACH / ADMIN',{x:48,y:651,size:7.2,font:fonts.bold,color:PDF_C.muted});
  cover.drawText(audience==='cliente'?'Diagnóstico inicial':'Dossier técnico del diagnóstico inicial',{x:48,y:618,size:25,font:fonts.serifBold,color:PDF_C.cream});
  cover.drawText(client,{x:48,y:568,size:18,font:fonts.regular,color:PDF_C.cream2});
  cover.drawText(iriOnly?'Evaluación IRI independiente':'Punto de partida para la planificación',{x:48,y:539,size:10,font:fonts.regular,color:PDF_C.gold2});
  cover.drawText(pdfDate(draft?.assessmentDate),{x:48,y:514,size:9.5,font:fonts.regular,color:PDF_C.muted});
  cover.drawLine({start:{x:48,y:142},end:{x:PDF_W-48,y:142},thickness:.8,color:PDF_C.gold,opacity:.65});
  cover.drawText('Entrenamiento personal con criterio:',{x:48,y:115,size:10,font:fonts.bold,color:PDF_C.cream2});
  cover.drawText('diagnóstico, planificación, control y seguimiento.',{x:48,y:96,size:10,font:fonts.regular,color:PDF_C.cream2});
  cover.drawText(coach,{x:48,y:59,size:8.5,font:fonts.serifItalic,color:PDF_C.gold2});

  n+=1;
  {
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),audience==='cliente'?'Tu punto de partida':'Lectura ejecutiva',audience==='cliente'?'Una lectura clara de lo que haces bien y dónde tienes más margen':'Qué encontramos y cómo condiciona la planificación');
    if(audience==='cliente'){
      pdfMetric(page,fonts,'Movimiento',pdfAreaRating(ratings.movement),PDF_M,674,147,'Equilibrio, rango y control');
      pdfMetric(page,fonts,'Fuerza',pdfAreaRating(ratings.strength),PDF_M+160,674,147,'Punto de partida por patrones');
      pdfMetric(page,fonts,'Recuperación',pdfAreaRating(ratings.recovery),PDF_M+320,674,147,'Respuesta tras el esfuerzo');
      pdfText(page,fonts.regular,'Estas valoraciones ayudan a entender tu punto de partida. Cuando existe un baremo compatible se utiliza; en pruebas de campo la nota es orientativa y no pretende compararte con una población que no corresponde.',PDF_M,607,PDF_W-PDF_M*2,8.4,11.3,PDF_C.ink2,4);
      let y=548;
      y=pdfField(page,fonts,'LO MEJOR DE HOY',Array.isArray(draft?.diagnosis?.strengths)&&draft.diagnosis.strengths.length?draft.diagnosis.strengths[0]:'Fortaleza pendiente de revisión',y);
      y=pdfField(page,fonts,'DÓNDE PUEDES GANAR MÁS',Array.isArray(draft?.diagnosis?.priorities)&&draft.diagnosis.priorities.length?draft.diagnosis.priorities[0]:'Prioridad pendiente de revisión',y);
      y=pdfField(page,fonts,'LECTURA DEL ENTRENADOR',draft?.diagnosis?.coachInterpretation||'Sin interpretación adicional registrada.',y);
      pdfEditorialPanel(page,fonts,'Cómo leer el informe',[
        'No buscamos una postura perfecta ni una nota global artificial.',
        'Los resultados se interpretan junto con la variante realizada, el movimiento y el contexto real.',
        'Este IRI es tu referencia inicial; la evolución se medirá después con pruebas comparables.',
      ],PDF_M,Math.min(y-4,300),PDF_W-PDF_M*2);
    }else{
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
    y=pdfField(page,fonts,'CONSIDERACIONES DECLARADAS',interview?.restrictions||'Sin restricciones declaradas',y);
    pdfEditorialPanel(page,fonts,'Criterio de planificación',[
      'El plan se ajusta a la disponibilidad, modalidad y material realmente registrados.',
      'Las preferencias sirven para reducir fricción y mejorar adherencia sin sustituir los criterios de seguridad y progresión.',
      interview?.restrictions
        ?'Las consideraciones declaradas se revisan antes de progresar y vuelven a comprobarse si cambia el contexto.'
        :'No se declararon restricciones en esta evaluación; cualquier cambio posterior debe quedar registrado.',
    ],PDF_M,Math.min(y-4,330),PDF_W-PDF_M*2);
    pdfText(page,fonts.regular,'El Diagnóstico IRI describe el punto de partida para decidir mejor. El seguimiento y la evolución se registran después, de forma separada.',PDF_M,82,PDF_W-PDF_M*2,8.5,11.5,PDF_C.ink2,4);
  }

  n+=1;
  {
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),audience==='cliente'?'Composición y movimiento':'Composición y movilidad',audience==='cliente'?'Tu referencia inicial, leída con contexto':'Referencia inicial; no sustituye valoración clínica');
    const body=draft?.bodyComposition||{};
    const mobility=draft?.mobility||{};
    pdfMetric(page,fonts,'Peso',body?.skipped?'No evaluado':pdfNum(body.weightKg,1)+' kg',PDF_M,674);
    pdfMetric(page,fonts,'Grasa corporal',body?.skipped?'No evaluado':pdfNum(body.bodyFatPercent,1)+' %',PDF_M+160,674);
    pdfMetric(page,fonts,'Masa magra',body?.skipped?'No evaluado':pdfNum(body.leanMassKg,1)+' kg',PDF_M+320,674);
    pdfMetric(page,fonts,'Cintura',body?.skipped?'No evaluado':pdfNum(body.waistCm,1)+' cm',PDF_M,605);
    pdfMetric(page,fonts,'Agua corporal',body?.skipped?'No evaluado':pdfNum(body.bodyWaterPercent,1)+' %',PDF_M+160,605);
    pdfMetric(page,fonts,'Grasa visceral',body?.skipped?'No evaluado':pdfNum(body.visceralFatLevel),PDF_M+320,605);
    if(audience==='cliente')pdfMetric(page,fonts,'Valoración movimiento',pdfAreaRating(ratings.movement),PDF_M,540,147,'Orientativa · no clínica');
    let y=audience==='cliente'?462:515;
    y=pdfField(page,fonts,'TOBILLO · RODILLA A PARED',mobility?.ankle?.skipped?'No evaluado':'Izq. '+pdfNum(mobility?.ankle?.leftBest,1)+' cm · Der. '+pdfNum(mobility?.ankle?.rightBest,1)+' cm · asimetría '+pdfNum(mobility?.ankle?.asymmetryCm,1)+' cm',y);
    y=pdfField(page,fonts,'CADENA POSTERIOR',mobility?.posteriorChain?.skipped?'No evaluado':'Izq. '+pdfNum(mobility?.posteriorChain?.leftBest,1)+' cm · Der. '+pdfNum(mobility?.posteriorChain?.rightBest,1)+' cm · asimetría '+pdfNum(mobility?.posteriorChain?.asymmetryCm,1)+' cm',y);
    y=pdfField(page,fonts,'ROTACIÓN DE CADERA',mobility?.hipRotation?.skipped?'No evaluado':mobility?.hipRotation?.result,y);
    y=pdfField(page,fonts,'SENTADILLA ASISTIDA',mobility?.assistedSquat?.skipped?'No evaluado':[mobility?.assistedSquat?.depth,mobility?.assistedSquat?.heels,mobility?.assistedSquat?.knees,mobility?.assistedSquat?.trunk].filter(Boolean).join(' · ')||'Sin detalle',y);
    y=pdfField(page,fonts,'MÉTODO DE COMPOSICIÓN',body?.skipped?body?.skipReason:(body?.method||body?.device||'Sin método registrado'),y);
    y=pdfField(page,fonts,'CONDICIONES DE MEDICIÓN',body?.measurementConditions||'Sin observaciones adicionales',y);
    pdfEditorialPanel(page,fonts,'Cómo leer esta página',[
      'La composición corporal se conserva como referencia longitudinal y no modifica por sí sola la puntuación funcional.',
      'Las asimetrías de movilidad se interpretan junto con dolor, control, calidad del movimiento y repetibilidad.',
      'En la reevaluación conviene repetir método y condiciones de medición para que el cambio observado sea comparable.',
    ],PDF_M,Math.min(y-4,290),PDF_W-PDF_M*2);
  }

  n+=1;
  {
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),audience==='cliente'?'Fuerza y recuperación':'Fuerza y capacidad funcional',audience==='cliente'?'Tu base de fuerza y cómo recuperaste tras el esfuerzo':'Comparar siempre con la misma variante y configuración');
    const strength=draft?.strengthAssessment||draft?.strength||{};
    const cardio=draft?.cardio||{};
    pdfMetric(page,fonts,'Silla 30 s',strength?.lowerBody?.skipped?'No evaluado':pdfNum(strength?.chairStand?.repetitions)+' rep',PDF_M,674);
    pdfMetric(page,fonts,'Empuje',strength?.push?.skipped?'No evaluado':pdfNum(strength?.push?.repetitions)+' rep',PDF_M+160,674,147,pdfStrengthVariant(strength?.push?.variant));
    pdfMetric(page,fonts,'Remo TRX',strength?.trxRow?.skipped?'No evaluado':pdfNum(strength?.trxRow?.repetitions)+' rep',PDF_M+320,674);
    pdfMetric(page,fonts,'Plancha frontal',strength?.core?.skipped?'No evaluado':pdfNum(strength?.core?.frontPlankSeconds)+' s',PDF_M,605);
    pdfMetric(page,fonts,'Lateral izq.',strength?.core?.skipped?'No evaluado':pdfNum(strength?.core?.sidePlankLeftSeconds)+' s',PDF_M+160,605);
    pdfMetric(page,fonts,'Lateral der.',strength?.core?.skipped?'No evaluado':pdfNum(strength?.core?.sidePlankRightSeconds)+' s',PDF_M+320,605);
    if(audience==='cliente'){
      pdfMetric(page,fonts,'Valoración fuerza',pdfAreaRating(ratings.strength),PDF_M,540,147,'Orientativa según variantes');
      pdfMetric(page,fonts,'Valoración recuperación',pdfAreaRating(ratings.recovery),PDF_M+160,540,147,'Respuesta observada');
    }
    const protocol=String(cardio?.protocol||'');
    const protocolLabel=pdfProtocolName(cardio);
    let y=audience==='cliente'?462:515;
    y=pdfField(page,fonts,'PROTOCOLO DE ESFUERZO',cardio?.skipped?'No evaluado':protocolLabel,y);
    y=pdfField(page,fonts,'RESULTADO',cardio?.skipped?cardio?.skipReason:[
      Number.isFinite(Number(cardio?.speedKmh))&&pdfNum(cardio.speedKmh,1)+' km/h',
      Number.isFinite(Number(cardio?.inclinePercent))&&pdfNum(cardio.inclinePercent,1)+'% inclinación',
      Number.isFinite(Number(cardio?.repetitions))&&pdfNum(cardio.repetitions)+' rep',
      Number.isFinite(Number(cardio?.finalHr))&&'FC final '+pdfNum(cardio.finalHr)+' lpm',
      Number.isFinite(Number(cardio?.oneMinuteHr))&&'FC 1 min '+pdfNum(cardio.oneMinuteHr)+' lpm',
      Number.isFinite(Number(cardio?.deltaOneMinute))&&'recuperación 1 min '+pdfNum(cardio.deltaOneMinute)+' lpm',
    ].filter(Boolean).join(' · ')||'Sin resultado interpretable',y);
    y=pdfField(page,fonts,'CONFIGURACIÓN TRX',strength?.trxRow?.skipped?'No evaluado':[
      Number.isFinite(Number(strength?.trxRow?.handleHeightCm))&&'asas '+pdfNum(strength.trxRow.handleHeightCm)+' cm',
      Number.isFinite(Number(strength?.trxRow?.heelDistanceCm))&&'talones '+pdfNum(strength.trxRow.heelDistanceCm)+' cm',
      Number.isFinite(Number(strength?.trxRow?.bodyAngleDeg))&&'ángulo '+pdfNum(strength.trxRow.bodyAngleDeg)+'°',
    ].filter(Boolean).join(' · ')||strength?.trxRow?.position||'Sin detalle',y);
    y=pdfField(page,fonts,'OBSERVACIONES DE FUERZA',strength?.notes||'Sin observaciones adicionales',y);
    y=pdfField(page,fonts,'OBSERVACIONES DE ESFUERZO',cardio?.notes||'Sin observaciones adicionales',y);
    pdfEditorialPanel(page,fonts,'Regla de comparabilidad',[
      'Las repeticiones solo son comparables si se conserva la misma variante y una configuración equivalente.',
      'En TRX deben mantenerse las referencias de altura, distancia o ángulo que definieron la prueba inicial.',
      'La recuperación de frecuencia cardiaca se utiliza como referencia individual y se interpreta junto con el protocolo y el esfuerzo realizado.',
    ],PDF_M,Math.min(y-4,295),PDF_W-PDF_M*2);
  }

  n+=1;
  {
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),audience==='cliente'?'Qué merece atención':'Decisión y planificación',audience==='cliente'?'Una prioridad clara, sin convertir todo en un problema':'Cómo se traduce la evaluación en acciones concretas');
    const diagnosis=draft?.diagnosis||{};
    const records=Array.isArray(diagnosis?.priorityRecords)?diagnosis.priorityRecords.slice(0,3):[];
    page.drawText(audience==='cliente'?'Tu prioridad principal':'Prioridades',{x:PDF_M,y:674,size:11,font:fonts.serifBold,color:PDF_C.ink});
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
    const protocols=pdfClientProtocolRows(Array.isArray(draft?.protocolRecords)?draft.protocolRecords:[]);
    pdfBullets(
      page,fonts,'Para comparar bien en la reevaluación',
      protocols.length?protocols:['Repetir las mismas variantes y configuraciones registradas cuando corresponda.'],
      PDF_M,y-2,PDF_W-PDF_M*2,
    );
    if(signaturePath){
      page.drawSvgPath(signaturePath,{x:PDF_W-PDF_M-150,y:190,scale:.23,color:PDF_C.ink,opacity:.92});
      page.drawText('Carlos · IBERFIT',{x:PDF_W-PDF_M-142,y:116,size:7.2,font:fonts.serifItalic,color:PDF_C.muted});
    }
    pdfText(page,fonts.regular,audience==='cliente'?'Este informe es una referencia inicial. Las notas por áreas ayudan a entender el punto de partida y no convierten una diferencia aislada en un diagnóstico.':'La puntuación funcional no incorpora composición corporal ni fotogrametría. Las decisiones se apoyan en resultados, contexto, calidad de dato y criterio profesional.',PDF_M,78,PDF_W-PDF_M*2,8.4,11.5,PDF_C.ink2,5);
  }

  if(photoReport?.available){
    n+=1;
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),audience==='cliente'?'Análisis fotogramétrico':'Fotogrametría',audience==='cliente'?'Una referencia visual para comparar en el futuro':'Mediciones posturales con trazabilidad y calidad de dato');
    page.drawText('Estado: '+photoQuality(photoReport)+' · revisión '+String(Number(photoReport.analysisRevision||0)),{x:PDF_M,y:674,size:9.5,font:fonts.bold,color:PDF_C.gold});
    const lines=pdfPhotoMeasurementRows(photoReport?.measurements||{});
    let y=650;
    for(const line of lines)y=pdfText(page,fonts.regular,line,PDF_M,y,225,8.4,11,PDF_C.ink2,2)-3;
    const decisions=pdfPhotoDecisionRows(photoReport);
    const photos=Array.isArray(photoReport?.photos)?photoReport.photos.slice(0,4):[];
    const hasPhotos=photos.length>0;
    if(decisions.length&&(hasPhotos||audience!=='cliente')){
      y=Math.min(y-6,455);
      page.drawText('Lectura para entrenamiento',{x:PDF_M,y,size:9.5,font:fonts.bold,color:PDF_C.ink});
      y-=17;
      for(const item of decisions){
        page.drawCircle({x:PDF_M+3,y:y+3,size:1.6,color:PDF_C.gold});
        y=pdfText(page,fonts.regular,item,PDF_M+12,y,213,8.1,10.8,PDF_C.ink2,5)-5;
      }
    }
    if(!hasPhotos&&audience==='cliente'){
      page.drawText('Privacidad de las imágenes',{x:315,y:650,size:9.5,font:fonts.bold,color:PDF_C.ink});
      let rightY=pdfText(page,fonts.regular,'Las mediciones pueden formar parte del informe, pero las fotografías permanecen privadas mientras no exista un permiso específico para publicarlas en el documento Cliente.',315,630,225,8.5,11.4,PDF_C.ink2,7)-10;
      if(decisions.length){
        page.drawText('Lectura para entrenamiento',{x:315,y:rightY,size:9.5,font:fonts.bold,color:PDF_C.ink});
        rightY-=17;
        for(const item of decisions){
          page.drawCircle({x:318,y:rightY+3,size:1.6,color:PDF_C.gold});
          rightY=pdfText(page,fonts.regular,item,327,rightY,213,8.1,10.8,PDF_C.ink2,5)-5;
        }
      }
    }
    if(hasPhotos)page.drawText('Lámina fotogramétrica',{x:315,y:674,size:9.5,font:fonts.bold,color:PDF_C.ink});
    const slots=[{x:315,y:510},{x:425,y:510},{x:315,y:340},{x:425,y:340}];
    for(let i=0;i<photos.length;i+=1){
      const image=await pdfImage(doc,String(photos[i]?.url||''));
      if(!image)continue;
      const slot=slots[i],fit=pdfFit(image,100,145);
      page.drawRectangle({x:slot.x-3,y:slot.y-3,width:106,height:151,borderColor:PDF_C.gold,borderWidth:.5,borderOpacity:.35});
      page.drawImage(image,{x:slot.x+(100-fit.w)/2,y:slot.y+(145-fit.h)/2,width:fit.w,height:fit.h});
      page.drawText(pdfPhotoView(photos[i]?.view||'Vista '+String(i+1)),{x:slot.x,y:slot.y-14,size:6.7,font:fonts.bold,color:PDF_C.muted});
    }
    pdfText(page,fonts.regular,audience==='cliente'?'Las fotos describen cómo estabas colocada en ese momento. Nos sirven como referencia inicial y ganan valor cuando se relacionan con movimiento, fuerza y futuras evaluaciones.':'La fotogrametría describe alineación y asimetrías visibles bajo las condiciones de captura. No constituye por sí sola un diagnóstico médico.',PDF_M,165,PDF_W-PDF_M*2,8.8,12,PDF_C.ink2,5);
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
      y=pdfField(page,fonts,'PRUEBAS OMITIDAS',pdfJoin([
        body?.skipped&&('Composición: '+pdfSafe(body?.skipReason,120)),
        mobility?.skipped&&('Movilidad: '+pdfSafe(mobility?.skipReason,120)),
        strength?.skipped&&('Fuerza: '+pdfSafe(strength?.skipReason,120)),
        cardio?.skipped&&('Cardio: '+pdfSafe(cardio?.skipReason,120)),
      ],'Ninguna omisión global registrada'),y);
      pdfEditorialPanel(page,fonts,'Uso técnico',[
        'El cribado contextualiza la sesión y sus límites; no convierte el IRI en una evaluación clínica.',
        'Un síntoma, restricción o cambio relevante posterior debe registrarse antes de decidir una progresión.',
        'Las pruebas omitidas permanecen visibles para evitar que la ausencia de dato se interprete como normalidad.',
      ],PDF_M,Math.min(y-4,300),PDF_W-PDF_M*2);
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
      y=pdfField(page,fonts,'OBSERVACIONES',mobility?.notes||'Sin observaciones adicionales',y);
      pdfEditorialPanel(page,fonts,'Comparabilidad técnica',[
        'Conservar lado, número de intentos y mejor resultado permite distinguir cambio real de variación de la medición.',
        'Dolor, compensaciones y respuesta a la asistencia deben revisarse junto con los centímetros o la descripción del movimiento.',
        'La reevaluación debe reproducir la misma prueba antes de atribuir una diferencia a progreso o regresión.',
      ],PDF_M,Math.min(y-4,300),PDF_W-PDF_M*2);
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
      y=pdfField(page,fonts,'OBSERVACIONES GENERALES',strength?.notes||'Sin observaciones adicionales',y);
      pdfEditorialPanel(page,fonts,'Comparabilidad técnica',[
        'Variante, apoyo, altura, distancia y ángulo forman parte del resultado cuando modifican la dificultad de la prueba.',
        'Una repetición válida debe conservar el mismo criterio de ejecución para que el cambio sea interpretable.',
        'El dossier mantiene estas referencias para que la progresión no dependa de memoria ni de descripciones informales.',
      ],PDF_M,Math.min(y-4,300),PDF_W-PDF_M*2);
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
      y=pdfField(page,fonts,'NOTAS',cardio?.notes||'Sin observaciones adicionales',y);
      pdfEditorialPanel(page,fonts,'Criterio de interpretación',[
        'La recuperación de frecuencia cardiaca solo se compara dentro de protocolos y condiciones suficientemente equivalentes.',
        'RPE, síntomas y motivo de detención aportan contexto al dato de frecuencia cardiaca y evitan interpretaciones aisladas.',
        'Si cambia el protocolo, la configuración o el método de medición, el resultado debe tratarse como una referencia distinta.',
      ],PDF_M,Math.min(y-4,290),PDF_W-PDF_M*2);
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
      y=pdfField(page,fonts,'LÍMITE','Evaluación de rendimiento y entrenamiento; no sustituye una evaluación clínica ni convierte una ausencia de dato en normalidad.',y);
      pdfEditorialPanel(page,fonts,'Reglas de lectura',[
        'La puntuación resume dominios con cobertura suficiente; no reemplaza la lectura de cada prueba ni de su validez.',
        'Composición corporal y fotogrametría añaden contexto, pero permanecen separadas de la nota funcional.',
        'Una omisión o una medición no comparable reduce la fuerza de la conclusión y debe conservarse explícitamente.',
      ],PDF_M,Math.min(y-4,290),PDF_W-PDF_M*2);
    }

    n+=1;
    {
      const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Trazabilidad técnica','Versiones, comparabilidad y evidencia del documento emitido');
      let y=674;
      y=pdfField(page,fonts,'VERSIÓN DE PROTOCOLO',assessmentMeta?.protocolVersion||'Sin versión registrada',y);
      y=pdfField(page,fonts,'CIERRE DE LA SESIÓN',pdfTraceDateTime(assessmentMeta?.completedAt||draft?.updatedAt),y);
      y=pdfField(page,fonts,'MOTOR DE BAREMOS',pdfTraceVersion(scoring?.engineVersion)||'Sin versión registrada',y);
      y=pdfField(page,fonts,'EXPEDIENTE',profile?.email?pdfJoin([profile?.email,profile?.phone]):'Identidad vinculada al cliente del expediente',y);
      page.drawText('Protocolos registrados',{x:PDF_M,y,size:10.5,font:fonts.bold,color:PDF_C.ink});
      y-=19;
      const records=Array.isArray(draft?.protocolRecords)?draft.protocolRecords.slice(0,12):[];
      if(!records.length)page.drawText('Sin registros adicionales.',{x:PDF_M,y,size:9,font:fonts.regular,color:PDF_C.muted});
      for(const record of records){
        const sideLabel=pdfProtocolSide(record?.side);
        const variantLabel=pdfProtocolVariant(record);
        const versionLabel=pdfProtocolVersion(record?.protocolVersion);
        const row=[record?.testName||'Prueba',sideLabel,variantLabel&&'variante '+variantLabel,record?.configuration&&'config. '+record.configuration,versionLabel&&'versión '+versionLabel,record?.valid===true?'válida':record?.valid===false?'no válida':'sin confirmar'].filter(Boolean).join(' · ');
        y=pdfText(page,fonts.regular,row,PDF_M,y,PDF_W-PDF_M*2,8.2,10.8,PDF_C.ink2,2)-4;
        if(y<120)break;
      }
      pdfText(page,fonts.regular,'El Diagnóstico IRI conserva el punto de partida. El seguimiento y la evolución permanecen separados para no mezclar la evaluación inicial con el progreso posterior.',PDF_M,82,PDF_W-PDF_M*2,8.8,12,PDF_C.ink2,5);
    }
  }

  if(annex){
    n+=1;
    const page=pdfPage(doc,fonts,n,audience,sectionIndex(),'Bioimpedancia original','Anexo incorporado al documento emitido');
    page.drawText('Documento original incorporado',{x:PDF_M,y:640,size:15,font:fonts.serifBold,color:PDF_C.ink});
    pdfText(page,fonts.regular,annex.kind==='pdf'?'Se adjuntan '+String(annex.displayPages)+' de '+String(annex.totalPages)+' página(s) del documento original de bioimpedancia a continuación.':'La imagen original de bioimpedancia se incorpora como la siguiente página del informe.',PDF_M,610,PDF_W-PDF_M*2,10,15,PDF_C.ink2,5);
    let annexY=535;
    annexY=pdfField(page,fonts,'FORMATO ORIGINAL',annex.kind==='pdf'?'PDF · '+String(annex.totalPages)+' página(s)':'Imagen original',annexY);
    annexY=pdfField(page,fonts,'TRATAMIENTO DOCUMENTAL','Se incorpora el archivo original sin reinterpretar ni reconstruir sus valores.',annexY);
    page.drawText('Evidencia complementaria',{x:PDF_M,y:annexY-4,size:10.5,font:fonts.bold,color:PDF_C.ink});
    pdfText(page,fonts.regular,'La bioimpedancia complementa el punto de partida. El IRI no inventa métricas a partir de esta hoja y mantiene separado el dato original de la interpretación del entrenamiento.',PDF_M,annexY-24,PDF_W-PDF_M*2,9,12.5,PDF_C.ink2,6);
    if(annex.truncated)pdfText(page,fonts.bold,'Por seguridad de tamaño, el anexo visible se limita a '+String(annex.displayPages)+' páginas. El original se conserva vinculado al IRI.',PDF_M,205,PDF_W-PDF_M*2,9.2,13,PDF_C.gold,4);
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
async function issueReport({userClient,service,actorUserId,actorEmail,assessmentId,audience,issueRequestId,appOrigin}:any){
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
  let photoReport=photoState.report;
  if(photoReport&&!photoReport.decisionSupport){
    photoReport={
      ...photoReport,
      decisionSupport:buildIriPhotogrammetryDecisionSupport({
        measurements:photoReport.measurements||{},
        quality:photoReport.quality||{},
        draft,
      }),
    };
  }

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

  let pdf=await renderPdf({draft,audience,clientName:clientResult.data.name||'Cliente IBERFIT',coachName,iriOnly:authz.data?.iriOnly===true,photoReport,annex,appOrigin,assessmentMeta:{protocolVersion:assessment.protocol_version,completedAt:assessment.completed_at},signatureEligible:/carlos/iu.test(coachName)||String(actorEmail||'').toLowerCase()==='iberfit.cl@gmail.com'});
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
      included:Boolean(photoReport),photosPublished:Boolean(photoReport?.photos?.length),
      analysisRevision:Number(photoReport?.analysisRevision||0),
      protocolVersion:photoReport?.protocolVersion||null,
      decisionSupportAvailable:photoReport?.decisionSupport?.available===true,
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
    const final=await service.rpc('iberfit_finalize_iri_report_issue_v2',{
      p_issue_request_id:issueRequestId,
      p_issuance_id:issuanceId,p_client_id:assessment.client_id,p_assessment_id:assessment.id,p_audience:audience,
      p_template_version:TEMPLATE_VERSION,p_engine_version:ENGINE_VERSION,p_source_revision:Number(assessment.revision||0),
      p_source_snapshot:sourceSnapshot,p_source_sha256:sourceHash,p_evidence_manifest:evidenceManifest,
      p_render_manifest:renderManifest,p_artifact_path:artifactPath,p_artifact_sha256:artifactHash,
      p_artifact_size_bytes:pdf.byteLength,p_actor_user_id:actorUserId,
    });
    if(final.error)throw final.error;
    if(!final.data?.ok)throw new Error('IRI_REPORT_FINALIZE_INVALID_RESPONSE');
    const canonicalArtifactPath=text(final.data?.artifactPath,600);
    if(!canonicalArtifactPath)throw new Error('IRI_REPORT_FINALIZE_ARTIFACT_PATH_INVALID');
    if(final.data?.reused===true&&canonicalArtifactPath!==artifactPath){
      const cleanup=await service.storage.from(ISSUED_BUCKET).remove([artifactPath]);
      if(cleanup.error)throw cleanup.error;
    }
    const signed=await service.storage.from(ISSUED_BUCKET).createSignedUrl(canonicalArtifactPath,120);
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
      const issueRequestId=body?.issueRequestId?assertUuid(body.issueRequestId,'IRI_REPORT_ISSUE_REQUEST_INVALID'):crypto.randomUUID();
      const result=await issueReport({
        userClient,service,actorUserId,actorEmail,assessmentId,audience,issueRequestId,appOrigin,
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
