import test from 'node:test';import assert from 'node:assert/strict';
import {projectAdminSnapshot} from '../src/m26/admin/admin-state.js';
import {buildBusinessReport,buildBusinessReportHtml} from '../src/m26/admin/business-report.js';
const permissions=['analytics.read','client.lifecycle.read','assignment.read','operation.read_global'];
const state=(p=permissions)=>({identity:{role:'admin'},admin:projectAdminSnapshot({ok:true,organization:{id:'org'},permissions:p,serverTime:'2026-11-25T12:00:00Z',analytics:{activeClients:2},data:{coachProfiles:[{id:'coach',name:'PRIVATE COACH',capacityHours:20,assignedHours:18},{id:'unknown',name:'PRIVATE TWO'}],operationalTasks:[]}},{role:'admin'})});
const clients=[{id:'c1',name:'PRIVATE NAME',trainingServiceStatus:'active',assignments:[],experience:{stage:'planning'}},{id:'c2',trainingServiceStatus:'none',experience:{readiness:{iriConfirmed:true}}},{id:'dup',trainingServiceStatus:'active'},{id:'dup',trainingServiceStatus:'paused'}];
test('management report is aggregate only, separates training and IRI and explicitly reports excluded duplicates and unknown capacity',()=>{
 const r=buildBusinessReport(state(),clients);const vals=Object.fromEntries(r.groups.flatMap(g=>g.rows.map(x=>[x.label,x.value])));
 assert.equal(vals['En entrenamiento activo'],1);assert.equal(vals['Evaluados sin entrenamiento activo'],1);assert.equal(vals['Duplicados excluidos'],1);assert.equal(vals['Capacidad cuantificable'],1);assert.equal(vals['Sin capacidad cuantificable'],1);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE|c1|c2/);assert.doesNotMatch(buildBusinessReportHtml(r),/PRIVATE NAME|PRIVATE COACH/);
});
test('report denies non-admin and analytics absent, and omits restricted domains',()=>{
 assert.equal(buildBusinessReport(state(['organization.read']),clients),null);
 assert.equal(buildBusinessReport({...state(),identity:{role:'coach'}},clients),null);
 const r=buildBusinessReport(state(['analytics.read']),clients);assert.equal(r.groups.length,1);
 assert.equal(buildBusinessReport({...state(['analytics.read']),admin:{...state(['analytics.read']).admin,analytics:{}}},clients).groups[0].rows[0].value,null);
});
