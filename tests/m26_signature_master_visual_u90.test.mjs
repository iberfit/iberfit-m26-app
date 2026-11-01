import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderHoyRoute,renderClientsRoute,renderClientWeekRail} from '../src/m26/modules/route-render.js';

const css=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
const s=css.split('SIGNATURE MASTER U90')[1]?.split('END SIGNATURE MASTER U90')[0]||'';
const catalog=JSON.parse(readFileSync(new URL('../qa/visual/signature-360-coverage.json',import.meta.url),'utf8'));

test('U90 uses a single existing canonical visual sheet for all 43 routes',()=>{
 assert.ok(s.length>9000);
 assert.ok((s.match(/\.m26-main/g)||[]).length>25,'real authenticated route container');
 assert.doesNotMatch(s,/\.m26-workspace(?![-\w])/,'do not target a nonexistent route wrapper');
 assert.deepEqual(Object.fromEntries(Object.entries(catalog.roles).map(([role,areas])=>[role,areas.length])),{client:9,coach:17,admin:17});
 for(const role of ['client','coach','admin'])assert.ok(s.includes('data-m26-role="'+role+'"'),role);
 for(const element of ['.m26-route-intro','.m26-panel','.m26-stat','.m26-admin-table','.m26-session-builder-v2','.m26-client-bottom-nav'])
  assert.ok(s.includes(element),element);
 assert.match(s,/--iberfit-master-ivory/);
 assert.match(s,/--iberfit-master-gold/);
});
test('U90 provides 320/390 mobile, 768–1150 tablet, desktop and Retina-safe vector hooks',()=>{
 assert.match(s,/@media \(max-width:600px\)/);
 assert.match(s,/@media \(min-width:768px\) and \(max-width:1150px\)/);
 assert.match(s,/shape-rendering:geometricPrecision/);
 assert.match(s,/data-m26-client-guide="secondary-actions"/);
 assert.match(s,/m26-text-action\[data-m26-area="clientes"\]/);
 assert.match(s,/min-inline-size:0/);
 assert.match(s,/overflow-x:auto/);
 assert.match(s,/prefers-reduced-motion:reduce/);
 assert.match(s,/forced-colors:active/);
 assert.match(s,/:focus-visible/);
});
test('U90 never replaces auth, commands or context with prototype labels',()=>{
 assert.doesNotMatch(s,/data-workflow-action|localStorage|fetch\(|Supabase|API_KEY|\[DEMO\]|FICTICIOS|innerHTML|!important|display:none|pointer-events:none|position:fixed/);
 const vm={role:'client',serviceKind:'training',clients:[{id:'client-qa',serviceActive:true}],operations:{},
  appointments:[],upcoming:[],rc39:{sessionProjections:[{id:'session-qa',visible:true,canClientStart:true,session:{title:'Sesión'}}]}};
 assert.match(renderHoyRoute(vm),/data-workflow-action="start-published-session"/);
 assert.doesNotMatch(renderHoyRoute({...vm,serviceKind:'iri_only'}),/data-workflow-action="start-published-session"/);
});
test('U90 does not erase navigation, touch targets, charts or real status labels',()=>{
 assert.doesNotMatch(s,/overflow-x:hidden|overflow:hidden|visibility:hidden|transform:scale/);
 assert.match(s,/min-block-size:44px/);
 assert.match(s,/font-variant-numeric:tabular-nums/);
 assert.match(s,/shape-rendering:geometricPrecision/);
});

// The packaged Cloudflare build copies the original brand PNG under /public/.
// Keep every shared visual layer on that same URL. A missing watermark should
// never be "fixed" by drawing an imitation logo or using a stale root alias.
test('official isotipo resolves through the packaged deployment path across all roles',()=>{
 const roleCss=readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/m26/index.html',import.meta.url),'utf8');
 const build=readFileSync(new URL('../scripts/build_rc15_launch_candidate.mjs',import.meta.url),'utf8');
 const canonical='/public/isotipo-iberfit.png';
 assert.ok(html.includes('src="/public/isotipo-iberfit.png"'));
 assert.ok(build.includes("copy('public/isotipo-iberfit.png','public/isotipo-iberfit.png')"));
 const stylesheetRefs=[css,roleCss].flatMap(sheet=>
  sheet.split('url(').slice(1).map(part=>part.split(')')[0].replaceAll(/['"]/g,'').trim())
   .filter(path=>path.endsWith('isotipo-iberfit.png'))
 );
 assert.ok(stylesheetRefs.length>=4,'branded auth, shells and client/coach/admin hero regions');
 assert.ok(stylesheetRefs.every(ref=>ref===canonical),'all visible marks must use the same packaged original');
});

// R37/R39 art critique: on a phone or narrow tablet, the Coach's own search
// must not sit below a tall priority queue. Preserve every queue entry and action.
test('U91 Coach search precedes the priority queue without losing either',()=>{
 const html=renderClientsRoute({role:'coach',canCreate:false,clients:[{
  id:'qa-coach-client',name:'Cliente QA',modality:'Online',status:'Activo',
  experience:{serviceKind:'training'},
  followUp:{signal:{level:'warning',label:'Necesita contexto'},plannedSessions:0}
 }]});
 const search=html.indexOf('data-client-search');
 const priority=html.indexOf('class="m26-followup-panel"');
 const directory=html.indexOf('data-client-grid');
 assert.ok(search>=0&&priority>search&&directory>priority,'search, priorities and full directory must remain available in that order');
 assert.match(html,/data-client-filter="iri"/);
 assert.match(html,/data-client-filter="modality"/);
 assert.match(html,/data-client-filter="stage"/);
 assert.match(html,/data-client-sort/);
 assert.match(html,/data-m26-select-client/);
 assert.ok(s.includes('input[data-client-search]'));
 assert.ok(s.includes('grid-column:1/-1'));
});


test('U94 date rail uses Santiago civil dates and confirmed appointments only',()=>{
 const upcoming=[
  {date:'2026-11-01',statusRaw:'confirmada'},
  {date:'2026-10-30',statusRaw:'pendiente'},
  {date:'2026-11-02',statusRaw:'confirmada'}
 ];
 // 02:30 UTC is still Sunday 1 November in Santiago (UTC-3).
 const sunday=renderClientWeekRail(upcoming,new Date('2026-11-02T02:30:00.000Z'));
 assert.equal((sunday.match(/<time datetime=/g)||[]).length,7);
 assert.match(sunday,/data-day="2026-11-01" data-date-status="confirmed" aria-current="date"/);
 assert.match(sunday,/<time datetime="2026-11-01">1<\/time>/);
 assert.match(sunday,/data-day="2026-10-30" data-date-status="not-shown"/);
 assert.doesNotMatch(sunday,/data-day="2026-11-02"/);
 assert.match(sunday,/data-m26-area="planificacion"/);
 assert.doesNotMatch(sunday,/sesiones completadas|descanso programado/i);
 // 03:30 UTC is Monday 2 November; week rolls over without a local-date drift.
 const monday=renderClientWeekRail(upcoming,new Date('2026-11-02T03:30:00.000Z'));
 assert.match(monday,/data-day="2026-11-02" data-date-status="confirmed" aria-current="date"/);
 assert.match(monday,/<time datetime="2026-11-02">2<\/time>/);
 assert.equal((monday.match(/<time datetime=/g)||[]).length,7);
 assert.match(css,/\.m26-client-week-day>strong>time/);
 assert.match(css,/@media\(min-width:768px\) and \(max-width:1150px\)/);
});
test('U94 original brand PNG and profile visual resolve in packaged app without fallback imitation',()=>{
 const shellCss=readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8');
 const image=readFileSync(new URL('../public/isotipo-iberfit.png',import.meta.url));
 assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(image.readUInt32BE(16),173);
 assert.equal(image.readUInt32BE(20),192);
 assert.ok(shellCss.includes("url('/public/isotipo-iberfit.png')"));
 assert.doesNotMatch(shellCss,/url\(['"]\/isotipo-iberfit\.png['"]\)/);
});

test('U95 authenticated route blocks never fade to invisible while rendering or navigating',()=>{
 const main=css.split('U95 · No false low-contrast transitions')[1]?.split('U90 WCAG regression gate:')[0]||'';
 assert.match(main,/\.m26-shell\[data-m26-role\] \.m26-main \.m26-route > \*/);
 assert.match(main,/animation:none/);
 assert.doesNotMatch(main,/display:none|visibility:hidden|opacity:0|pointer-events:none/);
});

test('U97 official branding remains visible in compact topbar and native on Retina',()=>{
 const shell=readFileSync(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');
 assert.match(shell,/class="m26-topbar-brand-mark" src="\/public\/isotipo-iberfit\.png"/);
 const styles=readFileSync(new URL('../src/m26/design/adaptive-layout.css',import.meta.url),'utf8').split('U97 · Mobile IBERFIT identity')[1]||'';
 assert.match(styles,/\[data-m26-layout="compact-touch"\]/);
 assert.match(styles,/inline-size:34px;block-size:38px/);
 assert.match(styles,/object-fit:contain/);
 assert.doesNotMatch(styles,/scale\(|filter:|opacity:0/);
});
