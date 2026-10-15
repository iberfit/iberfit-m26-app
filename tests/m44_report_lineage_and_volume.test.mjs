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
  const normalizedPost=normalizeReportDraft({id:'r-post',clientId:'m44-c1',reportType:'post-session',sourceId:post.sourceId,title:post.title,periodStart:post.periodStart,periodEnd:post.periodEnd,summary:post.summary,conclusions:post.conclusions,recommendations:post.recommendations,reviewAccepted:true,evidence:post.evidence});
  assert.equal(normalizedPost.sourceType,'session_execution');
  assert.equal(normalizedPost.sourceId,'e2');
  assert.match(normalizedPost.evidenceSignature,/"sourceId":"e2"/u);
  assert.match(normalizedPost.evidenceSignature,/"sourceType":"session_execution"/u);
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


test('M44: IRI baseline is the earliest initial diagnosis even when another confirmed initial record is newer',()=>{
  const fixture=state([session('e1','squat',40),session('e2','squat',50)]);
  fixture.collections.iriAssessments=[
    {id:'iri-newer',clientId:'m44-c1',assessmentType:'inicial',status:'confirmed',revision:5,assessmentDate:'2026-10-10',firstSessionCompletedAt:'2026-10-10',bodyComposition:[]},
    {id:'iri-original',clientId:'m44-c1',assessmentType:'inicial',status:'confirmed',revision:3,assessmentDate:'2026-09-01',firstSessionCompletedAt:'2026-09-01',bodyComposition:[]},
  ];
  const iri=buildPremiumReportPortfolio(fixture,'m44-c1',{now}).find(item=>item.id==='iri');
  assert.equal(iri.sourceId,'iri-original');
  assert.equal(iri.assessmentRevision,3);
  assert.equal(iri.ready,false,'an empty confirmed IRI must not become a diagnostic report');
  assert.equal(iri.evidence.length,0);
  assert.equal(iri.summary,'');
});

test('M44: unknown IRI revision is null, not falsely represented as version zero',()=>{
  const fixture=state([session('e1','squat',40)]);
  const report=buildPremiumReportPortfolio(fixture,'m44-c1',{now}).find(item=>item.id==='weekly');
  assert.equal(report.assessmentRevision,null);
});


test('M44: missing heart-rate values cannot be coerced to zero and fake an IRI cardio domain',()=>{
  const base=state([session('e1','squat',40)]);
  base.collections.iriAssessments=[{
    id:'iri-empty-hr',clientId:'m44-c1',status:'confirmed',assessmentType:'inicial',
    assessmentDate:'2026-10-01',firstSessionCompletedAt:'2026-10-01',
    stepFinalHr:null,stepOneMinuteHr:null,
    bodyComposition:{},strengthPatterns:{},
  }];
  const report=buildPremiumReportPortfolio(base,'m44-c1',{now}).find(x=>x.id==='iri');
  assert.equal(report.ready,false);
  assert.deepEqual(report.evidence,[]);
  assert.equal(report.summary,'');
});

test('M44: only one complete cardio pair creates one objective IRI domain',()=>{
  const fixture=state([session('e1','squat',40)]);
  fixture.collections.iriAssessments=[{
    id:'iri-real-hr',clientId:'m44-c1',status:'confirmed',
    assessmentDate:'2026-10-01',firstSessionCompletedAt:'2026-10-01',
    stepFinalHr:151,stepOneMinuteHr:128,bodyComposition:{},strengthPatterns:{},
  }];
  const report=buildPremiumReportPortfolio(fixture,'m44-c1',{now}).find(x=>x.id==='iri');
  assert.equal(report.ready,true);
  assert.match(report.summary,/1 de 3 dominios/u);
});


test('M44 reporting pillars exclude fresh device activity as a substitute for follow-up evidence',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../src/m26/workflows/report-workflow.js',import.meta.url),'utf8');
  assert.match(source,/pillar\.id!=='activity'/);
  assert.match(source,/pillar\.source!=='wearableDailySummaries'/);
  assert.match(source,/los datos del dispositivo son solo contexto/u);
});


test('M44 selects actual completedAt inside canonical execution summary, not record creation date',()=>{
  const fixture=state([
    {id:'qa-e1',clientId:'m44-c1',status:'cerrada_confirmada',
      createdAt:'2026-01-01T09:00:00Z',
      summary:{completedAt:'2026-10-14T09:00:00Z'},results:[{exerciseId:'squat',reps:8,loadKg:40}]},
    {id:'qa-e2',clientId:'m44-c1',status:'cerrada_confirmada',
      createdAt:'2026-10-15T10:00:00Z',
      summary:{completedAt:'2026-10-11T09:00:00Z'},results:[{exerciseId:'squat',reps:8,loadKg:42}]},
  ]);
  const reports=buildPremiumReportPortfolio(fixture,'m44-c1',{now});
  const post=reports.find(r=>r.id==='post-session');
  const weekly=reports.find(r=>r.id==='weekly');
  assert.equal(post.sourceId,'qa-e1');
  assert.equal(post.periodStart,'2026-10-14');
  assert.match(weekly.summary,/2 sesiones/);
  assert.equal(weekly.activitySeries.reduce((total,row)=>total+row.count,0),2);
});

test('M44 a createdAt timestamp cannot fabricate workout completion or join a period histogram',()=>{
  const fixture=state([{
    id:'qa-incomplete',clientId:'m44-c1',
    status:'cerrada_confirmada',createdAt:'2026-10-14T09:00:00Z',
    results:[{exerciseId:'squat',reps:8,loadKg:40}],
  }]);
  const portfolio=buildPremiumReportPortfolio(fixture,'m44-c1',{now});
  for(const kind of ['post-session','weekly','monthly','quarterly','year-in-iberfit']){
    assert.equal(portfolio.find(r=>r.id===kind).ready,false,kind);
  }
});
