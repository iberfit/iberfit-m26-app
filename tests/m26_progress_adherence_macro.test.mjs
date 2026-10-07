import test from 'node:test';
import assert from 'node:assert/strict';
import {computeProgressSummary} from '../src/m26/engagement/progress-engine.js';

const clientId='client-macro-adherence';
const now=new Date('2026-10-07T12:00:00Z');
const appointment=(id,status,client=clientId)=>({id,clientId:client,startAt:'2026-10-02T10:00:00Z',status});
const state=(appointments=[])=>({collections:{
  appointments,sessions:[],sessionExecutions:[],iriAssessments:[],checkins:[],
  wearableDailySummaries:[],m26Entities:[],
}});
const progress=(appointments)=>computeProgressSummary(state(appointments),clientId,{now,days:28});

test('proposals, pending items, unknown statuses and cancelled events are not recorded as confirmed commitments',()=>{
 const summary=progress([
   appointment('p','propuesta'),appointment('pending','pendiente'),
   appointment('draft','borrador'),appointment('unknown','not-a-status'),
   appointment('cancel-es','cancelada'),appointment('cancel-en','cancelled'),
 ]);
 assert.equal(summary.plannedSessions,0);
 assert.equal(summary.completedSessions,0);
 assert.equal(summary.adherence,null);
});

test('canonical confirmed/scheduled appointment aliases remain planned',()=>{
 const summary=progress([
   appointment('confirmed','confirmada'),appointment('confirmed-en','confirmed'),
   appointment('scheduled','scheduled'),appointment('confirmed-old','confirmado'),
 ]);
 assert.equal(summary.plannedSessions,4);
 assert.equal(summary.completedSessions,0);
 assert.equal(summary.adherence,0);
});

test('realizada and legacy completed count as performed without requiring a redundant execution',()=>{
 const summary=progress([
   appointment('done-es','realizada'),appointment('done-en','completed'),
   appointment('done-legacy','completado'),
 ]);
 assert.equal(summary.plannedSessions,3);
 assert.equal(summary.completedSessions,3);
 assert.equal(summary.adherence,1);
});

test('recorded no-shows count as planned but not fulfilled',()=>{
 const summary=progress([
   appointment('absent-person','ausencia_cliente'),
   appointment('absent-coach','ausencia_coach'),
   appointment('real','realizada'),
 ]);
 assert.equal(summary.plannedSessions,3);
 assert.equal(summary.completedSessions,1);
 assert.equal(summary.adherence,0.333);
});

test('confirmed activities of a different person never enter this client adherence',()=>{
 const summary=progress([
   appointment('foreign-completed','realizada','different-client'),
   appointment('own','confirmada'),
 ]);
 assert.equal(summary.plannedSessions,1);
 assert.equal(summary.completedSessions,0);
 assert.equal(summary.adherence,0);
});

test('legacy planned commitments preserve historical adherence, whereas proposals remain excluded',()=>{
 const summary=progress([
  appointment('done','completed'), appointment('legacy','planned'), appointment('proposal','propuesta')
 ]);
 assert.equal(summary.plannedSessions,2);
 assert.equal(summary.completedSessions,1);
 assert.equal(summary.adherence,0.5);
});

test('no appointments or executions have missing adherence, not invented zero',()=>{
 const summary=progress();
 assert.equal(summary.plannedSessions,0);
 assert.equal(summary.adherence,null);
 assert.equal(summary.averageRpe,null);
});