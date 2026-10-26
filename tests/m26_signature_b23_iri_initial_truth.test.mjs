import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveClientExperience} from '../src/m26/experience/client-experience.js';
import {renderProgressRoute,renderReportsRoute} from '../src/m26/modules/route-render.js';

function progress(iriBaseline,iriCurrent){
  return renderProgressRoute({
    role:'coach',serviceKind:'training',
    summary:{
      days:28,dataQuality:'limitada',plannedSessions:0,completedSessions:0,
      adherence:null,averageRpe:null,volume:null,volumeDelta:null,
      checkins:0,checkinAverage:{},unconfirmedExecutions:0,
      iriBaseline,iriCurrent,
      wearable:{metrics:{},providers:[],daysWithData:0},
    },
    timeline:[],alerts:[],signal:{label:'Al día',level:'neutral'},
    longitudinal:null,exerciseProgress:[],planExecution:null,
  });
}
function reports(role,confirmed){
  return renderReportsRoute({
    role,canManage:role==='coach',serviceKind:'training',
    latestIri:{id:'iri-1',revision:1,status:confirmed?'completado':'borrador'},
    iriDiagnosis:{assessmentId:'iri-1',confirmed,
      dateLabel:'26 octubre 2026',classification:'Perfil IRI por dominios',
      processLabel:confirmed?'7 de 7 etapas completadas':'Evaluación en preparación',
      revision:1},
    reports:[],
  });
}
test('B23 Coach progress never calls provisional IRI a confirmed diagnosis',()=>{
  const html=progress(null,{mobility:4});
  assert.match(html,/Sin diagnóstico confirmado/);
  assert.doesNotMatch(html,/Punto de partida disponible|Punto de partida confirmado/);
});
test('B23 Coach progress acknowledges only verified initial diagnostic baseline',()=>{
  const html=progress({baselineAssessmentId:'iri-1',kind:'iri-initial-diagnostic',available:false},{mobility:7});
  assert.match(html,/Punto de partida confirmado/);
});
test('B23 Client reports cannot expose unconfirmed IRI as an issued diagnosis',()=>{
  const html=reports('client',false);
  assert.match(html,/Diagnóstico IRI pendiente/);
  assert.doesNotMatch(html,/data-iri-diagnosis|generate-client-iri-report|Evaluación confirmada ·/);
});
test('B23 Coach official IRI controls stay closed for provisional IRI',()=>{
  const html=reports('coach',false);
  assert.doesNotMatch(html,/data-workflow-action="issue-client-iri-report"/);
  assert.doesNotMatch(html,/data-workflow-action="issue-coach-iri-report"/);
  assert.match(html,/name="assessmentId" value=""/);
  assert.match(html,/data-workflow-action="approve-report" disabled aria-disabled="true"/);
});
test('B23 confirmed initial IRI retains Client and Coach diagnostic reporting',()=>{
  const client=reports('client',true),coach=reports('coach',true);
  assert.match(client,/data-iri-diagnosis/);
  assert.match(client,/data-workflow-action="generate-client-iri-report"/);
  assert.match(coach,/data-workflow-action="issue-client-iri-report"/);
  assert.match(coach,/data-workflow-action="issue-coach-iri-report"/);
  assert.match(coach,/name="assessmentId" value="iri-1"/);
});


test('B23 client readiness ignores negative or status-only completion labels',()=>{
  for(const status of ['no confirmado','incompleto','borrador','completado','confirmed']){
    const state=deriveClientExperience({iri:{status},profile:{completeness:100}});
    assert.equal(state.readiness.iriConfirmed,false,status);
    assert.ok(state.attention.includes('iri_incomplete'),status);
  }
  for(const raw of [{firstSessionCompletedAt:'2026-10-26T12:00:00Z'},{
    body:{first_session_completed_at:'2026-10-26T12:00:00Z'}
  }]){
    const state=deriveClientExperience({iri:{...raw,status:'no confirmado'},profile:{completeness:100}});
    assert.equal(state.readiness.iriConfirmed,true,'completed first session is the source of truth');
  }
});
test('B23 route read model never confirms diagnosis from a presentation status alone',()=>{
  const source=readFileSync(new URL('../src/m26/modules/route-view-model.js',import.meta.url),'utf8');
  const start=source.indexOf('function compactIri(record)');
  const end=source.indexOf('function compactIriDiagnosis(record)',start);
  assert.ok(start>0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/const confirmed=Boolean\(firstSessionCompletedAt\)/);
  assert.doesNotMatch(block,/\|\|\s*\/\(\?:complet\|confirmad\)/);
});
