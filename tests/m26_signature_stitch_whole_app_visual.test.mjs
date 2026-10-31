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

test('U59 explicitly covers native Admin routes, hero, tables, capacity and forms',()=>{
 const stylesheet=read(),native=stylesheet.split('U59 Admin real route completion ·')[1]||'';
 assert.ok(native.length>1800);
 for(const name of ['.m26-admin-route','.m26-admin-hero','.m26-admin-panel','.m26-admin-stats','.m26-admin-table','.m26-admin-form','forced-colors:active','max-width:680px','focus-visible'])assert.ok(native.includes(name),name);
 assert.doesNotMatch(native,/!important|position:fixed|z-index:\s*\d+|@import|display:none|pointer-events:none|url\(/);
});

test('U60 empty, error, pending and recovery affordances have distinct role-safe visual contracts',()=>{
 const s=read(),block=s.split('U60 · Role-specific safe empty/error/recovery surfaces.')[1]||'';
 assert.ok(block.length>2200);
 for(const needle of [
  '.m26-empty','.m26-admin-empty','.m26-notice',
  '.m26-notice.is-danger','.m26-notice.is-warning','.m26-notice.is-success',
  'data-m26-role="client"','data-m26-role="coach"','data-m26-role="admin"',
  'min-block-size:44px','focus-visible','forced-colors:active','max-width:370px',
 ])assert.ok(block.includes(needle),needle);
 assert.doesNotMatch(block,/!important|position:fixed|pointer-events:none|display:none|visibility:hidden|@import/);
});

test('U61 Stitch Client next action remains editorial and truthful with no published session',()=>{
  const base={
    role:'client',serviceKind:'training',
    clients:[{id:'u61',name:'Cliente QA',serviceActive:true}],
    appointments:[],upcoming:[],operations:{},rc39:{sessionProjections:[]},
  };
  const html=renderHoyRoute(base);
  assert.match(html,/data-client-home-training-state="preparing"/);
  // U51 keeps the wellbeing fallback visually self-sufficient, not duplicated
  // by an extra status/title container.
  assert.doesNotMatch(html,/class="m26-client-home-status"/);
  assert.match(html,/<strong>Registrar cómo estoy<\/strong>/);
  assert.match(html,/data-m26-area="actividad"/);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/);
  const paused=renderHoyRoute({...base,clients:[{...base.clients[0],serviceActive:false}]});
  assert.match(paused,/data-client-home-training-state="paused"/);
  assert.match(paused,/Tu entrenamiento está en pausa/);
  assert.doesNotMatch(paused,/data-workflow-action="start-published-session"/);
});
test('U61 Client context destinations have a decorative directional cue and visible focus',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  const signature=css.split('Stitch V2.3 composition, adapted')[1]||'';
  assert.match(signature,/m26-client-home-compass-actions button::after/);
  assert.match(signature,/margin-inline-start:auto/);
  assert.match(signature,/m26-client-home-compass-actions button:focus-visible/);
  assert.match(signature,/@media\(forced-colors:active\)/);
});

test('U62 original Stitch hierarchy improves client/coach/admin legibility without changing data',()=>{
  const s=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  const role=read().split('SIGNATURE MASTER VISUAL U59 ·')[1]||'';
  const focus=s.split('Stitch V2.3 composition, adapted')[1]||'';
  for(const marker of ['border-top-color:rgba(214,178,94,.42)','overflow-wrap:anywhere','text-transform:uppercase','@media(hover:hover) and (pointer:fine)'])assert.ok(focus.includes(marker),marker);
  for(const marker of ['data-m26-role="coach"','data-m26-role="admin"',':focus-within','text-wrap:balance','overflow-wrap:break-word'])assert.ok(role.includes(marker),marker);
  assert.doesNotMatch(role,/pointer-events:none|visibility:hidden|display:none/);
});

test('U63 Stitch shows authorized published structure only, never a DEMO metric',()=>{
  const id='10000000-0000-4000-8000-000000006363',clientId='10000000-0000-4000-8000-000000006364';
  const session={id,clientId,status:'disponible',deliveryModality:'guiada_en_app',
    deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',
    body:{id,clientId,blocks:[
      {id:'b1',type:'exercise',exerciseId:'e1',name:'Peso muerto <script>alert(1)</script>'},
      {id:'b2',type:'circuit',exerciseIds:['e2','e3'],title:'Circuito general'},
    ]}};
  const projection={id,visible:true,visibility:'full',canClientStart:true,session,appointmentId:null};
  const vm={role:'client',serviceKind:'training',clients:[{id:clientId,name:'Cliente QA',serviceActive:true}],
    appointments:[],upcoming:[],operations:{},rc39:{sessionProjections:[projection]}};
  const html=renderHoyRoute(vm);
  assert.match(html,/data-client-session-preview/);
  assert.match(html,/Prescripción disponible/);
  assert.match(html,/2 bloques/);
  assert.match(html,/Peso muerto &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/Circuito general/);
  assert.doesNotMatch(html,/<script>|Volumen Obj\.|RPE Medio|18,500 kg/);
  assert.equal((html.match(/data-workflow-action="start-published-session"/g)||[]).length,1);
  const hidden=renderHoyRoute({...vm,rc39:{sessionProjections:[{...projection,visibility:'summary_only'}]}});
  assert.doesNotMatch(hidden,/data-client-session-preview/);
  const conflicting=renderHoyRoute({...vm,rc39:{sessionProjections:[{...projection,session:{...session,clientVisibilityLevel:'hidden'}}]}});
  assert.doesNotMatch(conflicting,/data-client-session-preview/);
  const paused=renderHoyRoute({...vm,clients:[{...vm.clients[0],serviceActive:false}]});
  assert.doesNotMatch(paused,/data-client-session-preview|data-workflow-action="start-published-session"/);
  assert.doesNotMatch(renderHoyRoute({...vm,serviceKind:'iri_only'}),/data-client-session-preview/);
});
test('U63 Coach priority colour preserves text and permissions and Admin hierarchy is editorial',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  const roles=read();
  assert.match(css,/m26-client-stitch-session-details>summary:focus-visible/);
  assert.match(css,/m26-client-stitch-session-details li>strong/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(roles,/data-priority-tone="danger"/);
  assert.match(roles,/m26-admin-route > \.m26-admin-hero \.m26-eyebrow/);
  const coach=renderHoyRoute({role:'coach',clients:[],appointments:[],upcoming:[],operations:{conflicts:1}});
  assert.match(coach,/class="m26-coach-home-command" data-priority-tone="danger"/);
  assert.doesNotMatch(coach,/data-client-session-preview/);
});

test('U64 Stitch published structure is localized in all four supported languages',async()=>{
  const {iberfitSurfaceTranslate}=await import('../src/m26/ui/i18n-surface.js');
  const expected={
    en:['Published prescription','Prescription available','View published structure','2 blocks','Block 7'],
    fr:['Prescription publiée','Prescription disponible','Voir la structure publiée','2 blocs','Bloc 7'],
    pt:['Prescrição publicada','Prescrição disponível','Ver estrutura publicada','2 blocos','Bloco 7'],
  };
  const source=['Prescripción publicada','Prescripción disponible','Ver estructura publicada','2 bloques','Bloque 7'];
  for(const [language,translations] of Object.entries(expected)){
    assert.deepEqual(source.map(value=>iberfitSurfaceTranslate(value,{language})),translations);
    assert.notEqual(iberfitSurfaceTranslate('Y 3 bloques más en la sesión completa.',{language}),
      'Y 3 bloques más en la sesión completa.');
  }
  const js=fs.readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(js,/data-client-session-preview role="group" aria-label="Prescripción publicada"/);
});
