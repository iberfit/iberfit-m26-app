import test from 'node:test';
import assert from 'node:assert/strict';
import {mountDocumentConsentPanel} from '../src/m26/wearables/document-consent-panel.js';
const clientId='11111111-1111-4111-8111-111111111111',reportId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333',op='44444444-4444-4444-8444-444444444444';
const item={requestId,reportId,reportRevision:1,provider:'apple_health',periodStart:'2026-11-21',periodEnd:'2026-11-27',revision:0,decision:'pending'};
const digest='a'.repeat(64);
const preview={reportTitle:'Semana',coachName:'Entrenador',reportType:'weekly',evidence:{schema:'iberfit.connected360.report-observations.v1',provider:item.provider,periodStart:item.periodStart,periodEnd:item.periodEnd,coverage:'observed-only',observedDays:2,disciplines:[{sport:'running',observedDays:2}],evidenceSha256:digest}};
const receipt=(i=item,p=preview)=>({schema:'iberfit.connected360.document-review.v1',...i,clientId,draftSha256:digest,evidenceSha256:digest,preview:p});
const page=(i=item)=>({schema:'iberfit.connected360.document-inbox.v1',clientId,after:null,items:[i],nextAfter:null});
function fixture(overrides={}){
 const doc={visibilityState:'visible',createElement(tag){return new Node(tag);}};
 class Node{
  constructor(tag){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.events={};this.disabled=false;this.checked=false;this.textContent='';}
  get isConnected(){return this===host||!!this.parent?.isConnected;}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.append(...nodes);}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}}
  setAttribute(){} addEventListener(k,fn){this.events[k]=fn;}
  async click(){if(!this.disabled)await this.events.click?.();}
  find(pred){if(pred(this))return this;for(const n of this.children){const found=n.find(pred);if(found)return found;}}
 }
 const host=new Node('host');let current=true;const calls=[];
 const api={available:()=>true,inbox:async args=>{calls.push(['inbox',args]);return page();},review:async args=>{calls.push(['review',args]);return receipt(item,args.preview?preview:null);},decide:async args=>{calls.push(['decide',args]);return {requestId,operationId:op,revision:1,decision:args.params.p_decision,duplicate:false};},...overrides};
 const panel=mountDocumentConsentPanel(host,{clientId,api,stillCurrent:()=>current,now:()=>new Date('2026-11-28T12:00:00Z'),operationId:()=>op});
 return {panel,host,calls,api,find:text=>host.find(n=>n.textContent===text),check:()=>{const n=host.find(n=>n.tag==='input');n.checked=true;n.events.change();},retireScope:()=>{current=false;}};
}
async function open(f){await f.find('Consultar autorizaciones').click();await f.find('Revisar solicitud').click();}
test('disabled adapter never mounts or makes a request',()=>{const f=fixture({available:()=>false});assert.equal(f.panel,null);assert.equal(f.host.children.length,0);assert.equal(f.calls.length,0);});
test('demand only, explicit confirmation and exact decision receipt',async()=>{const f=fixture();assert.equal(f.calls.length,0);await open(f);assert.ok(f.find('Autorizar inclusión').disabled);await f.find('Autorizar inclusión').click();assert.equal(f.calls.length,2);f.check();await f.find('Autorizar inclusión').click();assert.equal(f.calls.length,3);assert.deepEqual(f.calls[2][1].params,{p_request:requestId,p_expected_revision:0,p_operation:op,p_decision:'accepted',p_draft_sha:digest,p_evidence_sha:digest});assert.ok(f.find('Decisión registrada. Consulta de nuevo las autorizaciones para ver el estado actualizado.'));});
test('unavailable preview allows only explicit rejection',async()=>{const f=fixture({review:async args=>{if(args.preview)throw Error('stale');return receipt(item,null);}});await open(f);assert.equal(f.find('Autorizar inclusión'),undefined);assert.ok(f.find('No autorizar').disabled);f.check();await f.find('No autorizar').click();assert.equal(f.calls.at(-1)[1].params.p_decision,'declined');});
test('changed receipt invalidates actions',async()=>{const f=fixture({review:async()=>receipt({...item,decision:'accepted',revision:1},null)});await open(f);assert.ok(f.find('La solicitud cambió. Actualiza el listado antes de decidir.'));assert.equal(f.find('Retirar autorización'),undefined);});
test('withdrawal does not require provider preview',async()=>{const accepted={...item,decision:'accepted',revision:1};const f=fixture({inbox:async()=>page(accepted),review:async args=>{assert.equal(args.preview,false);return receipt(accepted,null);},decide:async({params})=>({requestId,operationId:op,revision:2,decision:params.p_decision,duplicate:false})});await open(f);assert.ok(f.find('Retirar autorización').disabled);f.check();await f.find('Retirar autorización').click();assert.ok(f.find('Decisión registrada. Consulta de nuevo las autorizaciones para ver el estado actualizado.'));});
test('retiring aborts request and ignores late result',async()=>{let resolve,signal;const f=fixture({inbox:args=>{signal=args.signal;return new Promise(r=>resolve=r);}});const pending=f.find('Consultar autorizaciones').click();f.panel.retire();assert.equal(signal.aborted,true);resolve(page());await pending;assert.equal(f.host.children.length,0);});
test('ambiguous decision response never claims success or automatically retries',async()=>{let writes=0;const f=fixture({decide:async()=>{writes++;throw Error('lost');}});await open(f);f.check();await f.find('Autorizar inclusión').click();assert.equal(writes,1);assert.ok(f.find('No se pudo confirmar el resultado. Consulta de nuevo las autorizaciones antes de repetir la decisión.'));assert.equal(f.find('Autorizar inclusión'),undefined);});
test('identity change discards pending result',async()=>{let resolve;const f=fixture({inbox:()=>new Promise(r=>resolve=r)});const pending=f.find('Consultar autorizaciones').click();f.retireScope();resolve(page());await pending;assert.equal(f.host.children.length,0);});
