import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
import {
  clientProgressPresentationStage,
  renderProgressRoute,
} from '../src/m26/modules/route-render.js';

function summary(overrides={}){
  return {
    days:28,
    dataQuality:'limitada',
    adherence:null,
    completedSessions:0,
    plannedSessions:0,
    averageRpe:null,
    volume:null,
    volumeDelta:null,
    iriCurrent:null,
    iriDelta:null,
    iriAssessmentCount:0,
    iriBaseline:null,
    evolution:null,
    iri2:null,
    checkins:0,
    checkinAverage:{},
    wearable:{
      metrics:{},
      providers:[],
      daysWithData:0,
      freshness:'sin_datos',
      quality:'limitada',
    },
    unconfirmedExecutions:0,
    lastExecutionAt:null,
    lastExecutionRpe:null,
    ...overrides,
  };
}

function render(role,progressSummary,extra={}){
  return renderProgressRoute({
    role,
    summary:progressSummary,
    signal:{label:'Al día',level:'neutral'},
    timeline:[],
    longitudinal:null,
    alerts:[],
    planExecution:null,
    exerciseProgress:{totalExercises:0,totalExecutions:0,exercises:[]},
    exercisePerformance:[],
    ...extra,
  });
}

test('SIGNATURE Client progress baseline and variable adherence windows translate ES EN FR PT',()=>{
  const translations=[
    ['Punto de partida IRI','Initial IRI baseline','Point de départ IRI','Ponto de partida IRI'],
    ['Sin diagnóstico confirmado','No confirmed initial assessment','Aucun diagnostic initial confirmé','Sem diagnóstico inicial confirmado'],
    ['2 de 3 sesiones confirmadas en los últimos 7 días.','2 of 3 confirmed sessions in the last 7 days.','2 séances confirmées sur 3 au cours des 7 derniers jours.','2 de 3 sessões confirmadas nos últimos 7 dias.'],
    ['1 de 2 sesiones confirmadas en los últimos 28 días.','1 of 2 confirmed sessions in the last 28 days.','1 séance confirmée sur 2 au cours des 28 derniers jours.','1 de 2 sessões confirmadas nos últimos 28 dias.'],
  ];
  for(const [es,en,fr,pt] of translations){
    assert.equal(iberfitSurfaceTranslate(es,{language:'en'}),en);
    assert.equal(iberfitSurfaceTranslate(es,{language:'fr'}),fr);
    assert.equal(iberfitSurfaceTranslate(es,{language:'pt'}),pt);
  }
});

test('Client progress starts with meaning before empty analytics',()=>{
  const model=clientProgressPresentationStage(
    summary({completedSessions:1,dataQuality:'limitada'}),
    {timelineLength:1,exerciseCount:0},
  );

  assert.equal(model.stage,'starting');
  assert.match(model.title,/construyendo tu historial/iu);
  assert.match(model.next,/al menos dos sesiones confirmadas/iu);

  const html=render('client',summary({
    completedSessions:1,
    plannedSessions:1,
    dataQuality:'limitada',
  }));

  assert.match(html,/data-client-progress-stage="starting"/u);
  assert.match(html,/Estamos construyendo tu historial/u);
  assert.match(html,/Ver detalle completo/u);
  assert.match(html,/Evolución por ejercicio/u);
  assert.doesNotMatch(html,/Continuidad confirmada<\/span><strong>0%/u);
});

test('Client progress becomes comparable only with confirmed comparison evidence',()=>{
  assert.equal(
    clientProgressPresentationStage(
      summary({completedSessions:2,plannedSessions:2,dataQuality:'media'}),
      {timelineLength:2},
    ).stage,
    'comparable',
  );

  assert.equal(
    clientProgressPresentationStage(
      summary({checkins:3,dataQuality:'media'}),
      {timelineLength:3},
    ).stage,
    'comparable',
  );

  assert.equal(
    clientProgressPresentationStage(
      summary({iriAssessmentCount:2,dataQuality:'media'}),
      {timelineLength:2},
    ).stage,
    'starting',
  );

  assert.equal(
    clientProgressPresentationStage(
      summary({wearable:{metrics:{},providers:[],daysWithData:3,freshness:'reciente',quality:'media'}}),
      {timelineLength:0},
    ).stage,
    'comparable',
  );
});

test('Client mature progress keeps full evidence available without forcing it open',()=>{
  const progressSummary=summary({
    completedSessions:6,
    plannedSessions:7,
    adherence:6/7,
    dataQuality:'alta',
    checkins:3,
  });
  const stage=clientProgressPresentationStage(
    progressSummary,
    {timelineLength:10,exerciseCount:3},
  );
  assert.equal(stage.stage,'mature');

  const html=render('client',progressSummary,{
    timeline:Array.from({length:10},(_,index)=>({
      kind:'execution',
      date:`2026-09-${String(index+1).padStart(2,'0')}T10:00:00.000Z`,
      title:'Sesión ejecutada',
      status:'completado',
      detail:'Ejecución registrada',
    })),
  });

  assert.match(html,/data-client-progress-stage="mature"/u);
  assert.match(html,/Tu evolución ya tiene contexto/u);
  assert.match(html,/data-client-progress-depth="mature"/u);
  assert.match(html,/Ver detalle completo/u);
  assert.match(html,/Historial, bienestar, punto de partida IRI, dispositivos, alertas y ejercicios confirmados/u);
  assert.match(html,/Evolución registrada/u);
  assert.ok(
    html.indexOf('m26-progress-overview')<html.indexOf('m26-client-progress-detail'),
    'primary adherence evidence must stay ahead of deep detail',
  );
});

test('Client evolution never calls an IRI draft a confirmed initial baseline and exposes adherence window',()=>{
  const pending=render('client',summary({
    iriAssessmentCount:1,iriBaseline:null,
    completedSessions:1,plannedSessions:2,adherence:0.5,days:28,
  }));
  assert.match(pending,/<span>Punto de partida IRI<\/span><strong>Sin diagnóstico confirmado<\/strong>/u);
  assert.doesNotMatch(pending,/<span>Punto de partida IRI<\/span><strong>Confirmado<\/strong>/u);
  assert.match(pending,/1 de 2 sesiones confirmadas en los últimos 28 días\./u);
  assert.doesNotMatch(pending,/ventana seleccionada/u,'do not imply the Client selected a date range');
  const confirmed=render('client',summary({
    iriAssessmentCount:1,iriBaseline:{baselineAssessmentId:'iri-confirmed'},
    completedSessions:2,plannedSessions:3,adherence:2/3,days:7,
  }));
  assert.match(confirmed,/<span>Punto de partida IRI<\/span><strong>Confirmado<\/strong>/u);
  assert.match(confirmed,/2 de 3 sesiones confirmadas en los últimos 7 días\./u);
  assert.match(confirmed,/data-iri-baseline/u,'confirmed initial diagnostic remains available as separate context');
});

test('Coach keeps the professional full-depth progress surface unchanged in hierarchy',()=>{
  const html=render('coach',summary({
    completedSessions:2,
    plannedSessions:3,
    adherence:2/3,
    dataQuality:'media',
  }));

  assert.match(html,/Progreso y adherencia/u);
  assert.match(html,/RPE medio/u);
  assert.match(html,/Volumen medio/u);
  assert.match(html,/Diagnóstico IRI/u);
  assert.doesNotMatch(html,/data-client-progress-stage/u);
  assert.doesNotMatch(html,/Ver detalle completo/u);
});

test('Client progressive disclosure keeps missing values missing rather than inventing zero',()=>{
  const html=render('client',summary());

  assert.match(html,/0<\/strong>[\s\S]*Registros de bienestar/u);
  assert.doesNotMatch(html,/Continuidad confirmada/u);
  assert.doesNotMatch(html,/Adherencia confirmada/u);
  assert.doesNotMatch(html,/0% de adherencia/iu);
});

test('Client progress progressive disclosure CSS is responsive and accessible',()=>{
  const css=fs.readFileSync(
    new URL('../src/m26/design/role-surfaces.css',import.meta.url),
    'utf8',
  );
  const start=css.indexOf('/* CLIENT PROGRESSIVE DISCLOSURE V1 */');
  assert.ok(start>=0);
  const block=css.slice(start);

  for(const selector of [
    '.m26-client-progress-stage',
    '.m26-client-progress-milestones',
    '.m26-client-progress-detail',
    '.m26-client-progress-detail-body',
  ]){
    assert.ok(block.includes(selector),`missing ${selector}`);
  }

  assert.match(block,/@media \(max-width:640px\)/u);
  assert.match(block,/@media \(max-width:390px\)/u);
  assert.match(block,/@media \(forced-colors:active\)/u);
  assert.match(block,/@media print/u);
});


test('Client uses one canonical Progress surface while Cliente 360 remains Coach-only',()=>{
  const runtime=fs.readFileSync(
    new URL('../src/m26/ui/client-360.js',import.meta.url),
    'utf8',
  );
  const navigation=fs.readFileSync(
    new URL('../src/m26/shell/navigation.js',import.meta.url),
    'utf8',
  );

  assert.match(runtime,/role==='coach'/u);
  assert.doesNotMatch(runtime,/\['client','coach'\]\.includes/u);
  assert.match(
    navigation,
    /progreso: Object\.freeze\(\{ key: 'progreso', label: 'Progreso', title: 'Progreso y seguimiento'/u,
  );
});
