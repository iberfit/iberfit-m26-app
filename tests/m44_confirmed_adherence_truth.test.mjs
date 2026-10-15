import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedAdherenceEvidence} from '../src/m26/engagement/confirmed-adherence.js';
import {computeProgressSummary} from '../src/m26/engagement/progress-engine.js';
import {buildProgressHub} from '../src/m26/engagement/progress-hub.js';

const clientId='m44-client-a',now=new Date('2026-10-15T12:00:00Z');
const appointment=(id,status,extra={})=>({
  id,clientId,status,startAt:'2026-10-13T10:00:00Z',revision:1,...extra,
});
const execution=(id,extra={})=>({
  id,clientId,status:'completed',syncStatus:'clean',
  completedAt:'2026-10-13T11:00:00Z',results:[],...extra,
});
const state=(appointments=[],sessionExecutions=[])=>({
  collections:{appointments,sessionExecutions,checkins:[],sessions:[],iriAssessments:[],wearableDailySummaries:[],trainingCycles:[]},
  pendingOperations:[],conflicts:[],rejectedOperations:[],
});
const progress=(appointments=[],executions=[])=>computeProgressSummary(state(appointments,executions),clientId,{now,days:28});

test('M44: an autonomous, confirmed execution is activity, never invented scheduled adherence',()=>{
  const result=progress([],[execution('e-guided')]);
  assert.equal(result.completedSessions,1);
  assert.equal(result.plannedSessions,0);
  assert.equal(result.adherence,null);
  assert.equal(result.scheduledCompletedSessions,0);
  assert.equal(result.standaloneCompletedSessions,1);
  assert.equal(result.adherenceEvidence.denominatorSource,'scheduled-appointments-only');
  const hub=buildProgressHub(state([],[execution('e-guided')]),clientId,{now});
  const continuity=hub.pillars.find(p=>p.id==='consistency');
  assert.equal(continuity.value,null,'UI cannot claim 100% adherence from an unscheduled execution');
  assert.match(continuity.evidence,/Sin planificación comparable/u);
});

test('M44: one completed in-person appointment and its confirmed execution count only once',()=>{
  const summary=progress(
    [appointment('a1','realizada')],
    [execution('e1',{appointmentId:'a1'})],
  );
  assert.equal(summary.plannedSessions,1);
  assert.equal(summary.scheduledCompletedSessions,1);
  assert.equal(summary.completedSessions,1);
  assert.equal(summary.adherence,1);
  assert.equal(summary.adherenceEvidence.linkedExecutions,1);
  assert.equal(summary.adherenceEvidence.completedAppointmentsWithoutExecution,0);
});

test('M44: in-person appointment plus independent guided execution are two activities, one scheduled commitment',()=>{
  const summary=progress(
    [appointment('a1','realizada')],
    [execution('e-guided',{sessionId:'s-guided'})],
  );
  assert.equal(summary.plannedSessions,1);
  assert.equal(summary.scheduledCompletedSessions,1);
  assert.equal(summary.completedSessions,2);
  assert.equal(summary.adherence,1);
  assert.equal(summary.standaloneCompletedSessions,1);
});

test('M44: a guided training cannot fulfil an unrelated confirmed appointment',()=>{
  const summary=progress(
    [appointment('a1','confirmada',{sessionId:'s-presencial'})],
    [execution('e-guided',{sessionId:'s-guided'})],
  );
  assert.equal(summary.plannedSessions,1);
  assert.equal(summary.scheduledCompletedSessions,0);
  assert.equal(summary.completedSessions,1);
  assert.equal(summary.adherence,0);
});

test('M44: only an explicit appointment ID can associate even when the session ID happens to match',()=>{
  const summary=progress(
    [appointment('a1','confirmada',{sessionId:'s-repeating'})],
    [execution('e-guided',{sessionId:'s-repeating'})],
  );
  assert.equal(summary.scheduledCompletedSessions,0);
  assert.equal(summary.adherence,0);
});

test('M44: matching execution confirms commitment even when appointment has not yet moved to realizada',()=>{
  const summary=progress(
    [appointment('a1','confirmada')],
    [execution('e1',{appointmentId:'a1'})],
  );
  assert.equal(summary.scheduledCompletedSessions,1);
  assert.equal(summary.adherence,1);
  assert.equal(summary.completedSessions,1);
});

test('M44: deduplicate revisions and execution receipts; cancellation supersedes older confirmed record',()=>{
  const summary=progress(
    [appointment('a1','confirmada'),appointment('a1','cancelada',{revision:2}),appointment('a2','realizada')],
    [execution('e1',{appointmentId:'a2'}),execution('e1',{appointmentId:'a2'})],
  );
  assert.equal(summary.plannedSessions,1);
  assert.equal(summary.scheduledCompletedSessions,1);
  assert.equal(summary.completedSessions,1);
});

test('M44: contradictory canonical appointment revisions cannot silently create a denominator',()=>{
  const evidence=confirmedAdherenceEvidence({
    appointments:[appointment('a1','confirmada'),appointment('a1','cancelada')],
    executions:[],
  });
  assert.equal(evidence.conflictingAppointments,1);
  assert.equal(evidence.plannedSessions,0);
  assert.equal(evidence.adherence,null);
});

test('M44: no-shows count in commitments, rejected closure and unconfirmed execution never count as completed',()=>{
  const summary=progress(
    [appointment('a1','ausencia_cliente'),appointment('a2','ausencia_coach'),appointment('a3','confirmada')],
    [execution('e-rejected',{status:'cierre_rechazado'})],
  );
  assert.equal(summary.plannedSessions,3);
  assert.equal(summary.completedSessions,0);
  assert.equal(summary.adherence,0);
});

test('M44: comparisons never leak another client or infer completions from wearables',()=>{
  const other=execution('foreign',{clientId:'m44-client-b',appointmentId:'a1'});
  const summary=progress([appointment('a1','confirmada')],[other]);
  assert.equal(summary.completedSessions,0);
  assert.equal(summary.scheduledCompletedSessions,0);
  assert.equal(summary.adherence,0);
});
