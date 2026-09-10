import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  renderClientsRoute,
  renderExpedienteRoute,
  renderProgressRoute,
} from '../src/m26/modules/route-render-base.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('Clients V2.7 preserves priority queue, filters and client selection',()=>{
  const html=renderClientsRoute({
    role:'coach',
    canCreate:false,
    selectedClientId:null,
    clients:[{
      id:'c1',
      name:'Cliente Uno',
      modality:'Presencial',
      status:'Activo',
      access:'Activo',
      accessKnown:true,
      profile:{primaryObjective:'Fuerza',weeklyFrequency:2,email:'a@example.com',phone:'123'},
      experience:{stage:'active',stageLabel:'Seguimiento activo',priority:5},
      nextAction:{label:'Revisar seguimiento'},
      nextAppointment:null,
      iri:null,
      followUp:{
        signal:{level:'warning',label:'Revisar contexto'},
        adherence:.75,
        plannedSessions:4,
        completedSessions:3,
        topAlert:{title:'Feedback reciente'},
      },
    }],
  });

  assert.ok(html.includes('m30-clients-route'));
  assert.ok(html.includes('data-clients-surface="portfolio"'));
  assert.ok(html.includes('data-client-priority-queue'));
  assert.ok(html.indexOf('m30-clients-intro')<html.indexOf('data-client-priority-queue'));
  assert.ok(html.includes('m30-client-controls'));
  assert.ok(html.includes('data-client-search'));
  assert.ok(html.includes('enterkeyhint="search"'));
  assert.ok(html.includes('autocapitalize="none"'));
  for(const filter of ['iri','modality','stage']){
    assert.ok(html.includes('data-client-filter="'+filter+'"'),'missing client filter '+filter);
  }
  assert.ok(html.includes('data-client-sort'));
  assert.ok(html.includes('data-client-clear'));
  assert.ok(html.includes('data-m26-select-client="c1"'));
});

test('Expediente V2.7 keeps all four tabs and every core workflow route',()=>{
  const html=renderExpedienteRoute({
    summary:{
      name:'Cliente Uno',
      modality:'Presencial',
      status:'Activo',
      access:'Activo',
      accessKnown:true,
      iri:null,
      profile:{completeness:100,missing:[]},
      counts:{sessions:0,executions:0},
      cycle:null,
      nextAppointment:null,
    },
    progress:{},
    coachCockpit:{items:[]},
    alerts:[],
    alertSignal:{label:'Al día'},
    exercisePerformance:[],
    exerciseProgress:[],
  });

  assert.ok(html.includes('m30-expediente-route'));
  assert.ok(html.includes('data-expediente-surface="client-360"'));
  assert.ok(html.includes('m30-expediente-hero'));
  assert.ok(html.includes('m30-expediente-tabs'));
  assert.ok(html.includes('m30-expediente-current'));
  assert.ok(html.includes('m30-expediente-actions'));

  for(const tab of ['resumen','contexto','perfil','plan']){
    assert.ok(html.includes('data-m26-expediente-tab="'+tab+'"'),'missing expediente tab '+tab);
  }
  for(const area of ['iri','planificacion','sesion','progreso','actividad','informes','notas','inteligencia']){
    assert.ok(html.includes('data-m26-area="'+area+'"'),'missing expediente route '+area);
  }
  assert.ok(html.includes('IBERFIT prioriza el contexto; el entrenador decide.'));
  assert.ok(html.includes('Dato confirmado y contexto no son una prescripción.'));
});

test('Progress V2.7 preserves confirmed-data semantics and explainable alerts',()=>{
  const html=renderProgressRoute({
    role:'coach',
    summary:{
      days:28,
      dataQuality:'alta',
      adherence:.75,
      completedSessions:3,
      plannedSessions:4,
      averageRpe:7,
      volume:1200,
      iriCurrent:null,
      iriDelta:null,
      checkins:0,
      checkinAverage:{},
      wearable:{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'},
      unconfirmedExecutions:1,
      volumeDelta:null,
      lastExecutionAt:null,
    },
    signal:{label:'Revisar contexto',level:'warning'},
    timeline:[],
    longitudinal:null,
    alerts:[],
    exerciseProgress:[],
  });

  assert.ok(html.includes('m30-progress-route'));
  assert.ok(html.includes('data-progress-surface="confirmed-evolution"'));
  assert.ok(html.includes('m30-progress-kpis'));
  assert.ok(html.includes('m30-progress-adherence'));
  assert.ok(html.includes('m30-progress-context'));
  assert.ok(html.includes('m30-progress-timeline'));
  assert.ok(html.includes('m30-progress-wellbeing'));
  assert.ok(html.includes('m30-progress-alerts'));
  assert.ok(html.includes('Progreso protegido'));
  assert.ok(html.includes('Sesiones fuera del cálculo por no estar confirmadas: 1'));
  assert.ok(html.includes('La aplicación no diagnostica ni atribuye causas.'));
  assert.ok(html.includes('Alertas explicables'));
});

test('V2.7 does not replace absent progress data with fabricated values',()=>{
  const source=read('src/m26/modules/route-render-base.js');
  assert.ok(source.includes("formatPercent(value){ return Number.isFinite(value) ?"));
  assert.ok(source.includes("'Sin dato'"));
  assert.ok(source.includes("'Sin comparación suficiente'"));
  assert.ok(source.includes('no se convierten en cero'));
  assert.ok(source.includes('Comparar por dominios, no por puntuación global'));
});

test('Signature V2.7 adapts portfolio, record and progress without hiding capabilities',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  const start=css.indexOf('/* Signature UX V2.7');
  assert.ok(start>=0);
  const added=css.slice(start);

  for(const selector of [
    '.m30-clients-route',
    '.m30-clients-followup',
    '.m30-client-controls',
    '.m30-expediente-hero',
    '.m30-expediente-tabs',
    '.m30-expediente-current',
    '.m30-progress-kpis',
    '.m30-progress-context',
    '.m30-progress-alerts',
  ]){
    assert.ok(added.includes(selector),'missing V2.7 selector '+selector);
  }

  for(const breakpoint of [
    '@media (max-width:1180px)',
    '@media (max-width:900px)',
    '@media (max-width:620px)',
    '@media (max-width:390px)',
    '@media (prefers-reduced-motion:reduce)',
  ]){
    assert.ok(added.includes(breakpoint),'missing V2.7 breakpoint '+breakpoint);
  }

  assert.doesNotMatch(added,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/iu);
});

test('Compact layouts keep search and primary actions comfortable',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  const added=css.slice(css.indexOf('/* Signature UX V2.7'));
  const mobile=added.slice(added.indexOf('@media (max-width:620px)'));
  assert.ok(mobile.includes('.m30-client-controls :is(input,select,button)'));
  assert.ok(mobile.includes('min-height:50px'));
  assert.ok(mobile.includes('.m30-expediente-current .m26-list-card-actions>.m26-primary-action'));
  assert.ok(mobile.includes('width:100%'));
});
