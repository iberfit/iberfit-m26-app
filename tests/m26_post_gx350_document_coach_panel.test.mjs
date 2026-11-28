import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {documentCoachReportScope,sameDocumentCoachScope,mountDocumentCoachPanel} from '../src/m26/wearables/document-coach-panel.js';
const clientId='11111111-1111-4111-8111-111111111111',reportId='22222222-2222-4222-8222-222222222222',actorId='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',lease={};
const report={id:reportId,clientId,revision:2,status:'borrador',body:{reportType:'weekly',visibleToClient:false}};
const state={activeArea:'informes',hydration:{status:'ready'},identity:{id:actorId,role:'coach'},selectedClientId:clientId,collections:{clients:[{id:clientId}],reports:[report]}};
const scope=(s=state,auth={actorId,lease})=>documentCoachReportScope(s,reportId,auth);
test('only confirmed private weekly draft for selected client and Coach receives a scope',()=>{
 assert.deepEqual(scope(),{actorId,lease,role:'coach',clientId,reportId,reportRevision:2});
 for(const s of [{...state,activeArea:'sesion'},{...state,hydration:{status:'loading'}},{...state,identity:{id:actorId,role:'admin'}},{...state,selectedClientId:other},{...state,identity:{role:'coach'}}])assert.equal(scope(s),null);
 for(const r of [{...report,revision:0},{...report,clientId:other},{...report,status:'publicado'},{...report,body:{...report.body,reportType:'reassessment'}},{...report,body:{...report.body,visibleToClient:true}},{...report,body:{...report.body,clientId:other}},{...report,body:{...report.body,revision:3}},{...report,createdBy:other},{...report,audience:'cliente'}])assert.equal(scope({...state,collections:{...state.collections,reports:[r]}}),null);
 assert.equal(scope({...state,collections:{...state.collections,reports:[report,report]}}),null);assert.equal(scope(state,{actorId,lease:null}),null);
 assert.equal(sameDocumentCoachScope(scope(),scope()),true);assert.equal(sameDocumentCoachScope(scope(),{...scope(),lease:{}}),false);assert.equal(sameDocumentCoachScope(scope(),{...scope(),reportRevision:3}),false);
});
function fixture({enabled=true,online=true,request}={}){
 const doc={createElement(tag){return new Node(tag);}};
 class Node{constructor(tag){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.events={};this.disabled=false;this.checked=false;this.textContent='';}
  get isConnected(){return this===host||!!this.parent?.isConnected;}append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}remove(){if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}}setAttribute(){}addEventListener(k,fn){this.events[k]=fn;}
  async click(){if(!this.disabled)await this.events.click?.();}find(pred){if(pred(this))return this;for(const n of this.children){const found=n.find(pred);if(found)return found;}}
 }
 const host=new Node('host'),calls=[];let current=true;
 const panel=mountDocumentCoachPanel(host,{api:{available:()=>enabled,request:async args=>{calls.push(args);return request?request(args):{decision:'pending'};}},stillCurrent:()=>current,isOnline:()=>online});
 const select=host.find(n=>n.tag==='select'),check=host.find(n=>n.tag==='input'),submit=host.find(n=>n.tag==='button'),status=host.find(n=>n.tag==='p'&&n.textContent==='');
 return {panel,host,calls,select,check,submit,status,change(value){select.value=value;select.events.change();},confirm(){check.checked=true;check.events.change();},switchScope(){current=false;}};
}
test('closed harness mounts nothing',()=>{const f=fixture({enabled:false});assert.equal(f.panel,null);assert.equal(f.host.children.length,0);});
test('provider choice and explicit confirmation required; changing provider resets consent',async()=>{const f=fixture();assert.equal(f.calls.length,0);f.confirm();await f.submit.click();assert.equal(f.calls.length,0);f.change('apple_health');f.confirm();f.change('health_connect');assert.equal(f.submit.disabled,true);f.confirm();await f.submit.click();assert.equal(f.calls.length,1);assert.equal(f.calls[0].provider,'health_connect');assert.equal(f.calls[0].confirmed,true);assert.equal(f.submit.disabled,true);assert.match(f.status.textContent,/pendiente/);});
test('historical decisions are not a current publication permission',async()=>{for(const decision of ['accepted','declined','withdrawn']){const f=fixture({request:async()=>({decision})});f.change('apple_health');f.confirm();await f.submit.click();assert.equal(f.calls.length,1);assert.match(f.status.textContent,decision==='accepted'?/requiere comprobar/:decision==='declined'?/no autorizó/:/retiró/);}});
test('no request offline, lost response requires explicit retry and no optimistic success',async()=>{const offline=fixture({online:false});offline.change('apple_health');offline.confirm();await offline.submit.click();assert.equal(offline.calls.length,0);assert.match(offline.status.textContent,/Sin conexión/);const f=fixture({request:async()=>{throw Error('lost');}});f.change('apple_health');f.confirm();await f.submit.click();assert.equal(f.calls.length,1);assert.match(f.status.textContent,/No se pudo confirmar/);assert.equal(f.submit.disabled,true);});
test('in flight duplicate prevented, late response discarded and panel retired',async()=>{let finish;const f=fixture({request:()=>new Promise(r=>finish=r)});f.change('apple_health');f.confirm();const pending=f.submit.click();await f.submit.click();assert.equal(f.calls.length,1);f.switchScope();f.panel.retire();assert.equal(f.calls[0].signal.aborted,true);finish({decision:'accepted'});await pending;assert.equal(f.host.children.length,0);});
test('application uses exact QA transport, confirmed store and existing assurance; controller retires on destroy',()=>{const app=readFileSync('src/m26/app/application.js','utf8'),controller=readFileSync('src/m26/app/workflow-controller.js','utf8');assert.match(app,/const documentCoachApiForReport=transport\?\.connected360DocumentCandidateAvailable\?\.\(\)===true/);assert.match(app,/documentCoachReportScope\(store\.getState\(\),reportId/);assert.match(app,/sameDocumentCoachScope\(scope,readScope\(\)\)/);assert.match(app,/ensureAssurance:\(token,userId\)=>ensurePrivilegedActionAssurance/);assert.match(controller,/mountDocumentCoachPanel\(card,\{\.\.\.binding,isOnline\}\)/);assert.match(controller,/documentCoachPanels\.values\(\)\)panel\.retire/);});

test('approved weekly report derives publish request only from one exact canonical marker',()=>{
 const approved={...report,status:'aprobado',body:{...report.body,evidence:[{source:`connected360:apple_health:${other}`} ]}};
 const stateFor=r=>({...state,collections:{...state.collections,reports:[r]}});
 assert.deepEqual(scope(stateFor(approved)),{actorId,lease,role:'coach',clientId,reportId,reportRevision:2,status:'aprobado',requestId:other});
 assert.equal(scope(stateFor({...approved,body:{...approved.body,evidence:[]}})),null);
 assert.equal(scope(stateFor({...approved,evidence:[{source:`connected360:health_connect:${reportId}`}]})),null);
});
