import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLongitudinalAggregation,
} from '../src/m26/intelligence/longitudinal-aggregation.js';
import {
  mountClientProgressDecisionLayer,
  renderLongitudinalDataExperience,
  renderProgressDecisionLayer,
} from '../src/m26/data-experience/progress-decision-ui.js';

const NOW=new Date('2026-09-28T12:00:00.000Z');

function emptyState(){
  return {collections:{}};
}

function meaningfulHub(){
  return {
    headline:'2 de 5 áreas con evidencia reciente',
    pillars:[
      {id:'consistency',label:'Constancia',status:'strong',value:80,unit:'%',evidence:'4 de 5 sesiones confirmadas',context:'90 días · 75%'},
      {id:'strength',label:'Fuerza',status:'building',value:2,unit:'ejercicios comparables',evidence:'1 con evolución favorable confirmada',context:'3 ejercicios con historial'},
      {id:'volume',label:'Volumen',status:'review',value:1200,unit:'kg·rep medio',evidence:'Cambio reciente -8%',context:'Carga × repeticiones'},
      {id:'wellbeing',label:'Bienestar',status:'insufficient',value:null,unit:'registros / 28 días',evidence:'Sin registros confirmados',context:'Señales separadas'},
      {id:'activity',label:'Actividad',status:'insufficient',value:null,unit:'días con datos',evidence:'Sin datos recientes',context:'Calidad limitada'},
    ],
    actionable:['volume'],
    diagnosticBaseline:{
      available:true,
      evidence:'1 hito IRI confirmado',
      context:'El IRI establece el punto de partida',
      contributesToEvolution:false,
    },
  };
}

test('longitudinal aggregate exposes evidence-backed progress hub without a global score',()=>{
  const aggregate=buildLongitudinalAggregation(
    emptyState(),
    'client-progress-hub',
    {now:NOW}
  );

  assert.ok(aggregate.progressHub,'progressHub must be part of the longitudinal contract');
  assert.equal(aggregate.progressHub.pillars.length,5);
  assert.equal(aggregate.progressHub.totalPillars,5);
  assert.equal('score' in aggregate.progressHub,false);
  assert.equal('overallScore' in aggregate.progressHub,false);
  assert.equal(
    aggregate.progressHub.diagnosticBaseline.contributesToEvolution,
    false
  );
  assert.equal(
    aggregate.progressHub.diagnosticBaseline.role,
    'initial-diagnostic'
  );
});

test('client decision layer is concise and keeps IRI explicitly outside daily evolution',()=>{
  const html=renderProgressDecisionLayer(meaningfulHub(),{role:'client'});
  assert.match(html,/¿Estoy progresando\?/);
  assert.match(html,/Diagnóstico IRI · punto de partida/);
  assert.match(html,/no se mezcla con las señales de evolución cotidiana/i);
  assert.doesNotMatch(html,/Prioridad de revisión/);
  assert.equal((html.match(/data-progress-pillar=/g)||[]).length,3);
});

test('client decision layer does not fill the summary with insufficient-data cards',()=>{
  const hub=meaningfulHub();
  hub.pillars=[
    hub.pillars[0],
    ...hub.pillars.slice(1).map((pillar)=>({...pillar,status:'insufficient',value:null})),
  ];
  hub.diagnosticBaseline={...hub.diagnosticBaseline,available:false};

  const html=renderProgressDecisionLayer(hub,{role:'client'});
  assert.equal((html.match(/data-progress-pillar=/g)||[]).length,1);
  assert.match(html,/Constancia/);
  assert.doesNotMatch(html,/Fuerza/);
  assert.doesNotMatch(html,/Volumen/);
});

test('client decision layer stays absent when there is no meaningful evidence yet',()=>{
  const hub={
    headline:'0 de 5 áreas con evidencia reciente',
    pillars:[
      {id:'consistency',label:'Constancia',status:'insufficient',value:null,evidence:'Sin datos'},
      {id:'strength',label:'Fuerza',status:'insufficient',value:null,evidence:'Sin datos'},
      {id:'volume',label:'Volumen',status:'insufficient',value:null,evidence:'Sin datos'},
      {id:'wellbeing',label:'Bienestar',status:'insufficient',value:null,evidence:'Sin datos'},
      {id:'activity',label:'Actividad',status:'insufficient',value:null,evidence:'Sin datos'},
    ],
    actionable:[],
    diagnosticBaseline:{
      available:false,
      evidence:'Sin diagnóstico IRI confirmado',
      context:'El IRI establece el punto de partida',
      contributesToEvolution:false,
    },
  };

  assert.equal(renderProgressDecisionLayer(hub,{role:'client'}),'');
  assert.equal(renderProgressDecisionLayer(null,{role:'client'}),'');
});

test('client progress portal moves the decision layer before collapsed detail exactly once',()=>{
  const beforeCalls=[];
  const details={
    before(node){beforeCalls.push(node);},
  };
  const node={
    dataset:{},
    closest(selector){
      assert.equal(selector,'details.m26-client-progress-detail');
      return details;
    },
  };

  assert.equal(mountClientProgressDecisionLayer(node),true);
  assert.equal(node.dataset.progressDecisionMounted,'true');
  assert.deepEqual(beforeCalls,[node]);
  assert.equal(mountClientProgressDecisionLayer(node),false);
  assert.deepEqual(beforeCalls,[node]);
});

test('longitudinal wrapper uses a client portal but keeps professional rendering inline',()=>{
  const base=buildLongitudinalAggregation(
    emptyState(),
    'client-progress-wrapper',
    {now:NOW}
  );
  const aggregate={...base,progressHub:meaningfulHub()};

  const clientHtml=renderLongitudinalDataExperience(aggregate,{role:'client'});
  assert.match(clientHtml,/data-progress-decision-portal="true"/);
  assert.equal((clientHtml.match(/data-progress-decision-layer="true"/g)||[]).length,1);

  const coachHtml=renderLongitudinalDataExperience(aggregate,{role:'coach'});
  assert.doesNotMatch(coachHtml,/data-progress-decision-portal="true"/);
  assert.equal((coachHtml.match(/data-progress-decision-layer="true"/g)||[]).length,1);
  assert.match(coachHtml,/Evidencia de progreso/);
});

test('coach decision layer prioritizes review signals without changing planning automatically',()=>{
  const hub={
    headline:'3 de 5 áreas con evidencia reciente',
    pillars:[
      {id:'consistency',label:'Constancia',status:'strong',value:90,unit:'%',evidence:'9 de 10 sesiones confirmadas',context:'90 días · 88%'},
      {id:'strength',label:'Fuerza',status:'building',value:2,unit:'ejercicios comparables',evidence:'1 favorable',context:'4 ejercicios con historial'},
      {id:'volume',label:'Volumen',status:'review',value:1000,unit:'kg·rep medio',evidence:'Cambio reciente -9%',context:'Carga × repeticiones'},
      {id:'wellbeing',label:'Bienestar',status:'building',value:3,unit:'registros / 28 días',evidence:'3 registros',context:'Señales separadas'},
      {id:'activity',label:'Actividad',status:'insufficient',value:null,unit:'días con datos',evidence:'Sin datos',context:'Calidad limitada'},
    ],
    actionable:['volume'],
    diagnosticBaseline:{
      available:false,
      evidence:'Sin diagnóstico IRI confirmado',
      context:'El IRI establece el punto de partida',
      contributesToEvolution:false,
    },
  };

  const html=renderProgressDecisionLayer(hub,{role:'coach'});
  assert.match(html,/Evidencia de progreso/);
  assert.match(html,/Prioridad de revisión:<\/strong> Volumen/);
  assert.match(html,/no modifica la planificación automáticamente/i);
  assert.match(html,/Cambio reciente -9%/);
  assert.equal((html.match(/data-progress-pillar=/g)||[]).length,4);
});
