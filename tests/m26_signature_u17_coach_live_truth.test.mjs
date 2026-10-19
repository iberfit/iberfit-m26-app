import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveLiveSessionIntelligence} from '../src/m26/intelligence/live-session-intelligence.js';
import {renderGuidedExecution,renderHeartRateSparkline} from '../src/m26/workflows/session-ui.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';

function event(value,seconds=0){
  return {
    schemaVersion:'iberfit.telemetry.v1',
    eventType:'heart_rate_sample',
    raw:{heartRateBpm:value},
    recordedAt:new Date(Date.UTC(2026,9,19,18,0,seconds)).toISOString(),
    quality:{grade:'alta',code:'valid'},
    context:{phase:'rest',blockId:'block',exerciseId:'current',setNumber:1},
  };
}
function catalogRecord(id,name,pattern='otro',equipment='peso corporal'){
  return {id,name_es:name,pattern,equipment,difficulty:'inicial',intent:'fuerza',
    primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],
    precautions:[],tags:[],aliases:[]};
}
function workout(catalog){
  const session=createSessionDraft({clientId:'u17-client'});
  addCatalogExercise(session,'current',catalog,{sets:2,reps:'10'});
  const execution=createExecution({session,clientId:session.clientId,executionId:'u17-execution'});
  startExecution(execution,{actor:{role:'coach',id:'u17-coach'}});
  return {execution,session};
}

test('U17: no FC ficticia para telemetría vacía y fallback nulo, blanco, cero o inválido',()=>{
  for(const reading of [null,undefined,'', ' ',0,-1,NaN,Infinity,false]){
    const events=[event(reading)];
    const execution={liveTelemetry:{
      status:'connected',heartRateBpm:reading,averageHeartRateBpm:reading,
      maxHeartRateBpm:reading,minHeartRateBpm:reading,timeline:{events},
    }};
    const before=structuredClone(events.filter((item)=>Number.isFinite(item.raw.heartRateBpm)));
    const result=deriveLiveSessionIntelligence(execution);
    assert.equal(result.available,false,String(reading));
    assert.equal(result.interpretableEventCount,0,String(reading));
    for(const field of ['currentHeartRateBpm','averageHeartRateBpm','maxHeartRateBpm','minHeartRateBpm'])
      assert.equal(result[field],null,field+': '+String(reading));
    assert.equal(renderHeartRateSparkline(result.timeline.points).includes('<svg'),false);
    assert.deepEqual(events.filter((item)=>Number.isFinite(item.raw.heartRateBpm)),before);
  }
});

test('U17: las métricas no incorporan ceros canónicos defectuosos ni pierden eventos válidos',()=>{
  const events=[event(120,0),event(null,5),event(' ',10),event(0,15),event(125,20)];
  const snapshot=structuredClone(events);
  const result=deriveLiveSessionIntelligence({liveTelemetry:{
    status:'connected',heartRateBpm:null,averageHeartRateBpm:null,
    maxHeartRateBpm:null,minHeartRateBpm:null,timeline:{events},
  }});
  assert.equal(result.interpretableEventCount,2);
  assert.equal(result.currentHeartRateBpm,125);
  assert.equal(result.averageHeartRateBpm,122.5);
  assert.equal(result.maxHeartRateBpm,125);
  assert.equal(result.timeline.points.length,2);
  assert.deepEqual(events,snapshot,'la telemetría original no debe mutar');
});

test('U17: el Coach ve ausencia de FC real, y una recuperación plana conserva un delta 0 válido',()=>{
  const catalog=createExerciseCatalog([catalogRecord('current','Ejercicio actual','empuje','mancuernas')]);
  const {execution,session}=workout(catalog);
  execution.liveTelemetry={
    status:'connected',providerLabel:'Dispositivo QA',
    heartRateBpm:null,averageHeartRateBpm:null,minHeartRateBpm:null,maxHeartRateBpm:null,
    timeline:{events:[]},
  };
  const empty=renderGuidedExecution({execution,session,catalog,role:'coach'});
  assert.match(empty,/FC actual · —/u);
  assert.doesNotMatch(empty,/FC actual · 0 lpm|FC media<\/span><strong>0 lpm|FC máxima<\/span><strong>0 lpm|NaN|Infinity/u);
  execution.liveTelemetry.timeline.events=[event(120,0),event(120,20)];
  const flat=renderGuidedExecution({execution,session,catalog,role:'coach'});
  assert.match(flat,/Cambio observado · 0 lpm/u);
  assert.match(flat,/FC actual · 120 lpm/u);
});

test('U17: añadir durante Live prioriza un ejercicio relacionado aunque esté más allá de 60 resultados',()=>{
  const records=[
    catalogRecord('current','Ejercicio actual','empuje','mancuernas'),
    ...Array.from({length:68},(_,i)=>catalogRecord('other-'+i,'Otro '+String(i).padStart(3,'0'))),
    catalogRecord('late','Z Alternativa relacionada','empuje','mancuernas'),
  ];
  const catalog=createExerciseCatalog(records);
  const {execution,session}=workout(catalog);
  const html=renderGuidedExecution({execution,session,catalog,role:'coach'});
  const select=html.match(/<select data-session-live-add-exercise>[\s\S]*?<\/select>/u)?.[0]||'';
  const ids=[...select.matchAll(/<option value="([^"]+)"/gu)].map(match=>match[1]).filter(Boolean);
  assert.equal(ids.length,60,'preservar el límite táctil');
  assert.equal(ids[0],'late','la pertinencia prima sobre el orden original del catálogo');
  assert.equal(ids.includes('current'),false);
  assert.match(select,/optgroup label="Mismo patrón y material"/u);
});
