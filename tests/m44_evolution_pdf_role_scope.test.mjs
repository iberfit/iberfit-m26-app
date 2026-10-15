import test from 'node:test';
import assert from 'node:assert/strict';
import {evolutionPdfActionScope as scope} from '../src/m26/workflows/evolution-pdf-access.js';

const client='11111111-1111-4111-8111-111111111111';
const report='22222222-2222-4222-8222-222222222222';
const source={
 collections:{
   clients:[{id:client}],
   reports:[{id:report,clientId:client,status:'publicado'}],
 }
};
const decide=(role,action,override={})=>scope({state:source,role,action,clientId:client,reportId:report,...override});
test('M44 approved manager opens versioned issued PDF and accesses history',()=>{
 for(const role of ['coach','admin']){
   for(const action of ['issue','open','history'])assert.equal(decide(role,action).allowed,true,role+':'+action);
 }
});
test('M44 Cliente reads published PDF/history but cannot issue or withdraw as Coach',()=>{
 for(const role of ['client','cliente']){
   assert.equal(decide(role,'open').allowed,true);
   assert.equal(decide(role,'history').allowed,true);
   assert.equal(decide(role,'issue').code,'M44_PDF_ISSUE_ROLE_DENIED');
 }
 assert.equal(decide('guest','open').allowed,false);
 assert.equal(decide('client','withdraw').allowed,false);
});
test('M44 private drafts/withdrawn reports never get a PDF opening action',()=>{
 for(const status of ['borrador','aprobado','retirado','pending']){
   const state={collections:{...source.collections,reports:[{id:report,clientId:client,status}]}};
   assert.equal(decide('coach','issue',{state}).code,'M44_PDF_PUBLISHED_REPORT_REQUIRED');
   assert.equal(decide('client','open',{state}).code,'M44_PDF_PUBLISHED_REPORT_REQUIRED');
   assert.equal(decide('client','history',{state}).code,'M44_PDF_PUBLISHED_REPORT_REQUIRED');
   assert.equal(decide('admin','history',{state}).allowed,true);
 }
});
test('M44 report and client scope fail closed even if another report ID is known',()=>{
 const outsider='33333333-3333-4333-8333-333333333333';
 assert.equal(decide('admin','open',{reportId:outsider}).code,'M44_PDF_REPORT_NOT_VISIBLE');
 assert.equal(decide('client','open',{clientId:outsider}).code,'M44_PDF_REPORT_NOT_VISIBLE');
 assert.equal(decide('coach','open',{clientId:outsider}).code,'M44_PDF_CLIENT_SCOPE_DENIED');
 assert.equal(decide('admin','open',{state:{collections:{clients:[],reports:source.collections.reports}}}).code,'M44_PDF_CLIENT_SCOPE_DENIED');
});
test('M44 real controller connects all PDF actions through shared role/scope policy',async()=>{
 const {readFile}=await import('node:fs/promises');
 const code=await readFile(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
 assert.match(code,/import \{evolutionPdfActionScope\} from '\.\.\/workflows\/evolution-pdf-access\.js'/);
 assert.match(code,/action:'history'/);
 assert.match(code,/action:issue\?'issue':'open'/);
 assert.doesNotMatch(code,/if\(!\['client','cliente'\]\.includes\(role\)\|\|!clientId\)throw new Error\('M44_PDF_CLIENT_ACCESS_REQUIRED'\)/);
});
