import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {buildPremiumReportPortfolio,PREMIUM_REPORT_MODEL_VERSION,PREMIUM_REPORT_TYPES,buildApproveReportDraftCommand,normalizeReportDraft,premiumReportUiCandidates,installPremiumReportUi,validateReportDraft} from '../src/m26/workflows/report-workflow.js';

const NOW=new Date('2026-09-06T12:00:00Z');

function stateWithHistory(){
  return {
    collections:{
      appointments:[
        {id:'a0',clientId:'c1',status:'completed',scheduledAt:'2025-11-01T10:00:00Z'},
        {id:'a1',clientId:'c1',status:'completed',scheduledAt:'2026-08-20T10:00:00Z'},
        {id:'a2',clientId:'c1',status:'completed',scheduledAt:'2026-08-27T10:00:00Z'},
        {id:'a3',clientId:'c1',status:'completed',scheduledAt:'2026-09-03T10:00:00Z'},
      ],
      sessions:[{id:'s1',clientId:'c1',blocks:[{exerciseId:'squat',exerciseName:'Sentadilla'}]}],
      sessionExecutions:[
        {id:'e0',clientId:'c1',sessionId:'s1',appointmentId:'a0',status:'completed',syncStatus:'clean',completedAt:'2025-11-01T11:00:00Z',title:'Sesión base',results:{x:{exerciseId:'squat',reps:8,loadKg:35,rpe:7}}},
        {id:'e1',clientId:'c1',sessionId:'s1',appointmentId:'a1',status:'completed',syncStatus:'clean',completedAt:'2026-08-20T11:00:00Z',title:'Fuerza A',results:{x:{exerciseId:'squat',reps:8,loadKg:40,rpe:7}}},
        {id:'e2',clientId:'c1',sessionId:'s1',appointmentId:'a2',status:'completed',syncStatus:'clean',completedAt:'2026-08-27T11:00:00Z',title:'Fuerza B',results:{x:{exerciseId:'squat',reps:8,loadKg:45,rpe:7}}},
        {id:'e3',clientId:'c1',sessionId:'s1',appointmentId:'a3',status:'completed',syncStatus:'clean',completedAt:'2026-09-03T11:00:00Z',title:'Fuerza C',results:{x:{exerciseId:'squat',reps:8,loadKg:50,rpe:7}}},
      ],
      iriAssessments:[
        {id:'iri-old',clientId:'c1',revision:3,status:'confirmed',firstSessionCompletedAt:'2026-03-01T12:00:00Z',assessmentDate:'2026-03-01T10:00:00Z',stepFinalHr:155,stepOneMinuteHr:120,bodyComposition:{weightKg:71},strengthPatterns:{squat:1}},
        {id:'iri-new',clientId:'c1',revision:5,status:'confirmed',firstSessionCompletedAt:'2026-09-01T12:00:00Z',assessmentDate:'2026-09-01T10:00:00Z',stepFinalHr:150,stepOneMinuteHr:115,bodyComposition:{weightKg:70},strengthPatterns:{squat:1}},
      ],
      checkins:[
        {id:'ch1',clientId:'c1',createdAt:'2026-09-01T08:00:00Z',energy:8,sleep:7,stress:3,pain:1},
        {id:'ch2',clientId:'c1',createdAt:'2026-09-03T08:00:00Z',energy:8,sleep:8,stress:2,pain:1},
        {id:'ch3',clientId:'c1',createdAt:'2026-09-05T08:00:00Z',energy:7,sleep:7,stress:3,pain:1},
      ],
      wearableDailySummaries:[],reports:[],
    },
    pendingOperations:[],conflicts:[],rejectedOperations:[],
  };
}

test('catálogo premium cubre siete informes sin duplicar diagnóstico y seguimiento',()=>{
  assert.deepEqual(PREMIUM_REPORT_TYPES.map((item)=>item.id),['iri','post-session','weekly','monthly','reassessment','quarterly','year-in-iberfit']);
});

test('todos los formatos premium, incluido semanal, son aprobables y preservan su tipo',()=>{
  const base={clientId:'c1',assessmentId:'iri-new',title:'Informe basado en evidencia',
    periodStart:'2026-08-31',periodEnd:'2026-09-06',
    summary:'Resumen respaldado por datos canónicos confirmados.',
    conclusions:'Conclusiones profesionales a partir de las sesiones confirmadas.',
    recommendations:'Revisar resultados con el coach antes de continuar.',reviewAccepted:true};
  for(const {id} of PREMIUM_REPORT_TYPES){
    const draft={...base,reportType:id};
    assert.deepEqual(validateReportDraft(draft).errors,[],id);
    assert.equal(normalizeReportDraft(draft).reportType,id);
    assert.equal(buildApproveReportDraftCommand(draft,0).payload.patch.reportType,id);
  }
});

test('portfolio automático conserva seis modelos evidenciables y deja reevaluación pendiente de seguimiento real',()=>{
  const reports=buildPremiumReportPortfolio(stateWithHistory(),'c1',{now:NOW});
  assert.equal(reports.length,7);
  assert.equal(reports.filter(report=>report.ready).length,6);
  assert.equal(reports.find(report=>report.id==='reassessment').ready,false);
  assert.ok(reports.filter(report=>report.id!=='reassessment').every(report=>report.status==='ready'));
  assert.ok(reports.every((report)=>report.dataPolicy==='canonical-only'));
  assert.ok(reports.every((report)=>report.coachCommentLabel==='Comentario del coach'));
  assert.ok(reports.filter(report=>report.ready).every(report=>report.evidence.length>0));
  assert.equal(reports.find(report=>report.id==='iri').assessmentRevision,3);
  assert.ok(reports.filter(report=>report.id!=='iri').every(report=>report.assessmentId===null&&report.assessmentRevision===null));
  assert.equal(reports.find((report)=>report.id==='reassessment').assessmentId,null);
  assert.equal(reports.find((report)=>report.id==='post-session').periodEnd,'2026-09-03');
  assert.match(reports.find((report)=>report.id==='year-in-iberfit').summary,/historial canónico/u);
  const diagnostic=reports.find((report)=>report.id==='iri');
  const reassessment=reports.find((report)=>report.id==='reassessment');
  const monthly=reports.find((report)=>report.id==='monthly');
  const quarterly=reports.find((report)=>report.id==='quarterly');
  assert.ok(diagnostic.evidence.some((item)=>item.source==='iriAssessments'));
  assert.equal(reassessment.evidence.length,0);
  assert.match(reassessment.reason,/seguimiento confirmadas/u);
  assert.equal(monthly.evidence.some((item)=>item.source==='iriAssessments'),false);
  assert.equal(quarterly.evidence.some((item)=>item.source==='iriAssessments'),false);
});

test('sin evidencia no inventa ceros ni métricas: devuelve insufficient-data con motivo explícito',()=>{
  const state={collections:{appointments:[],sessions:[],sessionExecutions:[],iriAssessments:[],checkins:[],wearableDailySummaries:[]},pendingOperations:[],conflicts:[],rejectedOperations:[]};
  const reports=buildPremiumReportPortfolio(state,'c1',{now:NOW});
  assert.equal(reports.length,7);
  for(const report of reports){
    assert.equal(report.ready,false);
    assert.equal(report.status,'insufficient-data');
    assert.ok(report.reason.length>20);
    assert.equal(report.evidence.length,0);
    assert.equal(report.summary,'');
    assert.equal(report.conclusions,'');
    assert.equal(report.recommendations,'');
    assert.doesNotMatch(JSON.stringify(report),/0 sesiones|0 de 3|0%/u);
  }
});


test('resumen semanal computa solo ejecuciones finalizadas del cliente, con ventana inclusiva y sin wearable',()=>{
  const state=stateWithHistory();
  state.collections.sessionExecutions.push({
    id:'observed',clientId:'c1',status:'draft',completedAt:'2026-09-05T12:00:00Z',title:'No finalizada',
  });
  state.collections.wearableDailySummaries.push({
    clientId:'c1',provider:'health_connect',date:'2026-09-05',metrics:{steps:17000},
  });
  const weekly=buildPremiumReportPortfolio(state,'c1',{now:NOW}).find(r=>r.id==='weekly');
  assert.equal(weekly.ready,true);
  assert.equal(weekly.periodStart,'2026-08-31');
  assert.equal(weekly.periodEnd,'2026-09-06');
  assert.match(weekly.summary,/1 sesión de entrenamiento en 1 día/u);
  assert.equal(weekly.evidence.find(x=>x.label==='Sesiones confirmadas').text,'1');
  assert.doesNotMatch(JSON.stringify(weekly),/No finalizada|17000/u);
  assert.equal(weekly.evidence.some(x=>x.source==='iriAssessments'),false);
});
test('resumen semanal no inventa actividad con historial antiguo o ajeno',()=>{
  const state=stateWithHistory();
  const report=buildPremiumReportPortfolio(state,'c1',{now:new Date('2026-10-12T12:00:00Z')})
    .find(r=>r.id==='weekly');
  assert.equal(report.ready,false);
  assert.match(report.reason,/últimos 7 días/u);
  assert.equal(report.evidence.length,0);
  state.collections.sessionExecutions.push({
    id:'foreign-week',clientId:'c2',sessionId:'s1',status:'completed',syncStatus:'clean',
    completedAt:'2026-10-11T12:00:00Z',title:'Sesión ajena',
  });
  const isolated=buildPremiumReportPortfolio(state,'c1',{now:new Date('2026-10-12T12:00:00Z')})
    .find(r=>r.id==='weekly');
  assert.equal(isolated.ready,false);
  assert.doesNotMatch(JSON.stringify(isolated),/Sesión ajena/u);
});

test('portfolio queda aislado por clientId',()=>{
  const state=stateWithHistory();
  state.collections.sessionExecutions.push({id:'foreign',clientId:'c2',status:'completed',completedAt:'2026-09-05T11:00:00Z',title:'No debe aparecer'});
  const report=buildPremiumReportPortfolio(state,'c1',{now:NOW}).find((item)=>item.id==='post-session');
  assert.doesNotMatch(report.summary,/No debe aparecer/u);
  assert.equal(report.periodEnd,'2026-09-03');
});

test('candidatos automáticos sólo se proyectan a Coach y Admin',()=>{
  const state=stateWithHistory();
  assert.equal(premiumReportUiCandidates(state,'client','c1',{now:NOW}).length,0);
  assert.equal(premiumReportUiCandidates(state,'coach','c1',{now:NOW}).length,7);
  assert.equal(premiumReportUiCandidates(state,'admin','c1',{now:NOW}).length,7);
  assert.equal(premiumReportUiCandidates(state,'coach',null,{now:NOW}).length,0);
});

test('puente UI se mantiene inerte fuera del navegador',()=>{
  assert.equal(installPremiumReportUi({scope:{document:null},root:null}),null);
});

test('puente UI exige firma de evidencia antes de enriquecer la aprobación',async()=>{
  const source=await readFile(new URL('../src/m26/workflows/report-workflow.js',import.meta.url),'utf8');
  assert.match(source,/data-premium-report-candidates/u);
  assert.match(source,/premiumEvidenceSignature/u);
  assert.match(source,/premium-evidence-stale/u);
  assert.match(source,/coachComment/u);
  assert.match(source,/premiumReportUiCandidates/u);
});

test('aprobación conserva tipo, comentario y procedencia sin romper el contrato histórico',()=>{
  const command=buildApproveReportDraftCommand({
    id:'report-1',clientId:'c1',assessmentId:'iri-new',reportType:'monthly',title:'Informe mensual IBERFIT',periodStart:'2026-08-08',periodEnd:'2026-09-06',
    summary:'Resumen construido únicamente con evidencia canónica confirmada.',conclusions:'Conclusiones revisadas por el coach con trazabilidad suficiente.',recommendations:'Mantener seguimiento y revisar la siguiente etapa con el cliente.',
    coachComment:'Buena continuidad este mes; mantener progresión prudente.',sourceAssessmentRevision:5,evidence:[{label:'Sesiones ejecutadas',text:'3',source:'sessionExecutions',quality:'alta'}],reviewAccepted:true,
  },2);
  assert.equal(command.type,'INFORME_APROBAR');
  assert.equal(command.baseRevision,2);
  assert.equal(command.payload.patch.reportType,'monthly');
  assert.equal(command.payload.patch.coachComment,'Buena continuidad este mes; mantener progresión prudente.');
  assert.equal(command.payload.patch.dataPolicy,'canonical-only');
  assert.equal(command.payload.patch.reportModelVersion,PREMIUM_REPORT_MODEL_VERSION);
  assert.equal(command.payload.patch.sourceAssessmentId,undefined);
  assert.equal(command.payload.patch.sourceAssessmentRevision,undefined);
  assert.equal(command.payload.patch.assessmentId,null);
  assert.match(command.payload.patch.evidenceSignature,/"modelVersion":"iri2-premium-report-v1"/u);
  assert.match(command.payload.patch.evidenceSignature,/"assessmentRevision":null/u);
  assert.deepEqual(command.payload.patch.evidence,[{label:'Sesiones ejecutadas',text:'3',source:'sessionExecutions',quality:'alta'}]);
  assert.equal(command.payload.patch.visibleToClient,false);
});

test('firma de evidencia cambia ante cualquier cambio factual y no depende del comentario del Coach',()=>{
  const common={
    id:'report-lineage',clientId:'c1',assessmentId:'iri-new',sourceAssessmentRevision:5,reportType:'monthly',title:'Informe mensual IBERFIT',periodStart:'2026-08-08',periodEnd:'2026-09-06',
    summary:'Resumen construido únicamente con evidencia canónica confirmada.',conclusions:'Conclusiones revisadas por el coach con trazabilidad suficiente.',recommendations:'Mantener seguimiento y revisar la siguiente etapa con el cliente.',reviewAccepted:true,
  };
  const first=buildApproveReportDraftCommand({...common,coachComment:'Comentario A',evidence:[{label:'Sesiones ejecutadas',text:'3',source:'sessionExecutions',quality:'alta'}]},1).payload.patch;
  const sameEvidence=buildApproveReportDraftCommand({...common,coachComment:'Comentario B',evidence:[{label:'Sesiones ejecutadas',text:'3',source:'sessionExecutions',quality:'alta'}]},1).payload.patch;
  const changedEvidence=buildApproveReportDraftCommand({...common,coachComment:'Comentario A',evidence:[{label:'Sesiones ejecutadas',text:'4',source:'sessionExecutions',quality:'alta'}]},1).payload.patch;
  assert.equal(first.evidenceSignature,sameEvidence.evidenceSignature);
  assert.notEqual(first.evidenceSignature,changedEvidence.evidenceSignature);
});

test('informes históricos sin tipo premium conservan el contrato anterior sin metadatos IRI 2.0',()=>{
  const legacy=normalizeReportDraft({
    id:'legacy-report',clientId:'c1',assessmentId:'iri-old',title:'Informe histórico',periodStart:'2026-03-01',periodEnd:'2026-03-01',
    summary:'Resumen histórico suficientemente descriptivo para conservar compatibilidad.',conclusions:'Conclusiones históricas revisadas y conservadas sin migración forzada.',recommendations:'Mantener el registro histórico tal como fue aprobado originalmente.',reviewAccepted:true,
  });
  assert.equal(legacy.reportType,undefined);
  assert.equal(legacy.reportModelVersion,undefined);
  assert.equal(legacy.evidenceSignature,undefined);
  assert.equal(legacy.sourceAssessmentId,undefined);
  assert.equal(legacy.sourceAssessmentRevision,undefined);
  assert.equal(legacy.dataPolicy,undefined);
});

test('informes de proceso no convierten el diagnóstico IRI en una señal cotidiana de evolución',()=>{
  const reports=buildPremiumReportPortfolio(stateWithHistory(),'c1',{now:NOW});
  for(const type of ['weekly','monthly','quarterly','year-in-iberfit']){
    const report=reports.find((item)=>item.id===type);
    assert.ok(report?.ready);
    assert.equal(report.evidence.some((item)=>item.source==='iriAssessments'),false);
  }
  assert.ok(reports.find((item)=>item.id==='iri').evidence.some((item)=>item.source==='iriAssessments'));
  assert.equal(reports.find((item)=>item.id==='reassessment').ready,false);
});

test('resumenes semanales y mensuales no duplican la misma ejecucion canonica tras sincronizar',()=>{
  const state=stateWithHistory();
  const confirmed=state.collections.sessionExecutions.find(row=>row.id==='e3');
  state.collections.sessionExecutions.push({...confirmed,revision:2,updatedAt:'2026-09-05T13:00:00Z'});
  const reports=buildPremiumReportPortfolio(state,'c1',{now:NOW});
  const weekly=reports.find(report=>report.id==='weekly');
  const monthly=reports.find(report=>report.id==='monthly');
  assert.match(weekly.summary,/1 sesión de entrenamiento en 1 día/u);
  assert.equal(weekly.evidence.find(row=>row.label==='Sesiones confirmadas').text,'1');
  assert.match(monthly.summary,/3 sesiones ejecutadas/u);
  assert.equal(monthly.evidence.find(row=>row.label==='Sesiones ejecutadas').text,'3');
});

test('resumen semanal usa plural correcto con dos sesiones confirmadas sin inflar dias',()=>{
  const state=stateWithHistory();
  state.collections.sessionExecutions.push({
    id:'e4',clientId:'c1',sessionId:'s1',status:'completed',syncStatus:'clean',
    completedAt:'2026-09-05T11:00:00Z',title:'Fuerza D',
  });
  const weekly=buildPremiumReportPortfolio(state,'c1',{now:NOW}).find(report=>report.id==='weekly');
  assert.match(weekly.summary,/2 sesiones de entrenamiento en 2 días/u);
  assert.doesNotMatch(weekly.summary,/sesiónes/u);
});

test('M44: training-only client sees evidence-only report candidates without an IRI prerequisite',()=>{
  const state=stateWithHistory();
  state.collections.iriAssessments=[];
  const reports=buildPremiumReportPortfolio(state,'c1',{now:NOW});
  assert.equal(reports.find(report=>report.id==='iri').ready,false);
  for(const id of ['post-session','weekly','monthly','quarterly','year-in-iberfit']){
    const candidate=reports.find(report=>report.id===id);
    assert.equal(candidate.ready,true,id+' requires real training, not initial IRI');
    assert.equal(candidate.assessmentId,null);
    assert.equal(candidate.evidence.some(row=>row.source==='iriAssessments'),false);
  }
  assert.equal(reports.find(report=>report.id==='reassessment').ready,false);
});

test('M44: a follow-up assessment cannot silently replace the baseline IRI diagnosis',()=>{
  const state=stateWithHistory();
  state.collections.iriAssessments=[
    {...state.collections.iriAssessments[1],id:'followup-new',type:'evolution-followup'},
  ];
  const reports=buildPremiumReportPortfolio(state,'c1',{now:NOW});
  assert.equal(reports.find(report=>report.id==='iri').ready,false);
  assert.equal(reports.find(report=>report.id==='reassessment').ready,false);
  assert.equal(reports.find(report=>report.id==='post-session').ready,true);
});

test('M44: two old IRI initial diagnoses alone cannot authorize a fabricated longitudinal reassessment',()=>{
  const reports=buildPremiumReportPortfolio(stateWithHistory(),'c1',{now:NOW});
  const followup=reports.find(report=>report.id==='reassessment');
  assert.equal(followup.ready,false);
  assert.equal(followup.evidence.length,0);
  assert.match(followup.reason,/Dos diagnósticos IRI iniciales no constituyen una reevaluación/u);
});

test('M44: a future-dated execution cannot become a completed report in a past report window',()=>{
  const state=stateWithHistory();
  state.collections.iriAssessments=[];
  state.collections.sessionExecutions=state.collections.sessionExecutions.map(item=>({
    ...item,completedAt:'2027-01-01T11:00:00Z',
  }));
  const reports=buildPremiumReportPortfolio(state,'c1',{now:NOW});
  for(const id of ['post-session','weekly','monthly','quarterly','year-in-iberfit'])
    assert.equal(reports.find(report=>report.id===id).ready,false,id);
});

test('M44 preview wiring is visible in the real report editor and never dispatches a publish command',async()=>{
  const source=await readFile(new URL('../src/m26/workflows/report-workflow.js',import.meta.url),'utf8');
  assert.match(source,/data-m44-report-preview/);
  assert.match(source,/openEvolutionReportPreview/);
  assert.match(source,/Vista previa privada abierta/);
  assert.match(source,/premiumEvidenceSignature\(candidate\)/);
  assert.match(source,/event\.preventDefault/);
});


test('M44 timeline buckets preserve all confirmed sessions in their civil-date window',()=>{
  const state=stateWithHistory();
  const monthly=buildPremiumReportPortfolio(state,'c1',{now:NOW}).find(item=>item.id==='monthly');
  assert.ok(monthly.activitySeries.length>=4);
  assert.equal(monthly.activitySeries.reduce((sum,row)=>sum+row.count,0),3);
  assert.ok(monthly.activitySeries.every(row=>row.from<=row.to&&Number.isInteger(row.count)&&row.count>=0));
});

test('M44 evidence signature binds the temporal distribution; coach note alone cannot change the chart',()=>{
  const source=buildPremiumReportPortfolio(stateWithHistory(),'c1',{now:NOW}).find(item=>item.id==='monthly');
  const base={id:'report-m44-timeline',clientId:'c1',reportType:'monthly',title:source.title,
    periodStart:source.periodStart,periodEnd:source.periodEnd,summary:source.summary,conclusions:source.conclusions,
    recommendations:source.recommendations,evidence:source.evidence,activitySeries:source.activitySeries,reviewAccepted:true};
  const first=buildApproveReportDraftCommand(base,0).payload.patch;
  const identical=buildApproveReportDraftCommand({...base,coachComment:'Decisión individual del Coach'},0).payload.patch;
  assert.equal(first.evidenceSignature,identical.evidenceSignature);
  const modified=buildApproveReportDraftCommand({...base,activitySeries:base.activitySeries.map((row,i)=>i===0?{...row,count:row.count+1}:row)},0).payload.patch;
  assert.notEqual(first.evidenceSignature,modified.evidenceSignature);
});
