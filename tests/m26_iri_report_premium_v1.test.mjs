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

test('informe cliente v3 usa nueve páginas y separa Solo IRI de entrenamiento activo',()=>{
  const iriOnly=buildIriReportHtml({draft:draft(),variant:'client',clientName:'Cliente Demo',coachName:'Carlos',iriOnly:true});
  const active=buildIriReportHtml({draft:draft(),variant:'client',clientName:'Cliente Demo',coachName:'Carlos',iriOnly:false});
  assert.equal((iriOnly.match(/class="pdf-page/g)||[]).length,9);
  assert.equal((active.match(/class="pdf-page/g)||[]).length,9);
  assert.match(iriOnly,/Solo IRI · evaluación independiente/);
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
  assert.match(html,/Fuerza por patrones/);
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
