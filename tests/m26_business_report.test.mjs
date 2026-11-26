import test from 'node:test';import assert from 'node:assert/strict';
import {projectAdminSnapshot} from '../src/m26/admin/admin-state.js';
import {buildBusinessReport,buildBusinessReportHtml,openBusinessReport} from '../src/m26/admin/business-report.js';
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

test('management report uses an inert parsed DOM, keeps print action and isolates the opener',()=>{
 const report=buildBusinessReport(state(),clients);let parsedHtml,handler,printed=0,closed=0,replaced;
 const element={querySelector:selector=>selector==='#print'?{}:null};
 const doctype={name:'html'};
 const doc={importNode:(node,deep)=>{assert.equal(node,element);assert.equal(deep,true);return element;},
  implementation:{createDocumentType:(name,pub,sys)=>{assert.deepEqual([name,pub,sys],['html','','']);return doctype;}},
  replaceChildren:(...nodes)=>{replaced=nodes;},getElementById:id=>{assert.equal(id,'print');return {addEventListener:(type,fn)=>{assert.equal(type,'click');handler=fn;}};}};
 const popup={opener:{},document:doc,print:()=>{printed++;},close:()=>{closed++;}};
 const scope={location:{origin:'https://app.iberfit.cl'},open:(url,target)=>{assert.deepEqual([url,target],['about:blank','_blank']);return popup;},DOMParser:class{parseFromString(html,type){assert.equal(type,'text/html');assert.equal(popup.opener,null);parsedHtml=html;return {documentElement:element};}}};
 assert.equal(openBusinessReport(report,scope),true);assert.deepEqual(replaced,[doctype,element]);assert.match(parsedHtml,/href="https:\/\/app\.iberfit\.cl\/m26\/business-report\.css/);
 assert.doesNotMatch(parsedHtml,/<script\b|\sonclick\s*=|PRIVATE NAME/iu);handler();assert.equal(printed,1);assert.equal(closed,0);
});
test('management report fails closed on blocked popup or parser failure',()=>{
 const report=buildBusinessReport(state(),clients);
 assert.throws(()=>openBusinessReport(report,{location:{origin:'https://app.iberfit.cl'},open:()=>null}),/POPUP_BLOCKED/);
 let closed=0;const popup={opener:{},close:()=>{closed++;}};
 assert.throws(()=>openBusinessReport(report,{location:{origin:'https://app.iberfit.cl'},open:()=>popup,DOMParser:class{parseFromString(){throw Error('parse failed');}}}),/parse failed/);
 assert.equal(popup.opener,null);assert.equal(closed,1);
});
