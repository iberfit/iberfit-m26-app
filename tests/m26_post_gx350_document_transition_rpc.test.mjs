import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createM26Transport,M26_QA_PROJECT_REF,M26_PRODUCTION_PROJECT_REF} from '../src/m26/supabase-transport.js';
import {verifyConnected360DocumentTransitionReceipt} from '../src/m26/wearables/document-consent-contract.js';
const reportId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',operationId='33333333-3333-4333-8333-333333333333';
const args={reportId,requestId,operationId,reportRevision:2,action:'publish',previewConfirmed:true};
const receipt={schema:'iberfit.connected360.document-transition.v1',reportId,requestId,operationId,revision:3,status:'publicado'};
const qa={enabled:true,qaOnly:true,host:'m26-canary.iberfit.cl',canary:true,projectRef:M26_QA_PROJECT_REF,url:`https://${M26_QA_PROJECT_REF}.supabase.co`,publishableKey:'sb_publishable_QA_test_not_a_real_key'};
function fixture({runtime=qa,enabled=true,reply=receipt}={}){
 const calls=[];const transport=createM26Transport(runtime,{connected360DocumentCandidate:enabled,fetchImpl:async(url,init)=>{
 calls.push({path:new URL(url).pathname,body:JSON.parse(init.body),auth:init.headers.authorization,cache:init.cache});return {ok:true,status:200,headers:{get:k=>k==='content-type'?'application/json':null},json:async()=>reply};
 }});return {transport,calls};
}
test('QA transition sends only exact identities, CAS, operation and explicit preview; no evidence or arbitrary command',async()=>{
 const {transport,calls}=fixture();assert.deepEqual(await transport.connected360DocumentCandidateTransition('token',args),receipt);
 assert.deepEqual(calls,[{path:'/rest/v1/rpc/iberfit_gx_document_transition_v1',body:{p_report:reportId,p_request:requestId,p_expected_revision:2,p_operation:operationId,p_action:'publish',p_preview_confirmed:true},auth:'Bearer token',cache:'no-store'}]);
});
test('approval has independent exact private acknowledgement',async()=>{
 const approved={...receipt,revision:2,status:'aprobado'};const {transport}=fixture({reply:approved});assert.deepEqual(await transport.connected360DocumentCandidateTransition('token',{...args,reportRevision:1,action:'approve',previewConfirmed:false}),approved);
});
test('reject cross-report, cross-request, operation substitution, stale revision and extra claims',()=>{
 for(const r of [{...receipt,reportId:requestId},{...receipt,requestId:reportId},{...receipt,operationId:requestId},{...receipt,revision:2},{...receipt,revision:'3'},{...receipt,status:'aprobado'},{...receipt,authorized:true},{...receipt,duplicate:true},[receipt]])assert.throws(()=>verifyConnected360DocumentTransitionReceipt(r,args),/RECEIPT_INVALID/);
});
test('no network with no explicit preview, invalid inputs, disabled QA or production runtime',async()=>{
 const f=fixture();for(const a of [{...args,previewConfirmed:false},{...args,operationId:null},{...args,reportRevision:2147483647},{...args,action:'retire'}])await assert.rejects(f.transport.connected360DocumentCandidateTransition('token',a),/ARGUMENTS_INVALID/);assert.equal(f.calls.length,0);
 for(const g of [fixture({enabled:false}),fixture({runtime:{...qa,qaOnly:false,projectRef:M26_PRODUCTION_PROJECT_REF,url:`https://${M26_PRODUCTION_PROJECT_REF}.supabase.co`}})]){await assert.rejects(g.transport.connected360DocumentCandidateTransition('token',args),/QA_ONLY/);assert.equal(g.calls.length,0);}
});
test('invalid receipt never causes automatic second dispatch',async()=>{
 const {transport,calls}=fixture({reply:{...receipt,revision:4}});await assert.rejects(transport.connected360DocumentCandidateTransition('token',args),/RECEIPT_INVALID/);assert.equal(calls.length,1);
});
test('staged facade requires live Coach and retains all three closed fences and no grants',()=>{
 const sql=readFileSync(new URL('../supabase/release-procedures/gx_connected360_document_transition_rpc_staged_v1.sql',import.meta.url),'utf8');
 for(const s of ['gx_document_canonical_closed_v1','gx_document_projected_closed_v1','gx_document_issuance_closed_v1','m26_v49_live_session() IS DISTINCT FROM true',"role::text='admin'",'RETURN private.gx_document_apply_transition_v1(p_report,p_request,p_expected_revision,p_operation,p_action,p_preview_confirmed)','FROM PUBLIC,anon,authenticated,service_role'])assert.ok(sql.includes(s),s);
 assert.doesNotMatch(sql,/GRANT EXECUTE|DROP CONSTRAINT|UPDATE public\.|INSERT INTO|DELETE FROM/);
 const rollback=readFileSync(new URL('../supabase/release-procedures/gx_connected360_document_transition_rpc_staged_v1.rollback.sql',import.meta.url),'utf8');assert.match(rollback,/DROP FUNCTION public\.iberfit_gx_document_transition_v1\(uuid,uuid,integer,uuid,text,boolean\) RESTRICT/);
});
