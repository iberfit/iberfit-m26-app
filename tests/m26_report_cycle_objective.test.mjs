import test from 'node:test';import assert from 'node:assert/strict';
import {buildReportCycleObjective,cycleObjectiveEvidence} from '../src/m26/workflows/report-cycle-objective.js';
const now=new Date('2026-11-25T15:00:00Z'),period={start:'2026-11-19',end:'2026-11-25',now};
const cycle={id:'cycle',clientId:'c1',status:'published',syncStatus:'clean',revision:1,publishedAt:'2026-11-01T15:00:00Z',startDate:'2026-11-01',endDate:'2026-12-01',goal:'Mejorar la fuerza',weeklyFrequency:2,name:'Fuerza'};
const state=(cycles=[cycle],extra={})=>({collections:{trainingCycles:cycles},...extra});
test('published current goal is an intention with explicit dates and agreed frequency',()=>{
 const g=buildReportCycleObjective(state(),'c1',period);assert.equal(g.goal,'Mejorar la fuerza');assert.equal(g.weeklyFrequency,2);
 const e=cycleObjectiveEvidence(g);assert.equal(e.source,'trainingCycles');assert.match(e.text,/logro no evaluado/);assert.ok(e.text.length<=500);
});
test('unpublished, stale, pending, contradictory or other-owner objectives fail closed',()=>{
 for(const c of [{...cycle,status:'draft'},{...cycle,publishedAt:null},{...cycle,publishedAt:'2026-12-01T00:00:00Z'},{...cycle,syncStatus:'pending'},{...cycle,clientId:'c2'},{...cycle,body:{clientId:'c2'}},{...cycle,body:{status:'draft'}},{...cycle,endDate:'2026-11-01'}])assert.equal(buildReportCycleObjective(state([c]),'c1',period),null);
 assert.equal(buildReportCycleObjective(state([cycle,{...cycle,revision:2,status:'draft'}]),'c1',period),null);
 assert.equal(buildReportCycleObjective(state([cycle],{pendingOperations:[{command:{entityId:'cycle'}}]}),'c1',period),null);
 for(const c of [{...cycle,client_id:'c2'},{...cycle,body:{cliente_id:'c2'}},{...cycle,server_confirmed:false},{...cycle,serverConfirmed:true,body:{server_confirmed:false}}])assert.equal(buildReportCycleObjective(state([c]),'c1',period),null);
 assert.equal(buildReportCycleObjective(state(),'c1',{...period,end:'2026-11-24'}),null);
});
