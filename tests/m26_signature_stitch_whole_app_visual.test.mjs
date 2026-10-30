import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const read=()=>fs.readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
const visualPart=()=>read().split('SIGNATURE MASTER VISUAL U59 ·')[1]||'';
test('U59 one canonical role sheet for the full authenticated product, without new plugins',()=>{
 const s=visualPart();assert.ok(s.length>2500);
 for(const name of ['data-m26-role="client"','data-m26-role="coach"','data-m26-role="admin"','.m26-route-intro','.m26-panel-heading','.m26-panel','.m26-primary-action','.m26-admin-table'])assert.ok(s.includes(name),name);
 assert.doesNotMatch(s,/!important|position:fixed|z-index:\s*\d+|backdrop-filter|url\(|@import|display:none|pointer-events:none|linear-gradient|radial-gradient/);
});
test('U59 role densities and privacy stay separate by scope',()=>{
 const s=visualPart();
 const c=s.indexOf('/* Client:');
 const coach=s.indexOf('/* Coach:');
 const admin=s.indexOf('/* Admin:');
 assert.ok(c>=0&&coach>c&&admin>coach);
 assert.ok(s.includes('min-block-size:48px'));
 assert.ok(s.includes('min-block-size:44px'));
 assert.ok(s.includes('overflow-x:auto'));
 assert.ok(s.includes('max-width:680px'));
 assert.ok(s.includes('forced-colors:active'));
 assert.ok(s.includes('min-inline-size:0'));
});
test('U59 no change to real session authorization for Client, Coach or IRI-only',()=>{
 const projection={id:'u59',visible:true,canClientStart:true,session:{title:'Fuerza'}};
 const base={role:'client',serviceKind:'training',clients:[{id:'c1',name:'Cliente QA',serviceActive:true}],operations:{},appointments:[],upcoming:[],rc39:{sessionProjections:[projection]}};
 const ok=renderHoyRoute(base);
 assert.equal(ok.split('data-workflow-action="start-published-session"').length-1,1);
 assert.doesNotMatch(renderHoyRoute({...base,serviceKind:'iri_only'}),/start-published-session/);
 assert.doesNotMatch(renderHoyRoute({...base,clients:[{...base.clients[0],serviceActive:false}]}),/start-published-session/);
 const coach=renderHoyRoute({role:'coach',clients:[],appointments:[],upcoming:[],proposals:[],operations:{}});
 assert.match(coach,/m26-coach-home-command/);
 assert.doesNotMatch(coach,/data-workflow-action="start-published-session"/);
});
