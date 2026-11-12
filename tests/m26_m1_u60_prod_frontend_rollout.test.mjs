import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
import {
  resolveM26Runtime,createM26Transport,
  M26_QA_PROJECT_REF,M26_PRODUCTION_PROJECT_REF,
  M26_PRODUCTION_SUPABASE_ORIGIN,
} from '../src/m26/supabase-transport.js';
import {createDatedOccurrenceQaUi} from '../src/m26/workflows/occurrence-qa-ui.js';

const raw={
  enabled:true,qaOnly:false,projectRef:M26_PRODUCTION_PROJECT_REF,
  url:M26_PRODUCTION_SUPABASE_ORIGIN,
  publishableKey:'pk_synthetic_not_a_secret_123456',
};
const onHost=(host,overrides={})=>resolveM26Runtime({...raw,...overrides},
  {hostname:host});
const CALENDAR={clientId:'10000000-0000-4000-8000-000000000001',
  startDate:'2026-11-12',endDate:'2026-11-14',limit:10};

test('M1 U60 PROD UI is default-off and cannot be enabled by QA, other hosts or wrong project',()=>{
  assert.equal(onHost('app.iberfit.cl').datedTrainingProductionReleased,false);
  assert.equal(onHost('app.iberfit.cl',{datedTrainingProductionReleased:'true'}).datedTrainingProductionReleased,false);
  assert.equal(onHost('app.iberfit.cl',{datedTrainingProductionReleased:true}).datedTrainingProductionReleased,true);
  assert.equal(onHost('app.iberfit.cl',{datedTrainingProductionReleased:true}).datedTrainingProductionStartsEnabled,false);
  assert.equal(onHost('app.iberfit.cl',{datedTrainingProductionReleased:true,datedTrainingProductionStartsEnabled:true}).datedTrainingProductionStartsEnabled,true);
  assert.equal(onHost('app.iberfit.cl',{datedTrainingProductionStartsEnabled:true}).datedTrainingProductionStartsEnabled,false);
  for(const host of ['coach.iberfit.cl','m26-canary.iberfit.cl','localhost','example.com'])
    assert.equal(onHost(host,{datedTrainingProductionReleased:true}).datedTrainingProductionReleased,false,host);
  for(const overrides of [
    {enabled:false,datedTrainingProductionReleased:true},
    {qaOnly:true,datedTrainingProductionReleased:true},
    {projectRef:M26_QA_PROJECT_REF,datedTrainingProductionReleased:true},
    {url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',datedTrainingProductionReleased:true},
  ])assert.equal(onHost('app.iberfit.cl',overrides).datedTrainingProductionReleased,false);
});

test('M1 disabled production transport rejects both date and private reads before network',async()=>{
  let calls=0;
  const transport=createM26Transport(raw,{fetchImpl:async()=>{
    calls++;throw Error('PRODUCTION_NETWORK_MUST_REMAIN_CLOSED');
  }});
  await assert.rejects(transport.occurrenceCalendar('synthetic_jwt',CALENDAR),
    /M26_OCCURRENCE_PRODUCTION_NOT_RELEASED/);
  await assert.rejects(transport.occurrencePrivateRead('synthetic_jwt',{
    clientId:CALENDAR.clientId,occurrenceId:'20000000-0000-4000-8000-000000000001',
  }),/M26_OCCURRENCE_PRIVATE_READ_NOT_RELEASED/);
  await assert.rejects(transport.occurrenceCommand('synthetic_jwt',{
    type:'OCURRENCIA_CONFIRMAR',
    operationId:'30000000-0000-4000-8000-000000000001',
    clientId:CALENDAR.clientId,
    entityId:'20000000-0000-4000-8000-000000000001',baseRevision:0,
  }),/M26_OCCURRENCE_PRODUCTION_NOT_RELEASED/);
  assert.equal(calls,0);
});

test('M1 paused-admission and production workout copy is localized EN/FR/PT',()=>{
  for(const label of [
    'Temporalmente no se admiten nuevos inicios. Puedes recuperar, guardar y finalizar un entrenamiento que ya esté en curso.',
    'Los nuevos inicios están temporalmente pausados. Puedes seguir guardando y recuperar sesiones ya iniciadas.',
    'Training360 · Entrenamiento',
  ])for(const language of ['en','fr','pt']){
    const value=iberfitSurfaceTranslate(label,{language});
    assert.notEqual(value,label,language+': '+label);
    assert.ok(value.length>=8);
  }
});

test('M1 production runtime generator defaults closed and demands explicit SHA/operator authorization',()=>{
  const generator=readFileSync(new URL('../scripts/generate_final_production_runtime_config.mjs',import.meta.url),'utf8');
  const promotion=readFileSync(new URL('../.github/workflows/production-promote.yml',import.meta.url),'utf8');
  assert.match(generator,/M26_U60_PROD_MODE\|\|'closed'/u);
  assert.match(generator,/FINAL_PROD_U60_MODE_INVALID/u);
  assert.match(generator,/M26_U60_CERTIFIED_SOURCE_SHA!==sourceSha/u);
  assert.match(generator,/M26_U60_OPERATOR_APPROVAL!=='approved'/u);
  assert.match(generator,/datedTrainingProductionReleased:datedTrainingMode!=='closed'/u);
  assert.match(generator,/datedTrainingProductionStartsEnabled:datedTrainingMode==='active'/u);
  assert.doesNotMatch(promotion,/M26_U60_PROD_MODE:\s*(?:active|recovery)/u);
});

test('M1 production UI refuses a project mismatch before owner/network initialization',()=>{
  assert.throws(()=>createDatedOccurrenceQaUi({enabled:true,
    projectRef:M26_PRODUCTION_PROJECT_REF}),/U60_UI_QA_PROJECT_REQUIRED/);
  assert.throws(()=>createDatedOccurrenceQaUi({enabled:true,
    projectRef:M26_QA_PROJECT_REF,productionReleased:true}),
    /U60_UI_PRODUCTION_PROJECT_MISMATCH/);
  assert.equal(createDatedOccurrenceQaUi({enabled:false,
    projectRef:M26_PRODUCTION_PROJECT_REF,productionReleased:true}).enabled,false);
});

test('M1 rollout never authorizes execution through frontend configuration alone',()=>{
  const app=readApplication();
  assert.match(app,/runtime\.qaOnly===true&&runtime\.canary===true/u);
  assert.match(app,/const datedProd=runtime\.datedTrainingProductionReleased===true/u);
  assert.match(app,/enabled:true,productionReleased:datedProd/u);
  assert.match(app,/newStartsEnabled:datedQa\|\|runtime\.datedTrainingProductionStartsEnabled===true/u);
  const ui=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
  assert.match(ui,/\['u60-preview','u60-publish','u60-confirm','u60-start'\]/u);
  assert.match(ui,/newStartsEnabled!==true/u);
  assert.match(ui,/if\(receipt\.hasUncertain\|\|receipt\.unsavedWork\)/u);
  assert.match(ui,/await runtime\.workout\.complete\(\)/u);
  assert.match(app,/if\(datedQa\|\|datedProd\)/u);
  assert.match(app,/const datedPanel=\(runtime\.qaOnly===true\|\|runtime\.datedTrainingProductionReleased===true\)&&/u,
    'released U60 recovery+active modes must be visible on the real production route');
  assert.match(app,/verifySessionDateRetirement:datedUi\?\.enabled===true/u,
    'a dated training must not be removed in PROD without authoritative occurrence checks');
  assert.match(app,/\{\.\.\.routeVm,qaDatedPanel:datedPanel\}/u,
    'Client U60 must be inserted into its existing session scroller, not after mobile dock');
  assert.match(app,/M26_OCCURRENCE_EXECUTOR_REQUIRED/u);
});
function readApplication(){
  return readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
}
