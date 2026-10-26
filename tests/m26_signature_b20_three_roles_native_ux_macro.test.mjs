import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clientWearableActivation} from '../src/m26/wearables/activation-experience.js';
import {buildWearableViewModel} from '../src/m26/wearables/view-model.js';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';
const UUID='10000000-0000-4000-8000-000000000001';
const native={location:{origin:'https://app.iberfit.cl'},
 IBERFIT_CONNECTED360_NATIVE:{postMessage(){},addEventListener(){}}};
const clientView=(wearables)=>({role:'client',clients:[{
 id:UUID,name:'Cliente',serviceActive:true,
}],serviceKind:'training',appointments:[],upcoming:[],rc39:{sessionProjections:[]},
wearables,clientGuide:{communicationAvailable:false},operations:{}});
test('B20 native readiness is exact pinned Android transport, not a browser guess',()=>{
 const base=buildWearableViewModel({role:'client',scope:{}});
 assert.equal(base.productionNativeReady,false);
 const ready=buildWearableViewModel({role:'client',scope:native});
 assert.equal(ready.productionNativeReady,true);
 assert.equal(ready.connections.length,0);
 assert.equal(buildWearableViewModel({role:'coach',scope:native}).productionNativeReady,false);
 const forged={...native,location:{origin:'https://m26-canary.iberfit.cl'}};
 assert.equal(buildWearableViewModel({role:'client',scope:forged}).productionNativeReady,false);
});
test('B20 first access invites one explicit consent route, never grants it implicitly',()=>{
 const ready=clientWearableActivation({productionNativeReady:true,summary:{daysWithData:0},connections:[]});
 assert.equal(ready.kind,'consent');assert.equal(ready.cta,true);
 assert.equal(ready.label,undefined,'copy belongs to the translated render surface');
 assert.equal(clientWearableActivation({productionNativeReady:false}).cta,false);
});
test('B20 no repeated prompt after confirmed data, certified grant or revocation',()=>{
 assert.equal(clientWearableActivation({
 productionNativeReady:true,summary:{daysWithData:3},connections:[],
 }).kind,'observed');
 assert.equal(clientWearableActivation({
 productionNativeReady:true,summary:{daysWithData:0},connections:[
 {status:'conectado',mode:'certified_native',policy:{productionAllowed:true}}],
 }).kind,'linked');
 assert.equal(clientWearableActivation({
 productionNativeReady:true,summary:{daysWithData:0},connections:[
 {status:'revocado',mode:'certified_native',policy:{productionAllowed:true}}],
 }).kind,'blocked');
});
test('B20 client Home renders a secondary activation action without hijacking primary',()=>{
 const before={productionNativeReady:true,summary:{daysWithData:0},connections:[],providers:[]};
 const html=renderHoyRoute(clientView(before));
 assert.match(html,/data-client-wearable-activation="consent"/);
 assert.match(html,/Elegir qué compartir/);
 assert.match(html,/data-m26-area="actividad"/);
 assert.match(html,/m26-client-home-primary-zone/);
 assert.doesNotMatch(html,/data-wearable-action="connect-auto"/);
 const noNative=renderHoyRoute(clientView({...before,productionNativeReady:false}));
 assert.doesNotMatch(noNative,/data-client-wearable-activation="consent"/);
});
test('B20 Client and Coach session routes retain role separation, no false start',()=>{
 const client=renderRc39Route({kind:'sesion',role:'client',serviceActive:false,
   rc39:{role:'client',sessionProjections:[]},selectedClient:{}});
 assert.match(client,/data-signature-session-guidance="empty"/);
 assert.doesNotMatch(client,/data-workflow-action="open-session-builder"/);
 const coach=renderRc39Route({kind:'sesion',role:'coach',serviceActive:true,
   rc39:{role:'coach',sessionProjections:[]},selectedClient:{}});
 assert.match(coach,/data-workflow-action="open-session-builder"/);
 assert.doesNotMatch(coach,/data-signature-session-guidance=/);
});
test('B20 Coach builder offers one truthful progression without skip-publishing',()=>{
 const catalog={facets:{patterns:[],equipment:[],difficulty:[],intent:[]},
   has:()=>false,get:()=>null,search:()=>[]};
 const draft={id:'draft',clientId:UUID,title:'Sesión',durationMinutes:50,
   deliveryModality:'guiada_en_app',previewAccepted:false,blocks:[]};
 const html=renderSessionBuilder({draft,catalog,role:'coach'});
 assert.match(html,/data-session-builder-flow="start"/);
 assert.match(html,/Objetivo y modalidad/);
 assert.match(html,/Revisar antes de publicar/);
 assert.doesNotMatch(html,/data-session-action="publish"/);
});
test('B20 visual refinements isolate Client, Coach and Admin and handle touch',()=>{
 const source=readFileSync(new URL('../src/m26/design/signature-ux-v2.css',import.meta.url),'utf8');
 assert.match(source,/SIGNATURE B20/);
 assert.match(source,/data-m26-role="client"/);
 assert.match(source,/data-m26-role="coach"/);
 assert.match(source,/data-m26-role="admin"/);
 assert.match(source,/@media\(max-width:680px\)/);
 assert.match(source,/@media\(forced-colors:active\)/);
});
