import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {normalizeWearableDailyRecord,deduplicateWearableDailyRecords,summarizeWearableData} from '../src/m26/wearables/normalization.js';
import {buildWearableViewModel} from '../src/m26/wearables/view-model.js';
import {renderClientDeviceHub} from '../src/m26/wearables/device-hub.js';

function record(date,extra={}){
  return {clientId:'c39-client',provider:'health_connect',date,
    metrics:{steps:3500,sleepMinutes:425,restingHeartRate:55},
    sourceUpdatedAt:'2026-10-28T00:00:00Z',quality:'media',...extra};
}

test('C39: malformed calendar dates never enter wearable history or seven-day averages',()=>{
  for(const date of ['2026-02-30','2026-04-31','2025-02-29','2026-00-02']){
    assert.equal(normalizeWearableDailyRecord(record(date)).ok,false,date);
  }
  assert.equal(normalizeWearableDailyRecord(record('2024-02-29')).ok,true);
  const rows=deduplicateWearableDailyRecords([record('2026-02-30'),record('2026-10-27')]);
  assert.deepEqual(rows.map(x=>x.date),['2026-10-27']);
});

test('C39: pre-shaped but malformed records are revalidated instead of trusted and crashing sort',()=>{
  const rows=deduplicateWearableDailyRecords([
    record('2026-10-27',{provider:undefined}),
    record('2026-10-27',{clientId:null}),
    record('2026-10-27',{metrics:{steps:99999999}}),
    record('2026-10-27'),
  ]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].provider,'health_connect');
  assert.equal(rows[0].clientId,'c39-client');
  assert.equal(rows[0].metrics.steps,3500);
});

test('C39: seven-day window uses signed-in device civil date in Santiago at UTC midnight boundary',()=>{
  // The old UTC window counted 2026-10-28 and missed 2026-10-21
  // while the phone's local date was still the 27th.
  const script="import {summarizeWearableData} from './src/m26/wearables/normalization.js';"+
    "const r=(date)=>({clientId:'c39-client',provider:'health_connect',date,metrics:{steps:1000},sourceUpdatedAt:'2026-10-27T12:00:00Z'});"+
    "console.log(JSON.stringify(summarizeWearableData([r('2026-10-21'),r('2026-10-27'),r('2026-10-28')],{now:new Date('2026-10-28T00:30:00Z'),days:7})));";
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:process.cwd(),env:{...process.env,TZ:'America/Santiago'},
    encoding:'utf8',timeout:20000,
  });
  assert.equal(result.status,0,result.stderr);
  const summary=JSON.parse(result.stdout.trim());
  assert.equal(summary.startDate,'2026-10-21');
  assert.equal(summary.endDate,'2026-10-27');
  assert.equal(summary.daysWithData,2);
  assert.deepEqual(summary.records.map(x=>x.date),['2026-10-21','2026-10-27']);
});

test('C39: unknown or null connections remain visible but cannot masquerade as a certified wearable',()=>{
  const known={id:'known',provider:'normalized_file',status:'active',metadata:{mode:'confirmed_import'},
    scopes:['steps'],lastSyncedAt:'2026-10-27T10:00:00Z'};
  const unknown={id:'unknown',provider:'future_health_source',status:'connected',
    metadata:{mode:'certified_native'},scopes:['steps'],lastSyncedAt:'2026-10-27T12:00:00Z'};
  const vm=buildWearableViewModel({role:'client',connections:[known,unknown,null],records:[],
    now:new Date('2026-10-28T09:00:00Z')});
  assert.equal(vm.connections.length,3);
  assert.equal(vm.connections[0].provider,'normalized_file');
  assert.equal(vm.connections[0].status,'conectado');
  for(const item of vm.connections.slice(1)){
    assert.equal(item.provider,null);
    assert.equal(item.state,'unavailable');
    assert.equal(item.status,'pendiente');
    assert.deepEqual(item.scopes,[]);
    assert.equal(item.policy,null);
    assert.equal(item.health.actionRequired,true);
  }
  const html=renderClientDeviceHub(vm);
  assert.match(html,/Datos incorporados · sin enlace automático/u);
  assert.doesNotMatch(html,/fuente vinculada/u);
  assert.deepEqual(unknown.scopes,['steps'],'no mutation of stored data');
});

test('C39: correct daily summaries remain present with valid owner and source',()=>{
  const summary=summarizeWearableData([record('2026-10-27')],{
    now:new Date('2026-10-28T09:00:00Z'),days:7,
  });
  assert.equal(summary.daysWithData,1);
  assert.equal(summary.metrics.steps,3500);
  assert.equal(summary.metrics.sleepMinutes,425);
  assert.equal(summary.metrics.restingHeartRate,55);
});
