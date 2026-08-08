import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  IRI_EXTERNAL_REPORT_BUCKET,
  IRI_EXTERNAL_REPORT_MAX_BYTES,
  IRI_EXTERNAL_REPORT_REQUEST_TIMEOUT_MS,
  IRI_EXTERNAL_REPORT_UPLOAD_TIMEOUT_MS,
  __iriExternalReportInternals,
  createIriExternalReportService,
  iriExternalReportAppUrl,
  parseIriExternalReportIntent,
  resolveIriExternalReportIntent,
  validateIriExternalReportFile,
} from '../src/m26/workflows/iri-external-report-controller.js';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';
import {normalizeFirstSessionDraft} from '../src/m26/workflows/iri-first-session.js';
import {renderReportsRoute} from '../src/m26/modules/route-render.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';

const CLIENT_ID='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const ASSESSMENT_ID='a82e5560-2f67-4de9-bf5b-ad3bfb289d96';
const FOREIGN_ID='019d55c4-6fbf-4a25-aa91-dfc16e656828';
const OBJECT_PATH=`${CLIENT_ID}/${ASSESSMENT_ID}/bioimpedancia`;
const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const report=Object.freeze({
  id:'b3965964-fcda-42d7-be3f-e0a9c88b3950',
  clientId:CLIENT_ID,
  assessmentId:ASSESSMENT_ID,
  bucketId:IRI_EXTERNAL_REPORT_BUCKET,
  objectPath:OBJECT_PATH,
  fileName:'bioimpedancia-cliente.pdf',
  mimeType:'application/pdf',
  sizeBytes:194_916,
  visibleToClient:true,
  version:2,
  uploadedAt:'2026-08-01T02:40:40.367Z',
  updatedAt:'2026-08-01T02:40:40.367Z',
});

function confirmedState(role='client'){
  return {
    identity:{role,clientId:role==='client'?CLIENT_ID:null},
    selectedClientId:role==='client'?null:CLIENT_ID,
    collections:{
      clients:[{id:CLIENT_ID}],
      iriAssessments:[{id:ASSESSMENT_ID,clientId:CLIENT_ID,body:{firstSessionCompletedAt:'2026-07-30T20:00:00Z'}}],
    },
  };
}

function reportDraft(){
  return normalizeFirstSessionDraft({
    assessmentDate:'2026-07-30',birthDate:'1990-06-12',sexForNorms:'female',email:'qa@example.com',phone:'+56 9 1111 2222',modality:'hibrido',trainingAddress:'Dirección QA',primaryObjective:'Mejorar fuerza y salud general',trainingExperience:'Intermedia',availability:'Dos tardes',screeningAccepted:'on',
    weightKg:'64',heightCm:'165',waistCm:'74',ankleLeft1:'8',ankleRight1:'7.5',posteriorLeft1:'24',posteriorRight1:'23',hipRotationResult:'Simétrica',squatDepth:'Paralela',chairStand30s:'18',chairStandValid:'on',pushVariant:'standard',pushUps:'10',pushValid:'on',trxRowRepetitions:'14',trxValid:'on',frontPlankSeconds:'45',cardioSkipped:'on',cardioSkipReason:'No realizada en esta sesión.',diagnosisStrengths:'Buena fuerza funcional',diagnosisPriorities:'Completar área cardiorrespiratoria',coachInterpretation:'Perfil suficiente para iniciar.',trainingImplications:'Progresión conservadora.',initialPlan:'Plan inicial de cuatro semanas.',recommendedFrequency:'2 sesiones por semana',reviewAccepted:'on',
  },{id:ASSESSMENT_ID},CLIENT_ID);
}

test('evaluación QA histórica con estado confirmado habilita el Diagnóstico IRI',()=>{
  const state=confirmedState();
  state.collections.iriAssessments=[{
    id:ASSESSMENT_ID,
    clientId:CLIENT_ID,
    status:'confirmed',
    revision:2,
    body:{assessmentDate:'2026-07-17'},
  }];
  const vm=createRouteViewModel({activeArea:'informes',identity:state.identity},state,new Date('2026-08-01T12:00:00Z'));
  assert.equal(vm.latestIri.id,ASSESSMENT_ID);
  assert.equal(vm.iriDiagnosis.assessmentId,ASSESSMENT_ID);
  assert.equal(vm.iriDiagnosis.processLabel,'7 de 7 etapas completadas');
  assert.match(renderReportsRoute(vm),/data-iri-diagnosis/);
});

test('App Cliente presenta Diagnóstico IRI como unidad documental con PDF y bioimpedancia integrados',()=>{
  const html=renderReportsRoute({role:'client',reports:[],latestIri:{id:ASSESSMENT_ID},iriDiagnosis:{assessmentId:ASSESSMENT_ID,dateLabel:'30 de julio de 2026',classification:'Perfil IRI por dominios',processLabel:'7 de 7 etapas completadas',revision:2}});
  assert.match(html,/data-iri-diagnosis/);
  assert.match(html,/>Diagnóstico IRI</);
  assert.match(html,/Fecha de evaluación/);
  assert.match(html,/Perfil IRI por dominios/);
  assert.match(html,/Revisión 2/);
  assert.match(html,/data-m26-area="iri"/);
  assert.match(html,/generate-client-iri-report/);
  assert.match(html,/data-iri-external-report-host/);
  assert.doesNotMatch(html,/bodyCompositionAttachment|Subir informe|Reemplazar informe|objectPath/);
});

test('estado vacío Cliente usa el texto editorial exacto y no expone controles de gestión',()=>{
  const html=__iriExternalReportInternals.cardMarkup({role:'client',clientId:CLIENT_ID,assessmentId:ASSESSMENT_ID,canManage:false},{report:null,loading:false,busy:false,pending:null,message:'',tone:'info'});
  assert.match(html,/Aún no hay un informe de bioimpedancia adjunto a este diagnóstico\./);
  assert.doesNotMatch(html,/selector|Subir informe|Reemplazar informe|Reintentar registro|objectPath|Storage|UUID/i);
});

test('informe visible muestra solo metadatos permitidos y conserva versión 2',()=>{
  const html=__iriExternalReportInternals.cardMarkup({role:'client',clientId:CLIENT_ID,assessmentId:ASSESSMENT_ID,canManage:false},{report,loading:false,busy:false,pending:null,message:'',tone:'info'});
  assert.match(html,/bioimpedancia-cliente\.pdf/);
  assert.match(html,/PDF/);
  assert.match(html,/versión 2/);
  assert.match(html,/Ver informe de bioimpedancia/);
  assert.doesNotMatch(html,new RegExp(OBJECT_PATH.replaceAll('/','\\/')));
  assert.doesNotMatch(html,/bucket|objectPath|visibleToClient|194916/i);
});

test('informe no visible se oculta por completo al Cliente',()=>{
  const html=__iriExternalReportInternals.cardMarkup({role:'client',clientId:CLIENT_ID,assessmentId:ASSESSMENT_ID,canManage:false},{report:{...report,visibleToClient:false,fileName:'nombre-secreto.pdf'},loading:false,busy:false,pending:null,message:'',tone:'info'});
  assert.doesNotMatch(html,/nombre-secreto|versión 2|PDF/);
  assert.match(html,/Aún no hay un informe/);
});

test('Coach y Admin conservan subida, reemplazo, reintento y visibilidad RC37',()=>{
  for(const role of ['coach','admin']){
    const html=__iriExternalReportInternals.cardMarkup({role,clientId:CLIENT_ID,assessmentId:ASSESSMENT_ID,canManage:true},{report,pending:{},loading:false,busy:false,message:'',tone:'info'});
    assert.match(html,/Reemplazar informe/);
    assert.match(html,/Reintentar registro/);
    assert.match(html,/Visible para cliente/);
  }
});

test('PDF Cliente contiene hipervínculo estable solo para informe visible de la misma evaluación',()=>{
  const draft=reportDraft();
  const html=buildIriReportHtml({draft,variant:'client',clientName:'Cliente QA',coachName:'Coach QA',externalReport:report});
  assert.match(html,/Documento complementario/);
  assert.match(html,/Informe de bioimpedancia/);
  assert.match(html,/Abrir informe de bioimpedancia/);
  assert.match(html,/href="https:\/\/m26-canary\.iberfit\.cl\/\?area=informes&amp;assessmentId=a82e5560-2f67-4de9-bf5b-ad3bfb289d96&amp;open=bioimpedancia"/);
  assert.doesNotMatch(html,/supabase\.co|\/storage\/v1\/object\/sign|[?&]token=/i);
  for(const externalReport of [null,{...report,visibleToClient:false},{...report,assessmentId:FOREIGN_ID}]){
    const without=buildIriReportHtml({draft,variant:'client',externalReport});
    assert.doesNotMatch(without,/Abrir informe de bioimpedancia/);
  }
});

test('ruta PDF no acepta origen externo, clientId, objectPath, bucket, token ni datos personales',()=>{
  const url=iriExternalReportAppUrl(ASSESSMENT_ID);
  assert.equal(url,`https://m26-canary.iberfit.cl/?area=informes&assessmentId=${ASSESSMENT_ID}&open=bioimpedancia`);
  assert.equal(iriExternalReportAppUrl(ASSESSMENT_ID,{origin:'https://app.iberfit.cl'}),`https://app.iberfit.cl/?area=informes&assessmentId=${ASSESSMENT_ID}&open=bioimpedancia`);
  assert.equal(iriExternalReportAppUrl(ASSESSMENT_ID,{origin:'https://coach.iberfit.cl'}),`https://app.iberfit.cl/?area=informes&assessmentId=${ASSESSMENT_ID}&open=bioimpedancia`);
  assert.doesNotMatch(url,/clientId|objectPath|bucket|token|email|supabase/i);
  assert.throws(()=>iriExternalReportAppUrl(ASSESSMENT_ID,{origin:'https://evil.example'}),/ORIGIN_INVALID/);
});

test('assessmentId inválido, ajeno y destino externo se rechazan sin revelar metadatos',()=>{
  assert.deepEqual(parseIriExternalReportIntent({search:'?area=informes&assessmentId=no-es-uuid&open=bioimpedancia'}),{status:'invalid'});
  assert.deepEqual(parseIriExternalReportIntent({search:`?area=informes&assessmentId=${ASSESSMENT_ID}&open=bioimpedancia&redirect=https://evil.example`}),{status:'invalid'});
  assert.throws(()=>resolveIriExternalReportIntent(confirmedState(),{status:'valid',area:'informes',assessmentId:FOREIGN_ID,open:'bioimpedancia'}),/NOT_FOUND/);
  const valid=parseIriExternalReportIntent({search:`?area=informes&assessmentId=${ASSESSMENT_ID}&open=bioimpedancia`});
  assert.equal(resolveIriExternalReportIntent(confirmedState(),valid).clientId,CLIENT_ID);
});

test('continuación post-login conserva solo intención segura en memoria y la limpia al consumirla',()=>{
  const source=read('src/m26/app/application.js');
  assert.match(source,/pendingIriExternalReportIntent=parseIriExternalReportIntent/);
  assert.match(source,/resolveIriExternalReportIntent\(store\.getState\(\),intent\)/);
  assert.match(source,/store\.selectIriAssessment/);
  assert.match(source,/store\.navigate\('informes'\)/);
  assert.match(source,/pendingIriExternalReportIntent=null/);
  assert.doesNotMatch(source,/localStorage[^\n]*pendingIri|sessionStorage[^\n]*pendingIri/i);
});

test('cada apertura genera una URL firmada nueva bajo el origen Supabase canónico y sin caché',async()=>{
  let sequence=0;
  const service=createIriExternalReportService({runtime:{enabled:true,projectRef:'pjhmrhejsoofmouedavw',url:'https://pjhmrhejsoofmouedavw.supabase.co',publishableKey:'sb_publishable_rc38_test',timeoutMs:5_000,version:'26.0.0-canary.38-iri-diagnosis-bioimpedance'},fetchImpl:async(_url,options)=>{
    assert.equal(options.cache,'no-store');
    sequence+=1;
    return Response.json({signedURL:`/storage/v1/object/sign/${IRI_EXTERNAL_REPORT_BUCKET}/${OBJECT_PATH}?token=fresh-${sequence}`});
  }});
  const first=await service.signedUrl('qa-token',{objectPath:OBJECT_PATH});
  const second=await service.signedUrl('qa-token',{objectPath:OBJECT_PATH});
  assert.notEqual(first,second);
  assert.match(first,/^https:\/\/pjhmrhejsoofmouedavw\.supabase\.co/);
  assert.equal(sequence,2);
});

test('visor integra PDF, JPEG y PNG con carga, error, reintento, Escape y nueva pestaña reservada',()=>{
  const markup=__iriExternalReportInternals.viewerMarkup();
  const source=read('src/m26/workflows/iri-external-report-controller.js');
  assert.match(markup,/<iframe[^>]+data-iri-document-viewer-pdf/);
  assert.match(markup,/<img[^>]+data-iri-document-viewer-image[^>]+alt=/);
  assert.match(markup,/Preparando acceso privado|Reintentar|Cerrar visor|Abrir en una pestaña nueva/);
  assert.match(source,/event\.key !== 'Escape'/);
  assert.ok(source.indexOf('const viewTarget = prepareIriExternalReportViewTarget();')<source.indexOf('const url = await api.signedUrl'));
  for(const type of ['application/pdf','image/jpeg','image/png'])assert.equal(validateIriExternalReportFile({name:'informe',type,size:1}).mimeType,type);
  assert.throws(()=>validateIriExternalReportFile({name:'informe.webp',type:'image/webp',size:1}),/MIME_INVALID/);
});

test('contrato RC37 permanece intacto y el visor autoriza únicamente el origen canónico en CSP',()=>{
  assert.equal(IRI_EXTERNAL_REPORT_BUCKET,'iberfit-iri-external-reports');
  assert.equal(IRI_EXTERNAL_REPORT_MAX_BYTES,50_000_000);
  assert.equal(IRI_EXTERNAL_REPORT_REQUEST_TIMEOUT_MS,12_000);
  assert.equal(IRI_EXTERNAL_REPORT_UPLOAD_TIMEOUT_MS,180_000);
  const source=read('src/m26/workflows/iri-external-report-controller.js');
  assert.match(source,/iri_external_reports_v26/);
  assert.match(source,/iberfit_register_iri_external_report_v12/);
  assert.match(source,/x-upsert': 'true'/);
  const headers=read('public/m26/_headers');
  assert.match(headers,/frame-src 'self' https:\/\/pjhmrhejsoofmouedavw\.supabase\.co/);
  assert.match(headers,/img-src 'self' data: blob: https:\/\/pjhmrhejsoofmouedavw\.supabase\.co/);
});
