import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLongitudinalAggregation,
} from '../src/m26/intelligence/longitudinal-aggregation.js';
import {
  renderProgressDecisionLayer,
} from '../src/m26/data-experience/progress-decision-ui.js';

const NOW=new Date('2026-09-28T12:00:00.000Z');

function emptyState(){
  return {collections:{}};
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
  const hub={
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

  const html=renderProgressDecisionLayer(hub,{role:'client'});
  assert.match(html,/¿Estoy progresando\?/);
  assert.match(html,/Diagnóstico IRI · punto de partida/);
  assert.match(html,/no se mezcla con las señales de evolución cotidiana/i);
  assert.doesNotMatch(html,/Prioridad de revisión/);
  assert.equal((html.match(/data-progress-pillar=/g)||[]).length,3);
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
