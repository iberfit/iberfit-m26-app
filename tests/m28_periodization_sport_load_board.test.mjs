import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPeriodizationSnapshot,renderPeriodizationBoard} from '../src/m26/planning/periodization-workbench.js';
const id='c1',cycle={id:'plan1',clientId:id,startDate:'2026-10-01',endDate:'2026-11-25',name:'Bloque de fuerza y carrera',weeklyFrequency:2};
function execution(id,date,extra={}){return {id,clientId:'c1',status:'completed',syncStatus:'clean',completedAt:date,results:{one:{reps:10,load:'20 kg',rpe:7}},feedback:{sessionRpe:7},...extra};}
function state(){return {collections:{appointments:[{id:'a1',clientId:id,status:'confirmada',startAt:'2026-10-02T14:00:00Z'},{id:'a2',clientId:id,status:'cancelada',startAt:'2026-10-02T14:00:00Z'}],sessionExecutions:[execution('e1','2026-10-02T14:00:00Z'),execution('e2','2026-10-10T14:00:00Z')]}};}
test('Coach sees 4-week blocks, live week and separate scheduled vs executed totals',()=>{
 const snapshot=buildPeriodizationSnapshot(state(),id,{cycle,now:new Date('2026-10-10T15:00:00Z')});
 assert.equal(snapshot.blocks.length,2);
 assert.equal(snapshot.weeks.length,8);
 assert.equal(snapshot.completed,2);
 assert.equal(snapshot.scheduled,1);
 assert.equal(snapshot.currentWeek,2);
 assert.equal(snapshot.weeks[0].strengthVolume,200);
 assert.equal(snapshot.weeks[1].rpe,7);
 const html=renderPeriodizationBoard(snapshot,{role:'coach'});
 assert.match(html,/data-m28-periodization/u);
 assert.match(html,/Bloque 1/u);
 assert.match(html,/Preparar sesión/u);
 assert.match(html,/Asignar en agenda/u);
 assert.match(html,/kg·rep/u);
});
test('Unconfirmed/pending, duplicate, wrong-client, unlabelled loads never inflate coach metrics',()=>{
 const s=state();
 s.collections.sessionExecutions.push(execution('e1','2026-10-02T14:00:00Z'),execution('e3','2026-10-03T14:00:00Z',{syncStatus:'pending'}),execution('e4','2026-10-03T14:00:00Z',{clientId:'other'}),execution('e5','2026-10-12T14:00:00Z',{results:{one:{reps:10,load:'20'}}}));
 const snap=buildPeriodizationSnapshot(s,id,{cycle});
 assert.equal(snap.completed,3);
 assert.equal(snap.weeks[1].strengthVolume,200); // e2 is verified kg; e5 is not
 assert.equal(snap.weeks[1].strengthSets,1);
 const unlabelledOnly={...s,collections:{...s.collections,sessionExecutions:s.collections.sessionExecutions.filter(x=>x.id!=='e2')}};
 const withoutVerified=buildPeriodizationSnapshot(unlabelledOnly,id,{cycle});
 assert.equal(withoutVerified.weeks[1].strengthVolume,null);
 assert.match(renderPeriodizationBoard(withoutVerified,{role:'coach'}),/Sin kg verificables/u);
 assert.doesNotMatch(renderPeriodizationBoard(snap,{role:'client'}),/Asignar en agenda/u);
});
test('IRI-only, mismatched, invalid and enormous civil-date cycles cannot fabricate a chart',()=>{
 assert.equal(buildPeriodizationSnapshot(state(),'other',{cycle}),null);
 assert.equal(buildPeriodizationSnapshot(state(),id,{cycle:{...cycle,startDate:'2026-02-31'}}),null);
 assert.equal(buildPeriodizationSnapshot(state(),id,{cycle:{...cycle,endDate:'2030-01-01'}}),null);
 assert.equal(renderPeriodizationBoard(null),'');
});
