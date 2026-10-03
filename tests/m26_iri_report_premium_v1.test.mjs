import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {normalizeFirstSessionDraft} from '../src/m26/workflows/iri-first-session.js';
import {buildIriReportHtml,__iriReportInternals} from '../src/m26/workflows/iri-report-document.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function draft(){
  return normalizeFirstSessionDraft({
    assessmentDate:'2026-10-03',birthDate:'1991-04-12',sexForNorms:'female',email:'demo@example.com',phone:'+56 9 1111 2222',modality:'presencial',trainingAddress:'Santiago',primaryObjective:'Mejorar fuerza y condición física',trainingExperience:'Intermedia',availability:'Dos tardes',screeningAccepted:'on',
    weightKg:'62.4',heightCm:'166',bodyFatPercent:'20.6',leanMassKg:'43.8',bodyWaterPercent:'54.1',visceralFatLevel:'5',waistCm:'72',bodyCompositionMethod:'Bioimpedancia',bodyCompositionDevice:'Equipo demo',
    ankleLeft1:'11',ankleRight1:'9',posteriorLeft1:'25',posteriorRight1:'24',hipRotationResult:'Simétrica',squatDepth:'Paralela',
    chairStand30s:'18',chairStandValid:'on',pushVariant:'knees-supported',pushUps:'21',pushValid:'on',trxRowRepetitions:'24',trxValid:'on',trxHandleHeightCm:'100',frontPlankSeconds:'92',
    cardioProtocol:'treadmill-3min-field',cardioDurationSeconds:'180',treadmillSpeedKmh:'5.5',treadmillInclinePercent:'2',treadmillLocomotionMode:'marcha',cardioHrMethod:'banda pectoral',cardioRecoveryMode:'de pie',stepFinalHr:'143',stepOneMinuteHr:'112',twoMinuteHr:'98',cardioValid:'on',
    diagnosisStrengths:'Buen control del tronco',diagnosisPriorities:'Mejorar movilidad de tobillo\nAumentar fuerza de tracción',coachInterpretation:'El punto de partida permite orientar prioridades concretas sin extrapolar resultados no medidos.',trainingImplications:'Priorizar movilidad de tobillo y fuerza por patrones manteniendo configuraciones comparables.',initialPlan:'Iniciar un bloque progresivo de fuerza con control técnico y reevaluación.',recommendedFrequency:'2 sesiones por semana',reviewAccepted:'on',
  },{id:'11111111-1111-4111-8111-111111111111'},'CLIENT-DEMO');
}

test('informe cliente v3 usa diez páginas base y separa Solo IRI de entrenamiento activo',()=>{
  const iriOnly=buildIriReportHtml({draft:draft(),variant:'client',clientName:'Cliente Demo',coachName:'Carlos',iriOnly:true});
  const active=buildIriReportHtml({draft:draft(),variant:'client',clientName:'Cliente Demo',coachName:'Carlos',iriOnly:false});
  assert.equal((iriOnly.match(/class="pdf-page/g)||[]).length,10);
  assert.equal((active.match(/class="pdf-page/g)||[]).length,10);
  assert.match(iriOnly,/EVALUACIÓN INDEPENDIENTE · SOLO IRI/);
  assert.match(iriOnly,/No implica planificación, frecuencia contractual ni seguimiento de entrenamiento activo/);
  assert.doesNotMatch(iriOnly,/Impacto sobre la planificación/);
  assert.match(active,/Impacto sobre la planificación/);
  assert.match(active,/Iniciar un bloque progresivo de fuerza/);
});

test('marca del informe deriva de Brand Truth y tokens canónicos sin recolor',()=>{
  const brand=JSON.parse(read('src/m26/design/brand-truth.json'));
  const css=read('public/m26/iri-report.css');
  const source=read('src/m26/workflows/iri-report-document.js');
  assert.equal(brand.officialAsset.path,'public/isotipo-iberfit.png');
  assert.equal(brand.officialAsset.useAsIs,true);
  assert.equal(brand.officialAsset.recolorFromUiTokens,false);
  assert.match(source,/logoUrl='\/public\/isotipo-iberfit\.png'/);
  assert.doesNotMatch(source,/const PALETTE=/);
  assert.match(css,/@import url\('\/src\/m26\/design\/tokens\.css'\)/);
  assert.match(css,/@import url\('\/src\/m26\/design\/typography\.css'\)/);
  assert.doesNotMatch(css,/#faf6ed|#fffdf8|#082218|#b9944f/i);
  assert.doesNotMatch(css,/grayscale\(|sepia\(|hue-rotate\(/i);
  assert.match(css,/\.cover-isotipo[^}]*filter:none!important/s);
});

test('visualizaciones editoriales son accesibles, CSP-safe y no fuerzan escalas incompatibles',()=>{
  const html=buildIriReportHtml({draft:draft(),variant:'client',clientName:'Cliente Demo',coachName:'Carlos'});
  const visuals=read('src/m26/workflows/iri-report-visuals.js');
  assert.doesNotMatch(html,/\sstyle="/u);
  assert.doesNotMatch(visuals,/\sstyle="/u);
  assert.match(html,/role="img"/);
  assert.match(html,/Mapa funcional/);
  assert.match(html,/Fotogrametría/);
  assert.match(html,/fuerza por patrones/i);
  assert.match(html,/referencia inicial individual/i);
  assert.match(html,/no hereda baremos YMCA/i);
  assert.doesNotMatch(html,/buena salud cardiovascular/i);
});

test('autoajuste A4 no reduce silenciosamente el informe por debajo del 94 por ciento',()=>{
  assert.deepEqual(__iriReportInternals.REPORT_FIT_LEVELS,[100,98,96,94]);
  const css=read('public/m26/iri-report.css');
  assert.match(css,/iri-report-fit-94/);
  assert.doesNotMatch(css,/iri-report-fit-(?:92|90|88|86|84|82)/);
});


test('dossier Coach/Admin incorpora anexos técnicos sin depender de visibilidad Cliente',()=>{
  const base=draft();
  const externalReport={
    assessmentId:base.assessmentId,
    mimeType:'application/pdf',
    version:3,
    visibleToClient:false,
    printPreview:{kind:'pdf-raster',pages:['data:image/jpeg;base64,ZmFrZQ=='],totalPages:1,truncated:false},
  };
  const photogrammetryReport={
    available:true,
    photos:[{view:'front',url:'data:image/jpeg;base64,ZmFrZQ==',widthPx:1000,heightPx:1500,capturedAt:'2026-10-03'}],
    landmarks:{front:{}},
    quality:{level:'completa',capturedViews:1,analyzedViews:1,validated:true},
    interpretation:{reproducibleSignals:[],observations:[]},
    measurements:{metrics:[]},
  };
  const html=buildIriReportHtml({
    draft:base,variant:'coach',clientName:'Cliente Demo',coachName:'Carlos',clientId:'CLIENT-DEMO',
    externalReport,photogrammetryReport,
  });
  assert.ok((html.match(/class="pdf-page/g)||[]).length>=17);
  assert.match(html,/ANEXO TÉCNICO · FOTOGRAMETRÍA/);
  assert.match(html,/ANEXO TÉCNICO · BIOIMPEDANCIA/);
  assert.match(html,/Su visibilidad para el cliente se gestiona de forma independiente/);
  assert.match(html,/Anexo íntegro de datos/);
});

test('autorización del adjunto distingue Cliente de Coach/Admin',()=>{
  const controller=read('src/m26/workflows/iri-external-report-controller.js');
  const app=read('src/m26/app/application.js');
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.match(controller,/clientReportForPdf/);
  assert.match(controller,/coachReportForPdf/);
  assert.match(controller,/requireClientVisible:true/);
  assert.match(controller,/requireClientVisible:false/);
  assert.match(app,/variant==='coach'\?iriExternalReports\.coachReportForPdf/);
  assert.match(workflow,/getIriExternalReport\(draft\.assessmentId,\{variant\}\)/);
});
