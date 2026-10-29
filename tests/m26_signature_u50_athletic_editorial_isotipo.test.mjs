import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const read=(p)=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const base=(over={})=>({
 role:'client',serviceKind:'training',clients:[{id:'d3b09ac0-93e4-4ba8-ae12-998d105ee5c3',name:'Cliente QA',serviceActive:true,cycle:{name:'Plan'}}],
 appointments:[],upcoming:[],rc39:{sessionProjections:[]},operations:{},...over
});
test('U50 shows optional real avatar and three actionable routes without inventing progress',()=>{
 const h=renderHoyRoute(base());
 assert.ok(h.includes('data-iberfit-avatar-client="d3b09ac0-93e4-4ba8-ae12-998d105ee5c3"'));
 assert.ok(h.includes('data-client-home-compass'));
 for(const area of ['sesion','progreso','actividad']) assert.ok(h.includes('data-m26-area="'+area+'"'));
 for(const label of ['Entreno','Evolución','Bienestar']) assert.ok(h.includes(label));
 assert.equal(h.split('data-workflow-action="start-published-session"').length-1,0);
});
test('U50 compass never authorizes a start; only canonical ready session does',()=>{
 const p={id:'s1',visible:true,canClientStart:true,session:{title:'Entreno QA'}};
 const h=renderHoyRoute(base({rc39:{sessionProjections:[p]}}));
 assert.equal(h.split('data-workflow-action="start-published-session"').length-1,1);
 assert.ok(h.includes('data-entity-id="s1"'));
});
test('U50 preserves separate Solo IRI and no training shortcut',()=>{
 const h=renderHoyRoute(base({serviceKind:'iri_only'}));
 assert.ok(!h.includes('data-client-home-compass'));
 assert.ok(!h.includes('data-workflow-action="start-published-session"'));
 assert.ok(h.includes('Diagnóstico IRI'));
});
test('U50 uses official art, scoped role styling, touch/focus and reduced motion',()=>{
 const css=read('../src/m26/design/iberfit-premium-v3.css');
 const part=css.slice(css.indexOf('/* SIGNATURE U50 · Athletic Editorial:'));
 assert.ok(part.startsWith('/* SIGNATURE U50'));
 assert.ok(part.includes("url('/public/isotipo-iberfit.png')"));
 for(const role of ['client','coach','admin']) assert.ok(part.includes('data-m26-role="'+role+'"'));
 for(const key of ['max-width:360px','prefers-reduced-motion:reduce','forced-colors:active','focus-visible']) assert.ok(part.includes(key));
 assert.ok(!part.includes('!important')&&!part.includes('position:fixed'));
 const brand=JSON.parse(read('../src/m26/design/brand-truth.json'));
 assert.equal(brand.officialAsset.path,'public/isotipo-iberfit.png');
 assert.ok(read('../src/m26/profile/client-avatar.js').includes('data-iberfit-avatar-image'));
});
