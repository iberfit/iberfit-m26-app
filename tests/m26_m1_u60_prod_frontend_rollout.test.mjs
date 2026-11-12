import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
  assert.match(app,/if\(datedQa\|\|datedProd\)/u);
  assert.match(app,/M26_OCCURRENCE_EXECUTOR_REQUIRED/u);
});
function readApplication(){
  return readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
}
