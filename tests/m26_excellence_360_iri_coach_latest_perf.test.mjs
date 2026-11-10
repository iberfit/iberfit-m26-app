import test from 'node:test';
import assert from 'node:assert/strict';
import {isInitialIriAssessment,IRI_INITIAL_DIAGNOSTIC_KIND,EVOLUTION_FOLLOWUP_KIND} from '../src/m26/workflows/iri-2-longitudinal.js';
import {latestForClient,latestIriForClient,clientHealthSummary,clientsOverview} from '../src/m26/modules/domain-selectors.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
import {buildPremiumReportPortfolio} from '../src/m26/workflows/report-workflow.js';

const now=new Date('2026-11-09T18:00:00Z');
const iri=(id,date,type,extra={})=>({
  id,clientId:'owner-a',assessmentDate:date,assessmentType:type,
  status:'completado',firstSessionCompletedAt:'2026-11-07T14:00:00Z',
  body:{bodyComposition:{weightKg:70},...extra},
});
function state(records=[]){
  return {identity:{id:'coach-qa',role:'coach'},selectedClientId:'owner-a',
    selectedIriAssessmentId:'baseline-typed',hydration:{status:'ready'},
    collections:{clients:[{id:'owner-a',name:'Cliente sintético',serviceKind:'training'}],
      iriAssessments:records,clientProfiles:[],clientAccess:[],reports:[],
      trainingCycles:[],sessions:[],sessionExecutions:[],appointments:[],
      checkins:[],habits:[],habitLogs:[],wearableDailySummaries:[],
      wearableConnections:[],m26Entities:[],domainEvents:[]},
    pendingOperations:[],conflicts:[],rejectedOperations:[]};
}
test('Excellence360 initial IRI classification recognizes canonical, Spanish and legacy markers',()=>{
  for(const value of ['inicial','initial',IRI_INITIAL_DIAGNOSTIC_KIND,'iri','assessment','baseline']){
    assert.equal(isInitialIriAssessment({assessmentType:value}),true,value);
  }
  assert.equal(isInitialIriAssessment({body:{assessmentKind:IRI_INITIAL_DIAGNOSTIC_KIND}}),true);
  assert.equal(isInitialIriAssessment({status:'completado'}),true,'historical untyped IRI');
  assert.equal(isInitialIriAssessment(null),false);
});
test('Excellence360 explicit longitudinal follow-up cannot replace the IRI baseline',()=>{
  for(const type of [EVOLUTION_FOLLOWUP_KIND,'seguimiento','follow-up','reassessment']){
    assert.equal(isInitialIriAssessment({assessmentType:type}),false,type);
    assert.equal(isInitialIriAssessment({assessmentType:'initial',body:{kind:type}}),false,
      'conflicting marker must fail closed');
  }
  assert.equal(isInitialIriAssessment({type:'unrecognized-assessment-kind'}),false);
});
test('Excellence360 Coach directory and selected-client summary keep original IRI despite newer follow-up',()=>{
  const rows=[
    iri('baseline-legacy','2026-11-01','inicial'),
    iri('baseline-typed','2026-11-03',IRI_INITIAL_DIAGNOSTIC_KIND),
    iri('follow-up','2026-11-09',EVOLUTION_FOLLOWUP_KIND),
  ];
  const s=state(rows);
  assert.equal(latestIriForClient(s,'owner-a')?.id,'baseline-typed');
  assert.equal(clientHealthSummary(s,'owner-a',now)?.iri?.id,'baseline-typed');
  assert.equal(clientsOverview(s,now)[0]?.iri?.id,'baseline-typed');
  const route=createRouteViewModel({
    activeArea:'iri',identity:{id:'coach-qa',role:'coach'},
    page:{title:'Diagnóstico IRI'},
  },s,now);
  assert.equal(route.current?.id,'baseline-typed');
});
test('Excellence360 reports ignore conflicting follow-up metadata even when the latest row looks confirmed',()=>{
  const follow=iri('follow-up','2026-11-09','initial',{kind:EVOLUTION_FOLLOWUP_KIND});
  const pureFollow=iri('follow-only','2026-11-08',EVOLUTION_FOLLOWUP_KIND);
  const rows=buildPremiumReportPortfolio(state([follow,pureFollow]),'owner-a',{now});
  const initial=rows.find(x=>x.id==='iri');
  assert.equal(initial?.ready,false);
  assert.equal(initial?.assessmentId,null);
});
test('Excellence360 linear latest selection keeps original date tie ordering and makes one defensive copy',()=>{
  const source=Array.from({length:2000},(_,i)=>({
    id:'record-'+i,clientId:i%2===0?'owner-a':'owner-b',
    date:new Date(Date.UTC(2026,9,1,0,0,i%2160)).toISOString(),
    body:{value:i},
  }));
  const s={selectedClientId:'owner-a',collections:{reports:source}};
  const expected=[...source].filter(x=>x.clientId==='owner-a').sort((a,b)=>
    Date.parse(b.date)-Date.parse(a.date))[0];
  const originalClone=globalThis.structuredClone;
  let copyCount=0;
  try{
    globalThis.structuredClone=(value)=>{copyCount++;return originalClone(value);};
    const actual=latestForClient(s,'reports','owner-a');
    assert.deepEqual(actual,expected);
    assert.equal(copyCount,1,'do not clone all 1000 historical rows');
    assert.notEqual(actual,expected,'returned object stays defensive');
    actual.body.value=-1;
    assert.notEqual(expected.body.value,-1,'canonical source unchanged');
  }finally{globalThis.structuredClone=originalClone;}
  assert.equal(latestForClient(s,'reports','missing'),null);
  assert.equal(latestForClient(s,'reports','owner-a',record=>record.id==='record-10')?.id,'record-10');
});
