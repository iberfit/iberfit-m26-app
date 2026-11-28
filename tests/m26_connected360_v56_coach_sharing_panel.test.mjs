import test from 'node:test';
import assert from 'node:assert/strict';
import {mountConnected360CoachSharingPanel} from '../src/m26/wearables/controller.js';
const clientId='11111111-1111-4111-8111-111111111111',coachId='22222222-2222-4222-8222-222222222222',assignmentId='33333333-3333-4333-8333-333333333333';
class Node{
 constructor(document,tag){this.ownerDocument=document;this.tag=tag;this.children=[];this.parent=null;this.dataset={};this.textContent='';this.events={};this.disabled=false;}
 get isConnected(){return this.tag==='root'||!!this.parent?.isConnected;}
 append(...nodes){for(const n of nodes){n.remove();n.parent=this;this.children.push(n);}}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}}
 replaceChildren(...nodes){for(const n of [...this.children])n.remove();this.append(...nodes);}
 contains(n){return this===n||this.children.some(x=>x.contains(n));}
 setAttribute(){} addEventListener(name,fn){this.events[name]=fn;}
 click(){if(!this.disabled)this.events.click?.();}
 find(label){return this.textContent===label?this:this.children.map(n=>n.find(label)).find(Boolean);}
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture({apple=true,enabled=true,recorded=false,readGate=null}={}){
 const doc={createElement:tag=>new Node(doc,tag)},root=new Node(doc,'root'),calls=[];
 let active=true;
 const data={ok:true,schema:apple?'iberfit.connected360.apple-coach-recipients.v1':'iberfit.connected360.coach-recipients.v1',clientId,purpose:apple?'coaching-apple-exercise-days-v1':'coaching-exercise-days-v1',...(apple?{provider:'apple_health'}:{}),recipients:[{coachId,assignmentId,displayName:'Coach prueba',eligible:true,recorded,effective:recorded,revision:recorded?2:0}]};
 const read=async(token,id,{signal})=>{calls.push({kind:'read',token,id,signal});if(readGate)await readGate;return data;};
 const write=async(token,decision,options)=>{calls.push({kind:'write',token,decision,options});};
 const wrong=()=>{throw Error('wrong provider');};
 const transport={connected360AppleCandidateAvailable:()=>enabled,connected360AppleCandidateCoachRecipients:apple?read:wrong,setConnected360AppleCandidateCoachConsent:apple?write:wrong,connected360ProductionCoachRecipients:apple?wrong:read,setConnected360ProductionCoachConsent:apple?wrong:write};
 const mount=()=>mountConnected360CoachSharingPanel(root,{provider:apple?'apple_health':'health_connect',clientId,stillCurrent:()=>active,getToken:async()=>'token',transport});
 return {root,calls,mount,expire:()=>{active=false;}};
}
test('Apple consent panel is gated, demand-only and requires a separate confirmation',async()=>{
 const disabled=fixture({enabled:false});assert.throws(()=>disabled.mount());assert.equal(disabled.calls.length,0);
 const x=fixture(),view=x.mount();assert.equal(x.calls.length,0);
 x.root.find('Gestionar permisos del entrenador').click();await flush();assert.equal(x.calls.length,1);
 x.root.find('Autorizar actividad compartida').click();assert.equal(x.calls.length,1);
 const confirm=x.root.find('Confirmar permiso');x.root.find('Cancelar').click();confirm.click();await flush();assert.equal(x.calls.length,1);
 x.root.find('Autorizar actividad compartida').click();x.root.find('Confirmar permiso').click();await flush();
 assert.equal(x.calls.length,2);assert.deepEqual(x.calls[1].decision,{coachId,assignmentId,expectedRevision:0,allow:true});assert.equal(x.calls[1].options.confirmed,true);view.retire();
});
test('shared panel withdraws only its provider and retires delayed reads',async()=>{
 const x=fixture({apple:false,recorded:true}),view=x.mount();
 x.root.find('Gestionar permisos del entrenador').click();await flush();x.root.find('Retirar permiso').click();x.root.find('Confirmar retirada').click();await flush();
 assert.deepEqual(x.calls[1].decision,{coachId,assignmentId:null,expectedRevision:2,allow:false});view.retire();
 let resolve;const gate=new Promise(r=>{resolve=r;});const y=fixture({readGate:gate}),stale=y.mount();
 y.root.find('Gestionar permisos del entrenador').click();await flush();assert.equal(y.calls.length,1);
 y.expire();stale.retire();assert.equal(y.calls[0].signal.aborted,true);resolve();await flush();assert.equal(y.root.children.length,0);
});
