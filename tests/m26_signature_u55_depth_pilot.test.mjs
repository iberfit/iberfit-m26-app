import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const css=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
const start=css.indexOf('/* SIGNATURE U55 · Elevated athletic depth');
const end=css.indexOf('/* SIGNATURE B6 · Atelier Cliente');
const scope=css.slice(start,end);

function lum(hex){
 const vals=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return vals[0]*.2126+vals[1]*.7152+vals[2]*.0722;
}
function contrast(a,b){
 const [x,y]=[lum(a),lum(b)].sort((a,b)=>b-a);
 return (x+.05)/(y+.05);
}
test('U55 scopes premium depth to authenticated roles and keeps B6 contract',()=>{
 assert.ok(start>0&&end>start);
 assert.match(scope,/data-m26-role="client"/u);
 assert.match(scope,/data-m26-role="coach"/u);
 assert.match(scope,/data-m26-role="admin"/u);
 for(const token of ['m26-client-home-stage','m26-client-home-primary-zone','m26-client-home-compass','m26-coach-home-glance','m26-admin-user360-overview'])assert.ok(scope.includes(token),token);
 assert.ok(!scope.includes('!important'),'No specificity bypasses in the new component system');
 assert.ok(!scope.includes('position:fixed'));
 assert.ok(!scope.includes('backdrop-filter'));
 assert.ok(!scope.includes('http://')&&!scope.includes('https://'));
});
test('U55 intentional gold CTA retains WCAG text contrast',()=>{
 assert.ok(contrast('#172D23','#D2B275')>=4.5);
 assert.ok(contrast('#F2E7D6','#173528')>=4.5);
 assert.ok(contrast('#183729','#E9E2D3')>=7);
 assert.match(scope,/background:linear-gradient\(125deg,#E7C98B,#D2B275 85%\)/u);
 assert.match(scope,/color:#172D23/u);
});
test('U55 maintains 320-390 responsive touch, focus and vision accessibility',()=>{
 assert.match(scope,/@media\(max-width:350px\)/u);
 assert.match(scope,/@media\(max-width:680px\)/u);
 assert.match(scope,/@media\(prefers-reduced-motion:reduce\)/u);
 assert.match(scope,/@media\(forced-colors:active\)/u);
 assert.match(scope,/min-height:76px/u);
 assert.match(scope,/min-height:86px/u);
});
test('U55 authentic primary actions survive for Coach and Client',()=>{
 const c=renderHoyRoute({role:'client',serviceKind:'training',clients:[{id:'c1',name:'Cliente',serviceActive:true}],appointments:[],upcoming:[],rc39:{sessionProjections:[]},operations:{}});
 for(const d of ['sesion','progreso','actividad'])assert.ok(c.includes('data-m26-area="'+d+'"'));
 assert.ok(c.includes('data-iberfit-avatar-client="c1"'));
 assert.ok(c.includes('data-m26-area="actividad"'));
 const coach=renderHoyRoute({role:'coach',clients:[{id:'c1',name:'Cliente'}],appointments:[],upcoming:[],operations:{},coachCockpit:{totalClients:1,attentionCount:0,items:[]}});
 assert.ok(coach.includes('m26-coach-home-glance'));
 assert.ok(coach.includes('m26-coach-launch-self-slot'));
 assert.ok(coach.includes('m26-coach-home-quick'));
});

test('U55 final QA uses full-width lone Client stat and compact Admin filters',()=>{
 assert.match(scope,/m26-athletic-facts:has\(>\.m26-athletic-fact:only-child\)/u);
 assert.match(scope,/m26-athletic-fact:only-child\{/u);
 assert.match(scope,/m26-admin-user-directory-tools\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u);
});
test('U55 Coach quick actions stay accessible with compact on-screen labels',()=>{
 const html=renderHoyRoute({role:'coach',clients:[{id:'coach-client',name:'Cliente QA'}],appointments:[],upcoming:[],operations:{},coachCockpit:{totalClients:1,attentionCount:0,items:[]}});
 assert.ok(html.includes('aria-label="Programar entrenamiento"'));
 assert.ok(html.includes('<strong>Programar entrenamiento</strong>'));
 assert.ok(html.includes('data-m26-area="planificacion"'));
 assert.match(scope,/m26-coach-home-quick button:first-child/u);
});

test('U56 role-specific editorial entrance stays bounded, tactile and accessible',()=>{
 const u56Start=css.indexOf('/* SIGNATURE U56 · High-density editorial finish');
 assert.ok(u56Start>css.indexOf('/* SIGNATURE B6 · Atelier Cliente'),'U56 optical finish must follow the B6 canonical layout, not be overridden');
 const u56=css.slice(u56Start);
 assert.ok(u56.length>1500,'U56 stays inside the canonical visual pilot');
 for(const marker of ['m26-client-home-greeting h2','m26-coach-home-command-copy h2','m26-admin-user360-overview','m26-athletic-chart-last-halo'])assert.ok(u56.includes(marker),marker);
 assert.match(u56,/@media\(prefers-reduced-motion:reduce\)/u);
 assert.match(u56,/@media\(forced-colors:active\)/u);
 assert.match(u56,/@media\(max-width:680px\)/u);
 assert.doesNotMatch(u56,/position:fixed|backdrop-filter|!important|https?:\/\//u);
});
