import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const read=(p)=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const vm=(other={})=>({role:'client',serviceKind:'training',clients:[{id:'c1',name:'Cliente QA',serviceActive:true}],appointments:[],upcoming:[],operations:{},rc39:{sessionProjections:[]},...other});
test('U51 Client has one coherent hero and three real navigation routes, not fake training',()=>{
 const h=renderHoyRoute(vm());
 assert.ok(h.includes('m26-client-home-stage'));
 assert.ok(h.indexOf('m26-client-home-feature')>h.indexOf('m26-client-home-stage'));
 assert.ok(h.indexOf('data-client-home-compass')>h.indexOf('m26-client-home-feature'));
 assert.ok(h.indexOf('data-client-home-compass')<h.indexOf('m26-client-home-glance'));
 assert.ok(h.includes('data-m26-area="sesion"'));
 assert.ok(h.includes('data-m26-area="progreso"'));
 assert.ok(h.includes('data-m26-area="actividad"'));
 assert.ok(h.includes('m26-client-home-method-disclosure'));
 assert.ok(h.indexOf('data-m26-client-health')<h.indexOf('m26-client-home-method-disclosure'));
 assert.ok(!h.includes('data-workflow-action="start-published-session"'));
 assert.ok(!h.includes('class="m26-client-home-status"'),'fallback CTA already communicates the next step');
 assert.ok(!h.includes('Un registro breve mantiene tu seguimiento al día.'),'avoid redundant welcome copy on a wellbeing CTA');
});
test('U51 never changes canonical session start authority or Solo IRI',()=>{
 const projection={id:'s1',visible:true,canClientStart:true,session:{title:'Fuerza QA'}};
 const h=renderHoyRoute(vm({rc39:{sessionProjections:[projection]}}));
 assert.equal(h.split('data-workflow-action="start-published-session"').length-1,1);
 const iri=renderHoyRoute(vm({serviceKind:'iri_only',rc39:{sessionProjections:[projection]}}));
 assert.ok(!iri.includes('data-client-home-compass'));
 assert.ok(!iri.includes('data-workflow-action="start-published-session"'));
});
test('U51 Coach portfolio attention is visibly proportional to confirmed client count',()=>{
 const h=renderHoyRoute({role:'coach',clients:[{id:'c1',name:'Cliente Uno'}],operations:{},appointments:[],upcoming:[],coachCockpit:{totalClients:2,attentionCount:1,items:[]}});
 assert.ok(h.includes('class="m26-coach-home-attention-meter"'));
 assert.ok(h.includes('max="2" value="1"'));
 assert.ok(h.includes('1 requiere atención'));
});
test('U51 Admin Coach bar is sourced only from recorded finite capacity',()=>{
 const s=read('../src/m26/admin/route-render.js');
 assert.ok(s.includes('item.loadPercent!=null&&Number.isFinite(load)&&load>=0'));
 assert.ok(s.includes('max="100"'));
 assert.ok(s.includes('aria-label="Carga de'));
 assert.ok(s.includes("Math.min(100,load)"));
});
test('U51 single canonical stylesheet preserves B6 and accessibility policies',()=>{
 const s=read('../src/m26/design/iberfit-premium-v3.css');
 const a=s.indexOf('/* SIGNATURE U51 · Authentic product composition');
 const b=s.indexOf('/* SIGNATURE B6 · Atelier Cliente');
 assert.ok(a>=0&&b>a);
 const part=s.slice(a,b);
 for(const item of ['m26-client-home-stage','m26-coach-home-command','m26-admin-user360-card','m26-admin-coach-load','max-width:360px','forced-colors:active','prefers-reduced-motion:reduce','focus-visible'])assert.ok(part.includes(item),item);
 assert.ok(!part.includes('!important'));
 assert.ok(!part.includes('position:fixed'));
 assert.ok(!part.includes('https://'));
 assert.ok(read('../src/m26/design/brand-truth.json').includes('public/isotipo-iberfit.png'));
 assert.ok(s.includes('.m26-admin-user360-overview > .m26-admin-stat:nth-child(2)'));
 assert.ok(s.includes('.m26-coach-home-glance :is(span,strong,small)'));
 assert.ok(s.includes('background:#EEE6D8!important'));
});

test('U54 authenticated atlas actions use genuine vector icons for Coach and Client',()=>{
 const coach=renderHoyRoute({role:'coach',clients:[{id:'c1',name:'Cliente'}],appointments:[],upcoming:[],operations:{},coachCockpit:{totalClients:1,attentionCount:0,items:[]}});
 assert.match(coach,/m26-atlas-coach-icon/u);
 assert.match(coach,/m26-atlas-icon-svg/u);
 assert.doesNotMatch(coach,/aria-hidden="true">◇/u);
 const client=renderHoyRoute(vm());
 assert.equal((client.match(/class="m26-atlas-client-icon"/gu)||[]).length,3);
});

test('U54 legacy dark CTA override excludes the gold Client hero',()=>{
 const css=read('../src/m26/design/iberfit-premium-v3.css');
 const general='.m26-shell .m26-workspace .m26-hoy-route .m26-today-action:not(.m26-client-home-stage .m26-today-action)';
 assert.ok(css.includes(general+'{'));
 assert.ok(css.includes(general+':hover:not(:disabled){'));
 assert.ok(!css.includes('.m26-hoy-route .m26-today-action{'));
 const hero='.m26-client-home-stage .m26-client-home-primary-zone .m26-today-action.is-primary';
 assert.ok(css.includes(hero+'{'));
 assert.ok(css.includes('background:#D9B979;color:#173025'));
 assert.ok(css.includes(hero+' :is(strong,small){'));
});
