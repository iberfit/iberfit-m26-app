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

test('U65 published details remain owner-bound despite stale or foreign projections',()=>{
  const a='10000000-0000-4000-8000-000000006501';
  const b='10000000-0000-4000-8000-000000006502';
  const id='10000000-0000-4000-8000-000000006503';
  const session={id,clientId:b,status:'disponible',deliveryModality:'guiada_en_app',
    deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',
    body:{id,clientId:b,blocks:[{type:'exercise',exerciseId:'e1',name:'Detalle privado'}]}};
  const projection={id,visible:true,visibility:'full',canClientStart:true,session};
  const vm={role:'client',serviceKind:'training',
    clients:[{id:a,name:'Cliente A',serviceActive:true}],
    appointments:[],upcoming:[],operations:{},rc39:{sessionProjections:[projection]}};
  const mismatched=renderHoyRoute(vm);
  assert.doesNotMatch(mismatched,/data-client-session-preview|Detalle privado/);
  const matched=renderHoyRoute({...vm,clients:[{...vm.clients[0],id:b}]});
  assert.match(matched,/data-client-session-preview/);
  assert.match(matched,/Detalle privado/);
  assert.doesNotMatch(renderHoyRoute({...vm,clients:[{...vm.clients[0],id:''}]}),/data-client-session-preview/);
});

test('U66 Stitch authentic context landmark is not a wellbeing metric or duplicate title',async()=>{
  const base={role:'client',serviceKind:'training',
    clients:[{id:'u66',name:'Cliente QA',serviceActive:true}],
    appointments:[],upcoming:[],operations:{},rc39:{sessionProjections:[]}};
  const html=renderHoyRoute(base);
  assert.match(html,/<nav class="m26-client-home-compass" aria-label="Contexto del atleta"/);
  assert.match(html,/<strong>Contexto del atleta<\/strong>/);
  assert.match(html,/<div class="m26-client-home-primary-zone" role="group" aria-label="Acción principal de hoy"/);
  assert.equal((html.match(/data-client-home-compass/g)||[]).length,1);
  assert.equal((html.match(/m26-client-home-compass-actions"/g)||[]).length,1);
  for(const destination of ['sesion','progreso','actividad'])
    assert.match(html,new RegExp('data-m26-area="'+destination+'"'));
  assert.doesNotMatch(html,/data-client-session-preview|data-workflow-action="start-published-session"/);
  const {iberfitSurfaceTranslate}=await import('../src/m26/ui/i18n-surface.js');
  assert.equal(iberfitSurfaceTranslate('Contexto del atleta',{language:'en'}),'Athlete context');
  assert.equal(iberfitSurfaceTranslate('Contexto del atleta',{language:'fr'}),'Contexte de l’athlète');
  assert.equal(iberfitSurfaceTranslate('Contexto del atleta',{language:'pt'}),'Contexto do atleta');
  const css=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  const signature=css.split('U66 · Fidelity to the original Stitch contextual hierarchy')[1]||'';
  assert.match(signature,/max-width:370px/);
  assert.match(signature,/forced-colors:active/);
  assert.doesNotMatch(signature,/pointer-events:none|visibility:hidden|position:fixed/);
});

test('U67 published session screenshot fixture mirrors real CSS ancestry',()=>{
  const html=fs.readFileSync(new URL('../qa/live-workout/published-sessions.fixture.html',import.meta.url),'utf8');
  assert.match(html,/<main id="qa-root" class="m26-shell" data-m26-role="client">[\s\S]*?<section class="m26-workspace"/);
  assert.match(html,/<div class="m26-main" id="qa-published-route"><\/div>/);
  assert.match(html,/<div id="qa-workout"><\/div>/);
  const premium=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  assert.match(premium,/\.m26-shell\[data-m26-role="client"\] \.m26-workspace \.m26-client-sessions-brief\{/);
  assert.match(premium,/\.m26-client-sessions-brief\{[\s\S]*?display:grid;/);
  assert.match(premium,/\.m26-client-sessions-brief>strong\{/);
});

test('U68 standalone real-session QA uses the same role CSS scope as the app',()=>{
  const html=fs.readFileSync(new URL('../qa/live-workout/fixture.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../qa/live-workout/fixture.mjs',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  assert.match(html,/<section id="qa-shell" class="m26-shell" data-m26-role="client">[\s\S]*?<div class="m26-workspace">[\s\S]*?<main id="qa-root" class="m26-main">/);
  assert.match(html,/href="\/src\/m26\/shell\/shell.css"/);
  assert.match(html,/href="\/src\/m26\/rc39\/rc39.css"/);
  assert.match(js,/qaShell\.dataset\.m26Role=role/);
  assert.match(css,/\.m26-client-sessions-brief>strong\{[\s\S]*?overflow-wrap:anywhere/);
});

test('U69 isolated published-session desktop fixture preserves a full content column',()=>{
  const html=fs.readFileSync(new URL('../qa/live-workout/published-sessions.fixture.html',import.meta.url),'utf8');
  const browser=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  assert.match(html,/#qa-root\.m26-shell\{display:block;width:100%;max-width:1180px/);
  assert.match(html,/#qa-root > \.m26-workspace\{display:block;width:100%;/);
  assert.match(browser,/Desktop preview must occupy its actual reading column/);
  assert.match(browser,/dimensions\.width,'Desktop preview must occupy its actual reading column'\)\.toBeGreaterThanOrEqual\(650\)/);
});

test('U71 legacy published session browser test uses the actual role workspace',()=>{
  const browser=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  const test=browser.split("test('Canary sesión programada y guiada: previa completa")[1]
    ?.split("test('SIGNATURE published mixed Client route")[0]||'';
  assert.match(test,/document\.querySelector\('#qa-shell > \.m26-workspace'\)/);
  assert.match(test,/workspace\.appendChild\(area\)/);
  assert.doesNotMatch(test,/document\.body\.appendChild\(area\)/);
  assert.match(test,/await expect\(disclosure\)\.not\.toHaveAttribute\('open',''\)/);
  assert.match(test,/await activatePublishedPreview\(guided,testInfo\)/);
  assert.match(test,/Actual pointer interaction must open the native preview before any launch/);
});

test('U72 real session context adapts to CARD width, never viewport-only columns',()=>{
  const css=fs.readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');
  const browser=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  const u72=css.split('U72 · The context belongs to a CARD')[1]?.split('@media (max-width:719px)')[0]||'';
  assert.match(u72,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,20rem\),1fr\)\)/);
  assert.match(u72,/justify-content:flex-start/);
  assert.doesNotMatch(u72,/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(browser,/Session context may not collapse into vertical letters/);
  assert.match(browser,/headingHeight,'The context heading must remain a readable three-line maximum'/);
  assert.match(browser,/experienceGeometry\.overflow\)\.toBe\(false\)/);
});

test('U73 availability caption uses a full grid row instead of stealing a session column',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  const qa=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  const block=css.split('U73 · Session availability is a section caption')[1]?.split('.m26-shell[data-m26-role="client"] .m26-workspace .m26-rc39-sessions .m26-rc39-session-card{')[0]||'';
  assert.match(block,/\.m26-rc39-week > \.m26-session-available-summary\{/);
  assert.match(block,/grid-column:1 \/ -1/);
  assert.match(qa,/Ready-session caption must span the full session grid/);
  assert.match(qa,/Session cards must start below the caption row/);
});

test('U75 Client layout uses readable desktop tracks and WebKit-safe sticky scroll offset',()=>{
  const design=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  const ux=fs.readFileSync(new URL('../src/m26/design/premium-ux.css',import.meta.url),'utf8');
  const browser=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  assert.match(design,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,27rem\),1fr\)\)/);
  assert.match(ux,/U75 · A real touch scroll/);
  assert.match(ux,/data-session-live-state="rest"\] \[data-session-action="next"\]\{/);
  assert.match(ux,/scroll-margin-block-start:calc\(var\(--m26-session-sticky-top,\.4rem\) \+ 9rem\)/);
  assert.match(browser,/Continue now must not sit beneath the sticky session control dock/);
  assert.match(browser,/data-m26-session-action-pending/);
  assert.match(browser,/Two published sessions must not leave a third blank desktop column/);
});

test('U76 Client rest releases sticky dock without removing pause/save, active remains sticky',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/premium-ux.css',import.meta.url),'utf8');
  const block=css.split('U76 · WebKit cannot always hit the primary rest')[1]
    ?.split('.m26-session-live-quick-actions :is(.m26-session-live-quick-save')[0]||'';
  assert.match(block,/data-session-live-state="rest"\] \.m26-session-live-quick-actions\{/);
  assert.match(block,/position:static/);
  assert.match(block,/top:auto/);
  assert.doesNotMatch(block,/pointer-events:none|visibility:hidden|display:none/);
  assert.match(css,/\.m26-session-live-quick-actions\{\s*position:sticky;/);
});


test('U77 complete visual route inventory remains 9 Cliente / 17 Coach / 17 Admin',()=>{
  const json=JSON.parse(fs.readFileSync(new URL('../qa/visual/signature-360-coverage.json',import.meta.url),'utf8'));
  const browser=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  assert.equal(json.roles.client.length,9);
  assert.equal(json.roles.coach.length,17);
  assert.equal(json.roles.admin.length,17);
  assert.equal(Object.values(json.roles).reduce((n,items)=>n+items.length,0),43);
  for(const role of ['client','coach','admin']){
    const areas=json.roles[role].map(item=>item.area);
    assert.equal(new Set(areas).size,areas.length);
  }
  assert.match(browser,/SIGNATURE U77 · Canonical 43-route readability and role safety/);
  assert.match(browser,/__IBERFIT_SIGNATURE_ROUTE_QA__\.navigate\(target\)/);
  assert.match(browser,/no letter-by-letter vertical headings/);
  assert.match(browser,/must never write to a remote backend in static visual QA/);
  assert.match(browser,/real-synthetic/);
});


test('U80 visual evidence covers every canonical role route on both reference widths without claiming authentication',()=>{
  const browser=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  assert.match(browser,/visualEvidenceProject=\['live-workout-mobile-chromium','live-workout-desktop-chromium'\]/);
  assert.match(browser,/for\(const \{area\} of entries\)\{/);
  assert.match(browser,/fullPage:true,scale:'css',animations:'disabled'/);
  assert.match(browser,/recovery\/signature-published-sessions\/u80/);
  assert.match(browser,/path:visualEvidenceDir\+'\/'\+area\+'\.jpg'/);
  assert.match(browser,/writeFile\(visualEvidenceDir\+'\/manifest\.json'/);
  const workflow=fs.readFileSync(new URL('../.github/workflows/session-qa-isolated.yml',import.meta.url),'utf8');
  assert.match(workflow,/path: recovery\/signature-published-sessions\//);
  assert.match(browser,/visualEvidenceAreas\.push\(area\)/);
  assert.match(browser,/toEqual\(entries\.map\(item=>item\.area\)\)/);
  assert.match(browser,/authenticated:false/);
  assert.match(browser,/stitchParityCertified:false/);
  assert.match(browser,/must never write to a remote backend in static visual QA/);
  assert.doesNotMatch(browser,/page\.route\([^\n]*\bPOST\b/);
});

test('U78 single-surface Client prescription keeps full data and readable missing-media state',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  const test=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  const section=css.split('U78 · Editorial published prescription')[1]||'';
  assert.match(section,/m26-session-preview-blocks\{/);
  assert.match(section,/m26-session-preview-block\{/);
  assert.match(section,/background:transparent/);
  assert.match(section,/m26-session-preview-block\+\.m26-session-preview-block\{/);
  assert.match(section,/m26-exercise-media-fallback\{/);
  assert.match(section,/background:#152c20/);
  assert.match(section,/color:#f5f0e6/);
  assert.match(section,/forced-colors:active/);
  assert.doesNotMatch(section,/display:none|pointer-events:none|!important|content:url\(/);
  assert.match(test,/Exercise media fallback needs WCAG AA contrast/);
  assert.match(test,/The exercise list should not nest another decorative panel/);
});


test('U81 Client prescription facts use a single accessible data band without losing the real values',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  const browser=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  const u81=css.split('U81 · Stitch-inspired factual band')[1]||'';
  assert.match(u81,/m26-session-preview-facts\{/);
  assert.match(u81,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(u81,/m26-session-preview-facts>div\{/);
  assert.match(u81,/background:transparent/);
  assert.match(u81,/m26-session-preview-facts dd\{/);
  assert.match(u81,/font-variant-numeric:tabular-nums/);
  assert.match(u81,/forced-colors:active/);
  assert.doesNotMatch(u81,/display:none|visibility:hidden|pointer-events:none|!important/);
  assert.match(browser,/const factStrip=await guided.locator/);
  assert.match(browser,/No prescribed fields can disappear/);
  assert.match(browser,/completeEntries:/);
  assert.match(browser,/expect\(factStrip\.completeEntries/);
  assert.doesNotMatch(browser,/factStrip\.allFacts[^\n]*GreaterThanOrEqual\(5\)/);
  const renderer=fs.readFileSync(new URL('../src/m26/rc39/route-render.js',import.meta.url),'utf8');
  assert.match(renderer,/<dl class="m26-session-preview-facts">/);
  assert.match(renderer,/<dt>\$\{escape\(label\)\}<\/dt><dd>\$\{escape\(value\)\}<\/dd>/);
});


test('U82 43-route synthetic visual evidence records nested scroll and lower folds faithfully',()=>{
  const browser=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  const workflow=fs.readFileSync(new URL('../.github/workflows/session-qa-isolated.yml',import.meta.url),'utf8');
  assert.match(browser,/const scrollEvidence=\{\}/);
  const dockCss=fs.readFileSync(new URL('../src/m26/ui/client-bottom-nav.css',import.meta.url),'utf8');
  assert.match(dockCss,/m26-client-route-shell > :not\(\.m26-client-bottom-nav-layer\)/);
  assert.match(browser,/client-route-scrollport/);
  assert.match(browser,/scrollTarget:target/);
  assert.match(browser,/routeHeight:Math\.round/);
  assert.match(browser,/candidateRanges:/);
  assert.match(browser,/area\+'-scrolled\.jpg'/);
  assert.match(browser,/scrollEvidence\[area\]=scroll/);
  assert.match(browser,/scrollEvidence,/);
  assert.match(browser,/authentication.*never|never authenticated/);
  assert.match(workflow,/path: recovery\/signature-published-sessions\//);
});


test('U83/U84 native Retina evidence is full device resolution and audits visible optical assets without URLs',()=>{
  const browser=fs.readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
  const retina=browser.split('// U83 · Native-resolution visual evidence')[1]||'';
  assert.match(retina,/deviceScaleFactor:3/);
  assert.match(retina,/scale:'device',fullPage:false/);
  assert.match(retina,/readUInt32BE\(16\).*toBe\(1170\)/);
  assert.match(retina,/readUInt32BE\(20\).*toBe\(2532\)/);
  assert.match(retina,/opticalAudit=await page\.evaluate/);
  assert.match(retina,/document\.fonts\.status/);
  assert.match(retina,/naturalWidth:img\.naturalWidth/);
  assert.match(retina,/usesSrcset:Boolean/);
  assert.match(retina,/canvasCount:canvases\.length/);
  assert.match(retina,/stitchParityCertified:false,scroll,opticalAudit/);
  assert.match(retina,/identity:'synthetic',authenticated:false/);
  assert.doesNotMatch(retina,/currentSrc:|src:img\.src|outerHTML|innerHTML/);
});
