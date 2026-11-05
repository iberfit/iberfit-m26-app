import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildClientDayContext,renderClientDayContext} from '../src/m26/experience/client-day-context.js';
const C='user-one';
const now=new Date('2026-11-04T20:00:00Z');
const record=(date,metrics,provider='health_connect',clientId=C)=>({date,metrics,provider,clientId});
const progress={clientId:C,completedSessions:5,lastExecutionAt:'2026-11-02T15:00:00Z',volumeDelta:5.6,
 latestCheckinAt:'2026-11-04T11:00:00Z',latestCheckin:{energy:7,sleep:5,stress:2,pain:0,fatigue:1,motivation:9}};
const wearables={dailyRecords:[record('2026-11-04',{steps:8320,sleepMinutes:445,activeMinutes:54,workoutMinutes:36})]};
const build=(more={})=>buildClientDayContext({clientId:C,progress,wearables,now,...more});
test('U63 daily context joins already-authorized wellbeing, movement, and training without inference',()=>{
 const vm=build();
 assert.equal(vm.asOf,'2026-11-04');
 assert.equal(vm.wellbeing.status,'today');
 assert.equal(vm.wellbeing.metrics.energy,7);
 assert.equal(vm.movement.status,'today');
 assert.equal(vm.movement.metrics.steps,8320);
 assert.equal(vm.training.completed28,5);
 const html=renderClientDayContext(vm);
 assert.match(html,/Tu día, con perspectiva/u);
 assert.match(html,/8\.320/u);
 assert.match(html,/Energía<\/dt><dd>7 \/ 10/u);
 assert.match(html,/data-m26-area="actividad"/u);
 assert.match(html,/data-m26-area="progreso"/u);
 assert.doesNotMatch(html,/diagnóstico clínico|recuperación óptima|debes reducir la carga/iu);
});
test('U63 yesterday is previous day, never marketed as current',()=>{
 const vm=build({wearables:{dailyRecords:[record('2026-11-03',{steps:5400})]}});
 assert.equal(vm.movement.status,'recent');
 assert.match(renderClientDayContext(vm),/Último día con datos: 03\/11\/2026/u);
 assert.doesNotMatch(renderClientDayContext(vm),/Mediciones del día de hoy/u);
});
test('U63 contradictory same-day sources never sum or arbitrarily select measurements',()=>{
 const vm=build({wearables:{dailyRecords:[
  record('2026-11-04',{steps:5100,sleepMinutes:440}),
  record('2026-11-04',{steps:7800,activeMinutes:43},'apple_health')]}});
 assert.equal(vm.movement.metrics.steps,null);
 assert.equal(vm.movement.metrics.sleepMinutes,440);
 assert.equal(vm.movement.metrics.activeMinutes,43);
 assert.equal(vm.movement.ambiguous,true);
 assert.doesNotMatch(renderClientDayContext(vm),/5\.100|7\.800/u);
});
test('U63 identical measurements across two providers are never double-counted',()=>{
 const vm=build({wearables:{dailyRecords:[record('2026-11-04',{steps:8000}),
  record('2026-11-04',{steps:8000},'apple_health')]}});
 assert.equal(vm.movement.metrics.steps,8000);
 assert.equal(vm.movement.ambiguous,false);
});
test('U63 invalid values are missing and observed zero remains valid',()=>{
 const vm=build({wearables:{dailyRecords:[record('2026-11-04',{
  steps:0,activeMinutes:2000,sleepMinutes:-2})]},
 progress:{...progress,latestCheckin:{energy:0,sleep:13,stress:'9',pain:-1}}});
 assert.equal(vm.movement.metrics.steps,0);
 assert.equal(vm.movement.metrics.activeMinutes,null);
 assert.equal(vm.wellbeing.metrics.energy,0);
 assert.equal(vm.wellbeing.metrics.stress,null);
 assert.match(renderClientDayContext(vm),/Pasos<\/dt><dd>0<\/dd>/u);
});
test('U63 future checkin and daily observation cannot masquerade as today',()=>{
 const vm=build({wearables:{dailyRecords:[record('2026-11-05',{steps:9000})]},
 progress:{...progress,latestCheckinAt:'2026-11-05T21:00:00Z'}});
 assert.equal(vm.movement.status,'missing');
 assert.equal(vm.wellbeing.status,'missing');
 assert.doesNotMatch(renderClientDayContext(vm),/9\.000|7 \/ 10/u);
});
test('U63 old data stay historical, not a current measurement',()=>{
 const vm=build({wearables:{dailyRecords:[],historicalRecords:[record('2026-10-12',{steps:9000})]},
   progress:{...progress,latestCheckinAt:'2026-10-20T20:00:00Z'}});
 assert.equal(vm.movement.status,'missing');
 assert.equal(vm.movement.date,'2026-10-12');
 assert.equal(vm.wellbeing.status,'missing');
 assert.match(renderClientDayContext(vm),/Datos históricos del 12\/10\/2026/u);
 assert.doesNotMatch(renderClientDayContext(vm),/9\.000|7 \/ 10/u);
});
test('U63 double client fence never shows foreign source or progress',()=>{
 const vm=build({progress:{...progress,clientId:'other'},
 wearables:{dailyRecords:[record('2026-11-04',{steps:11000},'health_connect','other')],
 historicalRecords:[record('2026-10-12',{steps:8000},'health_connect','other')]}});
 assert.equal(vm.training.completed28,null);
 assert.equal(vm.wellbeing.status,'missing');
 assert.equal(vm.movement.status,'missing');
 assert.equal(vm.movement.date,null);
 assert.doesNotMatch(renderClientDayContext(vm),/11\.000|8\.000/u);
});
test('U63 Santiago local midnight and DST are independent of UTC day',()=>{
 const vm=build({now:new Date('2026-11-05T01:00:00Z')});
 assert.equal(vm.asOf,'2026-11-04');
 assert.equal(vm.movement.status,'today');
});
test('U63 absence does not become a medical judgment or fake zeros',()=>{
 const vm=build({progress:null,wearables:null});
 assert.equal(vm.wellbeing.status,'missing');
 assert.equal(vm.movement.status,'missing');
 assert.equal(vm.training.completed28,null);
 const html=renderClientDayContext(vm);
 assert.match(html,/Sin registro de bienestar/u);
 assert.match(html,/seguir entrenando sin conectar un reloj/u);
 assert.doesNotMatch(html,/0 sesiones|0 pasos|recuperación perfecta/iu);
 assert.equal(renderClientDayContext(null),'');
});
test('U63 invalid identity and clock fail closed',()=>{
 assert.throws(()=>buildClientDayContext({clientId:'',now}),/CLIENT_REQUIRED/u);
 assert.throws(()=>build({now:new Date('x')}),/DATE_REQUIRED/u);
});
test('U63 authenticated Client only, scoped records, no new fetches or altered session CTA',()=>{
 const vm=readFileSync(new URL('../src/m26/modules/route-view-model.js',import.meta.url),'utf8');
 const home=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
 assert.match(vm,/buildClientDayContext/u);
 assert.match(vm,/recordsForClient\(state,'wearableDailySummaries',clientId\)/u);
 assert.match(home,/renderClientDayContext\(vm\.clientDayContext\)/u);
 assert.match(home,/data-workflow-action="start-published-session"/u);
 assert.doesNotMatch(readFileSync(new URL('../src/m26/experience/client-day-context.js',import.meta.url),'utf8'),
  /fetch\(|setInterval\(|rpc\(|localStorage/u);
});

test('U63 same-day observations with no valid comparable metrics are not called historical',()=>{
 const vm=build({wearables:{dailyRecords:[
  record('2026-11-04',{steps:5500}),
  record('2026-11-04',{steps:8500},'apple_health')]}});
 assert.equal(vm.movement.status,'missing');
 assert.equal(vm.movement.ambiguous,true);
 assert.match(renderClientDayContext(vm),/Datos del 04\/11\/2026 sin valores comparables/u);
 assert.doesNotMatch(renderClientDayContext(vm),/no son de hoy/u);
});
test('U63 a same-day checkin without valid values does not imply a prior dated checkin',()=>{
 const vm=build({progress:{...progress,latestCheckin:{energy:'?',stress:99}}});
 assert.equal(vm.wellbeing.status,'missing');
 assert.match(renderClientDayContext(vm),/Registro del 04\/11\/2026 sin valores comparables/u);
});
