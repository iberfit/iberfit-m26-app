import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {buildIriCommandDraftFromFirstSession,normalizeFirstSessionDraft,__iriFirstSessionInternals} from '../src/m26/workflows/iri-first-session.js';
import {buildIriReportHtml,__iriReportInternals} from '../src/m26/workflows/iri-report-document.js';
import {buildIriCommand} from '../src/m26/workflows/iri-workflow.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function raw(){
  return {
    assessmentDate:'2026-10-03',birthDate:'1975-04-10',sexForNorms:'female',
    email:'qa@example.com',phone:'+56 9 1111 2222',modality:'presencial',
    trainingAddress:'Santiago',primaryObjective:'Conocer el punto de partida',
    trainingExperience:'Intermedia',availability:'Viernes',screeningAccepted:'on',
    weightKg:'88.8',heightCm:'170',bodyFatPercent:'20.6',leanMassKg:'18.3',muscleMassKg:'65.8',
    ankleLeft1:'5',ankleLeft2:'7',ankleLeft3:'8',ankleRight1:'5',ankleRight2:'7',ankleRight3:'8',
    posteriorLeft1:'6',posteriorLeft2:'5',posteriorLeft3:'4',posteriorRight1:'5',posteriorRight2:'3',posteriorRight3:'3',
    hipRotationResult:'Asimetría leve',squatDepth:'Parcial',
    chairStand30s:'18',chairStandValid:'on',pushVariant:'knees',pushUps:'14',pushValid:'on',
    trxRowRepetitions:'15',trxValid:'on',frontPlankSeconds:'45',
    cardioSkipped:'on',cardioSkipReason:'No realizada',
    diagnosisStrengths:'Buen control',diagnosisPriorities:'Movilidad de tobillo',
    coachInterpretation:'Lectura profesional del punto de partida.',
    trainingImplications:'Priorizar movilidad y fuerza.',
    initialPlan:'Bloque inicial progresivo.',reviewAccepted:'on',
  };
}

test('masa grasa y masa libre de grasa no se confunden aunque exista un dato histórico incoherente',()=>{
  const view=__iriReportInternals.bodyCompositionView({
    weightKg:88.8,bodyFatPercent:20.6,leanMassKg:18.3,muscleMassKg:65.8,
  });
  assert.equal(view.fatMassKg,18.3);
  assert.equal(view.leanMassKg,70.5);
  assert.equal(view.rawLeanInconsistent,true);
});

test('cliente conserva diez páginas útiles sin una página fotográfica vacía',()=>{
  const draft=normalizeFirstSessionDraft(raw(),{id:'11111111-1111-4111-8111-111111111111'},'CLIENT-QA');
  const html=buildIriReportHtml({draft,variant:'client',clientName:'Patricia QA',coachName:'Carlos'});
  assert.equal((html.match(/class="pdf-page/g)||[]).length,10);
  assert.doesNotMatch(html,/No hay capturas disponibles|Fotogrametría no incorporada/u);
  assert.match(html,/Cómo leer este IRI/u);
  assert.match(html,/Fotogrametría/u);
});

test('fotogrametría real añade evidencia y no sustituye el núcleo del informe',()=>{
  const draft=normalizeFirstSessionDraft(raw(),{id:'11111111-1111-4111-8111-111111111111'},'CLIENT-QA');
  const photos=['front','back','left','right'].map((view)=>({view,url:'data:image/jpeg;base64,ZmFrZQ==',widthPx:1000,heightPx:1500}));
  const photogrammetryReport={
    available:true,photos,landmarks:{},measurements:{metrics:[]},
    quality:{level:'completa',capturedViews:4,analyzedViews:0,validated:false},
    interpretation:{reproducibleSignals:[],observations:[]},
  };
  const html=buildIriReportHtml({draft,variant:'client',clientName:'Patricia QA',coachName:'Carlos',photogrammetryReport});
  assert.equal((html.match(/class="pdf-page/g)||[]).length,11);
  assert.match(html,/REGISTRO FOTOGRÁFICO/u);
});

test('subida externa acepta PDF JPG PNG y ya no limita el documento a cuatro páginas',()=>{
  const route=read('src/m26/modules/route-render.js');
  const external=read('src/m26/workflows/iri-external-report-controller.js');
  const document=read('src/m26/workflows/iri-report-document.js');
  assert.match(route,/accept="application\/pdf,image\/png,image\/jpeg"/u);
  assert.match(external,/PDFJS_PRINT_MAX_PAGES=24/u);
  assert.doesNotMatch(document,/\.filter\(Boolean\)\.slice\(0,4\)/u);
});

test('Solo IRI autoriza adjuntos por la asignación canónica activa sin depender de la tabla legacy',()=>{
  const migration=read('supabase/migrations/20261003144500_iri_external_report_canonical_assignment_hotfix.sql');
  assert.match(migration,/iberfit_coach_client_assignments/u);
  assert.match(migration,/a\.coach_user_id=auth\.uid\(\)/u);
  assert.match(migration,/a\.client_id=p_client_id::text/u);
  assert.match(migration,/a\.status='active'/u);
});

test('una etapa IRI validada no queda atrapada por el respaldo local ni por el cálculo visual',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.match(workflow,/async function persistIriDraftBackup/u);
  assert.match(workflow,/await persistIriDraftBackup\(clientId,draft,form\)/u);
  assert.match(workflow,/try\{computed\(form,draft\);\}catch\{\}/u);
  assert.match(workflow,/'ankle-left':normalized\.mobility\?\.ankle\?\.leftBest/u);
  assert.match(workflow,/'posterior-diff':normalized\.mobility\?\.posteriorChain\?\.asymmetryCm/u);
  const route=read('src/m26/modules/route-render.js');
  assert.match(route,/data-iri-computed="ankle-left"/u);
  assert.match(route,/data-iri-computed="posterior-diff"/u);
});


test('el IRI activo usa la evaluación inicial más reciente y aísla el borrador por assessment',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.match(workflow,/String\(b\.assessmentDate\|\|b\.assessment_date\|\|b\.updatedAt/u);
  assert.ok(workflow.includes('return assessmentId?`${IRI_DRAFT_SCOPE}:${assessmentId}`:IRI_DRAFT_SCOPE;'));
  assert.match(workflow,/legacyAssessmentId===currentAssessmentId/u);
  assert.match(workflow,/draftRepository\?\.remove\?\.\(draft\.clientId,iriDraftStorageScope\(draft,form\)\)/u);
});

test('el stepper no puede saltar etapas futuras y el consentimiento físico se persiste antes de las pruebas',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.match(workflow,/const target=index>current\+1\?current\+1:index/u);
  assert.match(workflow,/persistPhysicalConsentBeforeTesting/u);
  assert.match(workflow,/if\(step==='entrevista'\)await persistPhysicalConsentBeforeTesting\(form,draft\)/u);
  assert.match(workflow,/registrado antes de iniciar movilidad, fuerza y capacidad de esfuerzo/u);
});


test('la cobertura mínima usa Movilidad + Fuerza + Cardio y deja composición fuera de la nota funcional',()=>{
  const client={id:'11111111-1111-4111-8111-111111111111'};
  const draft=normalizeFirstSessionDraft(raw(),client,'CLIENT-QA');
  const coverage=__iriFirstSessionInternals.coreDomainCoverage(draft);
  assert.deepEqual(Object.keys(coverage.states),['mobility','strength','cardio']);
  assert.equal(coverage.states.mobility,true);
  assert.equal(coverage.states.strength,true);
  assert.equal(coverage.states.cardio,false);
  assert.equal(coverage.complete,true);
  assert.equal(coverage.bodyCompositionRecorded,true);

  const noMobility=normalizeFirstSessionDraft({
    ...raw(),
    mobilitySkipped:'on',
    mobilitySkipReason:'No realizada',
    ankleLeft1:'',ankleLeft2:'',ankleLeft3:'',ankleRight1:'',ankleRight2:'',ankleRight3:'',
    posteriorLeft1:'',posteriorLeft2:'',posteriorLeft3:'',posteriorRight1:'',posteriorRight2:'',posteriorRight3:'',
    hipRotationResult:'',squatDepth:'',
  },client,'CLIENT-QA');
  const onlyStrength=__iriFirstSessionInternals.coreDomainCoverage(noMobility);
  assert.equal(onlyStrength.bodyCompositionRecorded,true);
  assert.equal(onlyStrength.states.mobility,false);
  assert.equal(onlyStrength.states.strength,true);
  assert.equal(onlyStrength.states.cardio,false);
  assert.equal(onlyStrength.complete,false);
});


test('el consentimiento previo a pruebas es fail-soft sin conexión y fail-closed al confirmar',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.match(workflow,/Consentimiento registrado en el borrador\. Sin conexión/u);
  assert.match(workflow,/return Object\.freeze\(\{ok:false,deferred:true,reason:'offline'\}\)/u);
  assert.match(workflow,/se verificará obligatoriamente antes de confirmar/u);
  assert.match(workflow,/Registrando consentimiento y confirmando la evaluación/u);
  assert.match(workflow,/M26_IRI_PHYSICAL_CONSENT_TIMEOUT/u);
});


test('Cliente y Coach reservan la ventana de informe antes de esperar evidencias asíncronas',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  const start=workflow.indexOf('async function generateIriReport(variant)');
  const end=workflow.indexOf('async function validatePlan()',start);
  assert.ok(start>=0&&end>start);
  const block=workflow.slice(start,end);
  const reserve=block.indexOf('printTarget=prepareIriReportPrintTarget()');
  const evidence=block.indexOf('[externalReport,photogrammetryReport]=await Promise.all');
  assert.ok(reserve>=0&&evidence>reserve);
  assert.doesNotMatch(block,/if\(variant==='client'\)\{\s*printTarget=prepareIriReportPrintTarget/u);
});


test('la confirmación final conserva la regla funcional 2 de 3 y no sustituye movilidad por composición corporal',()=>{
  const input={
    ...raw(),
    bodyCompositionSkipped:'on',
    bodyCompositionSkipReason:'Bioimpedancia no disponible durante esta evaluación.',
    cardioSkipped:'on',
    cardioSkipReason:'Capacidad de esfuerzo no realizada en esta sesión.',
  };
  const current={id:'11111111-1111-4111-8111-111111111111',revision:0};
  const firstSession=normalizeFirstSessionDraft(input,current,'CLIENT-QA');
  const functional=__iriFirstSessionInternals.coreDomainCoverage(firstSession);
  assert.deepEqual(functional.states,{mobility:true,strength:true,cardio:false});
  assert.equal(functional.complete,true);
  assert.equal(functional.bodyCompositionRecorded,false);

  const commandDraft=buildIriCommandDraftFromFirstSession(firstSession,current);
  const command=buildIriCommand(commandDraft,0);
  assert.deepEqual(command.payload.patch.evidenceCoverage.states,{mobility:true,strength:true,cardio:false});
  assert.equal(command.payload.patch.evidenceCoverage.complete,true);
});

test('Cliente y Coach usan la misma lectura coherente de masa grasa y masa libre de grasa',()=>{
  const draft=normalizeFirstSessionDraft(raw(),{id:'11111111-1111-4111-8111-111111111111'},'CLIENT-QA');
  const client=buildIriReportHtml({draft,variant:'client',clientName:'Patricia QA',coachName:'Carlos'});
  const coach=buildIriReportHtml({draft,variant:'coach',clientName:'Patricia QA',coachName:'Carlos',clientId:'CLIENT-QA'});
  for(const html of [client,coach]){
    assert.match(html,/Masa grasa/u);
    assert.match(html,/18[,.]3 kg/u);
    assert.match(html,/Masa libre de grasa/u);
    assert.match(html,/70[,.]5 kg/u);
  }
  assert.doesNotMatch(coach,/Masa magra<\/span><strong>18[,.]3 kg/u);
});
