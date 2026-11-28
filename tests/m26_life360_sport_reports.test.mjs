import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPostSessionSportEvidence,summarizePeriodSportEvidence,periodSportEvidence,buildPeriodSportProjection} from '../src/m26/workflows/report-sport-evidence.js';
test('sport report fails closed with no workout evidence',()=>{assert.deepEqual(buildPostSessionSportEvidence(null,{}),[]);});
test('El informe posterior no publica distancia contradictoria ni recurre a un resumen antiguo',()=>{
 const base={clientId:'c1',sessionId:'run',sport:'running',distanceKm:99,durationSeconds:999,planSnapshot:{sessionId:'run',blocks:[{type:'exercise',exerciseId:'run',name:'Carrera suave'}]}};
 const post=results=>buildPostSessionSportEvidence({...base,results},{clientId:'c1'});
 const a=post([{exerciseId:'run',setNumber:1,distanceKm:5,distanceM:4000,seconds:1500}]);
 assert.equal(a.length,1);assert.equal(a[0].label,'Duración registrada');
 assert.deepEqual(post([{exerciseId:'run',setNumber:1,distanceKm:5,distanceM:4000}]),[]);
 assert.deepEqual(post([{exerciseId:'run',setNumber:1,distanceKm:5},{exerciseId:'run',setNumber:1,distanceKm:6}]),[]);
 const lateDuplicate=post([{exerciseId:'run',setNumber:1,distanceKm:99},...Array.from({length:16},(_,i)=>({exerciseId:'run',setNumber:i+2,distanceKm:1})),{exerciseId:'run',setNumber:1,distanceKm:99}]);assert.ok(lateDuplicate.every(r=>!r.text.includes('99 km')));
 assert.deepEqual(post([{exerciseId:'run',exercise_id:'other',setNumber:1,distanceKm:5}]),[]);
 assert.deepEqual(buildPostSessionSportEvidence({...base,body:{clientId:'c2'}},{clientId:'c1'}),[]);
 assert.equal(buildPostSessionSportEvidence({clientId:'c1',sport:'running',distanceKm:5,distanceM:3000,durationSeconds:1500},{clientId:'c1'}).length,1);
 assert.equal(post([{exerciseId:'run',setNumber:1,distanceKm:5,distanceM:5000,seconds:1500}]).length,3);
});
test('running pace uses only measured duration and distance',()=>{
  const execution={clientId:'c1',sport:'running',distanceKm:6.5,durationSeconds:2145};
  const rows=buildPostSessionSportEvidence(execution,{clientId:'c1'});
  assert.equal(rows.length,3);
  assert.equal(rows[2].text,'5:30 min/km');
});
test('swimming report labels a globally measured pace',()=>{
  const row={clientId:'c1',sport:'swimming',distanceMeters:1000,durationSeconds:1800};
  const data=buildPostSessionSportEvidence(row,{clientId:'c1'});
  assert.equal(data[0].text,'1000 m');
  assert.match(data[2].text,/3:00 min/);
});

import {createExecution,startExecution,recordSet,advanceExecution,finishExecution} from '../src/m26/workflows/session-execution.js';
function completeRealSession(sport,observed){
  const names={running:'Carrera suave',swimming:'Natación libre',strength:'Sentadilla'};
  const session={id:'test-session-'+sport,clientId:'c1',
    blocks:[{id:'block-'+sport,type:'exercise',exerciseId:'exercise-'+sport,
      name:names[sport],sets:1,reps:'8',restSeconds:0,targetRpe:7,targetRir:3,
      ...(sport==='running'?{plannedDistanceKm:'15'}:{}),
      ...(sport==='swimming'?{plannedDistanceM:'2000'}:{})}]};
  const execution=createExecution({session,clientId:'c1',executionId:'test-'+sport});
  startExecution(execution);
  recordSet(execution,session,observed);
  advanceExecution(execution);
  finishExecution(execution,{sessionRpe:7,comment:'Sesión completada con datos observados',pain:false});
  return execution;
}
test('Life360 actual M26 running set generates distance and pace from recorded results',()=>{
  const execution=completeRealSession('running',{distanceKm:6.5,durationMinutes:35.8,rpe:7,paceMinPerKm:'05:30'});
  const rows=buildPostSessionSportEvidence(execution,{clientId:'c1'});
  assert.ok(rows.some(row=>row.label==='Distancia realizada'&&row.text==='6.5 km'));
  assert.ok(rows.some(row=>row.label==='Ritmo observado'&&row.text.endsWith('min/km')));
  assert.equal(rows.some(row=>row.text.includes('15 km')),false);
  assert.deepEqual(buildPostSessionSportEvidence(execution,{clientId:'not-c1'}),[]);
});
test('Life360 actual M26 swimming set is measured as metres and per-100m',()=>{
  const execution=completeRealSession('swimming',{distanceM:1000,durationMinutes:30,rpe:7,pacePer100M:'03:00'});
  const rows=buildPostSessionSportEvidence(execution,{clientId:'c1'});
  assert.ok(rows.some(row=>row.label==='Distancia acuática realizada'&&row.text==='1000 m'));
  assert.ok(rows.some(row=>row.label==='Tiempo observado por 100 m'&&row.text.includes('3:00')));
  assert.equal(rows.some(row=>row.text.includes('2000')),false);
});
test('Life360 actual M26 strength set uses observed load string without multiplication',()=>{
  const execution=completeRealSession('strength',{reps:8,load:'10 kg',rpe:7});
  const rows=buildPostSessionSportEvidence(execution,{clientId:'c1'});
  assert.equal(rows.length,1);
  assert.ok(rows[0].text.includes('8 rep'));
  assert.ok(rows[0].text.includes('10 kg'));
  assert.equal(rows[0].text.includes('20 kg'),false);
});

test('period sport totals keep disciplines separate, reject contradictory units and never double-count session summaries',()=>{
 const base={clientId:'c1',status:'completed',syncStatus:'clean'};
 const setSession={...base,id:'run-sets',sessionId:'run',sport:'running',distanceKm:100,durationSeconds:1000,planSnapshot:{sessionId:'run',blocks:[{type:'exercise',exerciseId:'run',name:'Carrera suave'}]},results:[{exerciseId:'run',setNumber:1,distanceKm:5,seconds:1500},{exerciseId:'run',setNumber:2,distanceKm:2},{exerciseId:'run',setNumber:3,distanceKm:1,distanceM:500,seconds:300},{exerciseId:'run',setNumber:4,distanceKm:5,seconds:1500,completed:false},{exerciseId:'run',setNumber:5,distanceKm:3},{exerciseId:'run',setNumber:5,distanceKm:3}]};
 const records=[setSession,setSession,{...base,id:'run-legacy',sport:'running',distanceKm:3,durationSeconds:900},{...base,id:'swim',sport:'swimming',distanceM:1000,durationSeconds:1800},{...base,id:'bad',sport:'running',distanceKm:10,distanceM:5},{...base,id:'foreign',clientId:'c2',sport:'running',distanceKm:30},{...base,id:'pending',syncStatus:'pending',sport:'running',distanceKm:10}];
 const [run,swim]=summarizePeriodSportEvidence(records,{clientId:'c1'});
 assert.deepEqual(run,{sport:'running',sessions:2,rows:3,metres:10000,pairedRows:2,pairedMetres:8000,pairedSeconds:2400});
 assert.equal(swim.metres,1000);assert.equal(swim.pairedSeconds,1800);
 const rows=periodSportEvidence(records,{clientId:'c1'});assert.match(rows[0].text,/10 km/);assert.match(rows[0].text,/5:00 min\/km/);assert.match(rows[1].text,/3:00 min\/100 m/);
});

test('Elite endurance uses actual matched distance and original explicit prescription, not inferred performance',()=>{
 const fixture=(id,date,seconds,extra={},setExtra={})=>({id,clientId:'c1',sessionId:'run',status:'completed',syncStatus:'clean',completedAt:date+'T15:00:00Z',planSnapshot:{sessionId:'run',blocks:[{type:'exercise',exerciseId:'run',name:'Carrera suave',sets:1,restSeconds:0,plannedDistanceKm:'5',...extra}]},results:[{exerciseId:'run',setNumber:1,distanceKm:5,seconds,...setExtra}]});
 const good=[fixture('a','2026-11-19',1800),fixture('b','2026-11-21',1750),fixture('c','2026-11-24',1700)];
 const noise=[fixture('distance','2026-11-22',1200,{}, {distanceKm:3}),fixture('changed','2026-11-23',900,{plannedDistanceKm:'6'}),fixture('missing-rest','2026-11-20',900,{restSeconds:null}),fixture('duplicate','2026-11-25',900,{}, {setNumber:2}),fixture('conflict','2026-11-25',900,{}, {distanceM:100}),{...fixture('other','2026-11-25',700),clientId:'c2'},{...fixture('pending','2026-11-25',600),syncStatus:'pending'}];
 const projection=buildPeriodSportProjection([...good,...noise],{clientId:'c1'});
 assert.equal(projection.comparisons.length,1);
 const c=projection.comparisons[0];assert.equal(c.days,3);assert.equal(c.observations,3);assert.equal(c.metres,5000);assert.deepEqual(c.points.map(p=>p.seconds),[1800,1750,1700]);
 assert.equal(buildPeriodSportProjection(good.slice(0,2),{clientId:'c1'}).comparisons.length,0);
 const text=periodSportEvidence(good,{clientId:'c1'})[0].text;assert.match(text,/Misma distancia/);assert.match(text,/No verifica condiciones reales/);assert.ok(text.length<=500);
});

test('repeated exercises use exact block coordinates in post-session and period evidence',()=>{
  const blocks=[{id:'warm',type:'exercise',exerciseId:'run',name:'Carrera suave',sets:1},{id:'main',type:'exercise',exerciseId:'run',name:'Carrera principal',sets:1}];
  const warm={exerciseId:'run',setNumber:1,distanceKm:1,seconds:300},main={...warm,distanceKm:3,seconds:900};
  const base={id:'repeat',clientId:'c1',sessionId:'run',status:'completed',syncStatus:'clean',planSnapshot:{sessionId:'run',blocks}};
  const record={...base,results:{'warm:run:1':warm,'main:run:1':main}};
  const post=buildPostSessionSportEvidence(record,{clientId:'c1'});
  assert.ok(post.some(x=>x.label.includes('Bloque 1')&&x.text==='1 km'));
  assert.ok(post.some(x=>x.label.includes('Bloque 2')&&x.text==='3 km'));
  assert.equal(buildPeriodSportProjection([record],{clientId:'c1'}).summary[0].metres,4000);
  const ambiguous={...base,results:[warm,main]};
  assert.deepEqual(buildPostSessionSportEvidence(ambiguous,{clientId:'c1'}),[]);
  assert.deepEqual(buildPeriodSportProjection([ambiguous],{clientId:'c1'}).summary,[]);
  const conflict={...record,body:{results:[warm]}};
  assert.deepEqual(buildPostSessionSportEvidence(conflict,{clientId:'c1'}),[]);
  assert.deepEqual(buildPeriodSportProjection([conflict],{clientId:'c1'}).summary,[]);
  const aliases={...base,set_results:record.results};
  assert.deepEqual(buildPostSessionSportEvidence(aliases,{clientId:'c1'}),post);
  assert.equal(buildPeriodSportProjection([aliases],{clientId:'c1'}).summary[0].metres,4000);
});
