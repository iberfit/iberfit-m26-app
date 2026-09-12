import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {buildPremiumReportPortfolio,PREMIUM_REPORT_MODEL_VERSION,PREMIUM_REPORT_TYPES,buildApproveReportDraftCommand,normalizeReportDraft,premiumReportUiCandidates,installPremiumReportUi} from '../src/m26/workflows/report-workflow.js';

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

test('catálogo premium separa diagnóstico IRI, reevaluación IRI y seguimiento',()=>{
  assert.deepEqual(PREMIUM_REPORT_TYPES.map((item)=>item.id),['iri','post-session','monthly','reassessment','quarterly','year-in-iberfit']);
  assert.equal(PREMIUM_REPORT_TYPES.find((item)=>item.id==='iri')?.label,'Diagnóstico IRI');
  assert.equal(PREMIUM_REPORT_TYPES.find((item)=>item.id==='reassessment')?.label,'Informe de reevaluación IRI');
  assert.equal(PREMIUM_REPORT_MODEL_VERSION,'iberfit-premium-report-lineage-v1');
});

test('portfolio automático usa evidencia canónica y habilita los seis tipos cuando existe historial suficiente',()=>{
  const reports=buildPremiumReportPortfolio(stateWithHistory(),'c1',{now:NOW});
  assert.equal(reports.length,6);
  assert.ok(reports.every((report)=>report.ready===true));
  assert.ok(reports.every((report)=>report.status==='ready'));
  assert.ok(reports.every((report)=>report.dataPolicy==='canonical-only'));
  assert.ok(reports.every((report)=>report.coachCommentLabel==='Comentario del coach'));
  assert.ok(reports.every((report)=>report.evidence.length>0));
  assert.ok(reports.every((report)=>report.assessmentRevision===5));
  assert.equal(reports.find((report)=>report.id==='reassessment').periodStart,'2026-03-01');
  assert.equal(reports.find((report)=>report.id==='post-session').periodEnd,'2026-09-03');
  assert.match(reports.find((report)=>report.id==='year-in-iberfit').summary,/historial canónico/u);
});

test('sin evidencia no inventa ceros ni métricas: devuelve insufficient-data con motivo explícito',()=>{
  const state={collections:{appointments:[],sessions:[],sessionExecutions:[],iriAssessments:[],checkins:[],wearableDailySummaries:[]},pendingOperations:[],conflicts:[],rejectedOperations:[]};
  const reports=buildPremiumReportPortfolio(state,'c1',{now:NOW});
  assert.equal(reports.length,6);
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
  assert.equal(premiumReportUiCandidates(state,'coach','c1',{now:NOW}).length,6);
  assert.equal(premiumReportUiCandidates(state,'admin','c1',{now:NOW}).length,6);
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
  assert.equal(command.payload.patch.sourceAssessmentId,'iri-new');
  assert.equal(command.payload.patch.sourceAssessmentRevision,5);
  assert.match(command.payload.patch.evidenceSignature,/"modelVersion":"iberfit-premium-report-lineage-v1"/u);
  assert.match(command.payload.patch.evidenceSignature,/"assessmentRevision":5/u);
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

test('informes históricos sin tipo premium conservan el contrato anterior sin metadatos de trazabilidad premium',()=>{
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
