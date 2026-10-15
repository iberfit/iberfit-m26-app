import test from 'node:test';
import assert from 'node:assert/strict';
import {computeProgressSummary} from '../src/m26/engagement/progress-engine.js';
import {buildPremiumReportPortfolio,validateReportDraft,normalizeReportDraft} from '../src/m26/workflows/report-workflow.js';

const now=new Date('2026-10-15T12:00:00Z');
const state=(executions)=>({collections:{appointments:[],sessionExecutions:executions,sessions:[],iriAssessments:[],checkins:[],wearableDailySummaries:[],trainingCycles:[]},pendingOperations:[],conflicts:[],rejectedOperations:[]});
const session=(id,exerciseId,loadKg,extra={})=>({id,clientId:'m44-c1',status:'completed',syncStatus:'clean',completedAt:id==='e1'?'2026-10-10T12:00:00Z':'2026-10-13T12:00:00Z',results:[{exerciseId,reps:10,loadKg,...extra}]});

test('M44: unrelated exercises never produce a synthetic training volume trend',()=>{
  const summary=computeProgressSummary(state([session('e1','squat',40),session('e2','deadlift',55)]),'m44-c1',{now});
  assert.ok(summary.volume>0);
  assert.equal(summary.volumeDelta,null);
});
test('M44: matching confirmed exercise sets allow a descriptive volume comparison',()=>{
  const summary=computeProgressSummary(state([session('e1','squat',40),session('e2','squat',50)]),'m44-c1',{now});
  assert.equal(summary.volumeDelta,25);
});
test('M44: missing exercise identity and different laterality prevent cross-session comparison',()=>{
  const missing=computeProgressSummary(state([session('e1','squat',40),session('e2',null,50)]),'m44-c1',{now});
  assert.equal(missing.volumeDelta,null);
  const sides=computeProgressSummary(state([session('e1','squat',40,{side:'izquierda'}),session('e2','squat',50,{side:'derecha'})]),'m44-c1',{now});
  assert.equal(sides.volumeDelta,null);
});
test('M44: training report origins never inherit an unrelated IRI diagnosis',()=>{
  const fixture=state([session('e1','squat',40),session('e2','squat',50)]);
  fixture.collections.iriAssessments=[{id:'iri-start',clientId:'m44-c1',assessmentType:'inicial',status:'confirmed',firstSessionCompletedAt:'2026-10-01T00:00:00Z',assessmentDate:'2026-10-01'}];
  const reports=buildPremiumReportPortfolio(fixture,'m44-c1',{now});
  const post=reports.find(item=>item.id==='post-session');
  assert.equal(post.ready,true);
  assert.equal(post.assessmentId,null);
  assert.equal(post.sourceType,'session_execution');
  assert.equal(post.sourceId,'e2');
  assert.equal(reports.find(item=>item.id==='iri').sourceType,'iri_assessment');
  const weekly=reports.find(item=>item.id==='weekly');
  assert.equal(weekly.sourceType,'session_execution_period');
  assert.equal(weekly.assessmentId,null);
});
test('M44: reports based on training do not require IRI; historical and diagnostic reports do',()=>{
  const draft={id:'r1',clientId:'m44-c1',title:'Informe de entrenamiento',periodStart:'2026-10-09',periodEnd:'2026-10-15',summary:'Actividad confirmada',conclusions:'Seguimiento revisado',recommendations:'Continuar control',reviewAccepted:true};
  assert.equal(validateReportDraft({...draft,reportType:'weekly'}).ok,true);
  assert.equal(normalizeReportDraft({...draft,reportType:'weekly'}).assessmentId,null);
  assert.ok(validateReportDraft({...draft,reportType:'iri'}).errors.includes('assessmentId'));
  assert.ok(validateReportDraft(draft).errors.includes('assessmentId'));
});
