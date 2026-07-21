import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {
  normalizeWearableProvider,detectWearableBridge,normalizeWearableDailyRecord,
  deduplicateWearableDailyRecords,summarizeWearableData,parseWearableExportText,
  buildWearableViewModel,createWearableBridgeService
} from '../src/m26/wearables/index.js';
import {stateFromBootstrap,createProductionState} from '../src/m26/production-state.js';
import {renderActivityRoute,renderProgressRoute} from '../src/m26/modules/route-render.js';
import {computeProgressSummary} from '../src/m26/engagement/progress-engine.js';

const clientId='client-qa-20';
const day=(date,values={})=>({clientId,provider:'apple_health',date,steps:8000,activeMinutes:45,sleepMinutes:450,restingHeartRate:58,hrvMs:48,activeEnergyKcal:520,workoutMinutes:35,quality:'alta',...values});

test('RC20 normaliza proveedores sin inventar acceso directo desde la PWA',()=>{
  assert.equal(normalizeWearableProvider('HealthKit'),'apple_health');
  assert.equal(normalizeWearableProvider('Health Connect'),'health_connect');
  assert.equal(normalizeWearableProvider('Garmin'),'garmin_connect');
  assert.equal(normalizeWearableProvider('desconocido'),null);
  const support=detectWearableBridge({});
  assert.equal(support.appleHealth.available,false);assert.equal(support.healthConnect.available,false);assert.equal(support.normalizedFile.available,true);
});

test('RC20 normaliza un resumen diario y conserva ausencia como null',()=>{
  const result=normalizeWearableDailyRecord(day('2026-07-20',{hrvMs:''}));
  assert.equal(result.ok,true);assert.equal(result.value.metrics.steps,8000);assert.equal(result.value.metrics.hrvMs,null);
  assert.equal(result.value.clientId,clientId);assert.equal(result.value.provider,'apple_health');
});

test('RC20 rechaza registros sin fecha, métricas o cliente y no recorta valores imposibles',()=>{
  const missing=normalizeWearableDailyRecord({provider:'apple_health',date:'',steps:null});
  assert.equal(missing.ok,false);assert.deepEqual([...missing.issues].sort(),['clientId','date','metrics']);
  const extreme=normalizeWearableDailyRecord(day('2026-07-20',{steps:999999,sleepMinutes:1600,restingHeartRate:300}));
  assert.equal(extreme.ok,true);assert.equal(extreme.value.metrics.steps,null);assert.equal(extreme.value.metrics.sleepMinutes,null);assert.equal(extreme.value.metrics.restingHeartRate,null);
});

test('RC20 deduplica por cliente, proveedor y fecha usando la revisión de fuente más reciente',()=>{
  const old=normalizeWearableDailyRecord(day('2026-07-20',{steps:6000,sourceUpdatedAt:'2026-07-20T12:00:00Z'})).value;
  const recent=normalizeWearableDailyRecord(day('2026-07-20',{steps:9000,sourceUpdatedAt:'2026-07-20T18:00:00Z'})).value;
  const rows=deduplicateWearableDailyRecords([recent,old]);assert.equal(rows.length,1);assert.equal(rows[0].metrics.steps,9000);
});

test('RC20 resume siete días, procedencia, calidad y frescura sin interpretación clínica',()=>{
  const rows=['2026-07-18','2026-07-19','2026-07-20'].map((date,index)=>day(date,{steps:7000+index*1000}));
  const summary=summarizeWearableData(rows,{now:'2026-07-20T18:00:00Z',days:7});
  assert.equal(summary.daysWithData,3);assert.equal(summary.metrics.steps,8000);assert.equal(summary.freshness,'reciente');assert.equal(summary.quality,'media');assert.deepEqual(summary.providers,['apple_health']);
});

test('RC20 importa JSON normalizado, omite filas inválidas y no sube nada',()=>{
  const parsed=parseWearableExportText(JSON.stringify({records:[day('2026-07-20'),{date:'',steps:10}]}),{fileName:'salud.json',clientId,provider:'apple_health'});
  assert.equal(parsed.accepted.length,1);assert.equal(parsed.rejected.length,1);assert.equal(parsed.totalRows,2);
});

test('RC20 importa CSV con alias humanos y comas decimales entrecomilladas',()=>{
  const csv='date,pasos,minutos_activos,fc_reposo,hrv_ms\n2026-07-20,9200,54,57,"45,5"\n';
  const parsed=parseWearableExportText(csv,{fileName:'salud.csv',clientId,provider:'health_connect'});
  assert.equal(parsed.accepted.length,1);assert.equal(parsed.accepted[0].metrics.steps,9200);assert.equal(parsed.accepted[0].metrics.hrvMs,45.5);
});

test('RC20 bloquea archivos por encima del límite antes de parsearlos',()=>{
  assert.throws(()=>parseWearableExportText('x'.repeat(5_000_001),{fileName:'x.json',clientId}),/FILE_TOO_LARGE/);
});

test('RC20 incorpora colecciones wearable al bootstrap y las aísla para el cliente propio',()=>{
  const snapshot={environment:'CANARY',serverTime:'2026-07-20T12:00:00Z',user:{id:'user-qa-20',role:'client',clientId},canary:{active:true,version:'26.0.0-rc20'},remoteRevisions:{},data:{clients:[{id:clientId,name:'Cliente QA',modality:'hibrido'},{id:'other-client',name:'Otro',modality:'online'}],wearableConnections:[{id:'w1',clientId,provider:'apple_health'},{id:'w2',clientId:'other-client',provider:'health_connect'}],wearableDailySummaries:[day('2026-07-20'),day('2026-07-20',{clientId:'other-client'})],wearableSyncRuns:[]}};
  const state=stateFromBootstrap(snapshot,createProductionState());
  assert.equal(state.collections.wearableConnections.length,1);assert.equal(state.collections.wearableDailySummaries.length,1);assert.equal(state.collections.wearableDailySummaries[0].clientId,clientId);
});

test('RC20 ofrece control e importación local al cliente y vista de solo lectura al Coach',()=>{
  const base={records:[day('2026-07-20')],connections:[],now:'2026-07-20T18:00:00Z',scope:{}};
  const capability={ready:false};
  const clientVm={kind:'actividad',clientId,role:'client',canManageHabits:false,capabilities:{checkins:capability,habits:capability},checkins:[],habits:[],habitLogs:[],wearables:buildWearableViewModel({...base,role:'client'})};
  const clientHtml=renderActivityRoute(clientVm);assert.match(clientHtml,/data-wearable-import/);assert.match(clientHtml,/Solo vista previa local/);assert.doesNotMatch(clientHtml,/Conectar Apple Health/);
  const coachHtml=renderActivityRoute({...clientVm,role:'coach',canManageHabits:true,wearables:buildWearableViewModel({...base,role:'coach'})});assert.doesNotMatch(coachHtml,/data-wearable-import/);assert.match(coachHtml,/El cliente decide/);
});

test('RC20 puente nativo limita scopes y rechaza mezcla de clientes',async()=>{
  const scope={IBERFIT_HEALTH_BRIDGE:{appleHealth:{
    async requestAuthorization({scopes}){return {granted:[...scopes,'bloodPressure']};},
    async readDailySummaries(){return [day('2026-07-20'),day('2026-07-20',{clientId:'other-client'})];},
    async setSyncEnabled({enabled}){return {enabled};}
  }}};
  const service=createWearableBridgeService({scope});const auth=await service.requestAuthorization({provider:'apple_health',clientId,scopes:['steps','bloodPressure']});
  assert.deepEqual(auth.requested,['steps']);assert.deepEqual(auth.granted,['steps']);
  const rows=await service.readDailySummaries({provider:'apple_health',clientId,startDate:'2026-07-14',endDate:'2026-07-20'});assert.equal(rows.length,1);assert.equal(rows[0].clientId,clientId);
  assert.equal((await service.setSyncEnabled({provider:'apple_health',clientId,enabled:false})).enabled,false);
});

test('RC20 progreso incorpora tendencia wearable sin sustituir check-in',()=>{
  const state={collections:{appointments:[],sessionExecutions:[],checkins:[],iriAssessments:[],wearableDailySummaries:[day('2026-07-20')]}};
  const summary=computeProgressSummary(state,clientId,{now:'2026-07-20T18:00:00Z',days:28});
  assert.equal(summary.wearable.metrics.steps,8000);assert.equal(summary.checkins,0);assert.equal(summary.checkinAverage.sleep,null);
  const html=renderProgressRoute({summary,signal:{label:'Sin datos',level:'info'},timeline:[],alerts:[]});assert.match(html,/Actividad de dispositivo/);assert.match(html,/no en sustitución/);
});

test('RC20 procesa diez mil resúmenes dentro de un presupuesto local amplio',()=>{
  const rows=[];for(let index=0;index<10_000;index+=1)rows.push(day(`2026-07-${String((index%20)+1).padStart(2,'0')}`,{provider:Math.floor(index/20)%2?'apple_health':'health_connect',steps:5000+(index%5000),sourceUpdatedAt:`2026-07-20T${String(index%24).padStart(2,'0')}:00:00Z`}));
  const started=performance.now();const deduped=deduplicateWearableDailyRecords(rows);const elapsed=performance.now()-started;
  assert.equal(deduped.length,40);assert.ok(elapsed<1200,`wearable normalization took ${elapsed.toFixed(1)}ms`);
});

test('RC20 migración guardada conserva RLS, rollback y prohíbe tokens en métricas',()=>{
  const sql=readFileSync(new URL('../backend/RC20_WEARABLES_MIGRATION_GUARDED.sql',import.meta.url),'utf8');
  assert.match(sql,/allow_rc20_wearables/);assert.match(sql,/enable row level security/g);assert.match(sql,/revoke all .* from anon/);assert.match(sql,/access_token/);assert.match(sql,/REMOTE_BOOTSTRAP_AND_WRITE_PATH_REQUIRED/);assert.match(sql,/rollback;\s*$/);
  assert.doesNotMatch(sql,/create policy .* for (insert|update|delete)/i);
});
