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

test('U99 Client primary action precedes real 7-day plan, then Entreno/Evolución/Bienestar',()=>{
 const html=renderHoyRoute({role:'client',serviceKind:'training',
  clients:[{id:'qa-u99',name:'Atleta sintético',serviceActive:true}],
  appointments:[],upcoming:[],operations:{},rc39:{sessionProjections:[]}});
 const primary=html.indexOf('class="m26-client-home-primary-zone"');
 const week=html.indexOf('data-client-week-rail');
 const context=html.indexOf('data-client-home-compass');
 assert.ok(primary>=0&&week>primary&&context>week,'semantic order');
 for(const area of ['sesion','progreso','actividad','planificacion'])
  assert.ok(html.includes('data-m26-area="'+area+'"'),area);
 assert.equal((html.match(/<time datetime=/g)||[]).length,7);
});
test('U99 Coach legacy FullCalendar v6 styling removed; genuine v7 day/week retained',()=>{
 const fullcalendar=readFileSync(new URL('../src/m26/agenda/fullcalendar-agenda.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/U99 · Stitch-informed Coach calendar/);
 const v7=css.split('U102 · Actual FullCalendar 7 Monarch runtime contract')[1]?.split('/* IBERFIT M27')[0]||'';
 for(const name of ['--fc-monarch-background:#101E17','--fc-monarch-primary:#D7BA7C',
   '--fc-monarch-event-contrast:#F5F5F0','[role="heading"]','[role="tab"]'])
  assert.ok(v7.includes(name),'native Monarch v7 '+name);
 assert.ok(v7.includes('@media(forced-colors:active)'));
 assert.doesNotMatch(v7,/display:none|pointer-events:none|position:fixed|content:url|!important/);
 assert.ok(fullcalendar.includes("initialView:compact?'timeGridDay':'timeGridWeek'"));
 assert.ok(fullcalendar.includes('timeZone:RC62_AGENDA_TIME_ZONE'));
 assert.ok(fullcalendar.includes('editable:false'));
 assert.ok(fullcalendar.includes('selectable:false'));
});

test('U102 FullCalendar v7 Monarch vars are scoped to Coach instead of purple/white global theme',()=>{
 const css=readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');
 const block=css.split('U102 · Actual FullCalendar 7 Monarch runtime contract')[1]?.split('/* IBERFIT M27')[0]||'';
 for(const token of ['--fc-monarch-background:#101E17','--fc-monarch-foreground:#F5F5F0',
  '--fc-monarch-primary:#D7BA7C','--fc-monarch-event:#C5A059',
  '--fc-monarch-selected:#D7BA7C','--fc-monarch-border:rgba(245,245,240,.16)'])
  assert.ok(block.includes(token),token);
 assert.ok(block.includes('[role="heading"]'));
 assert.ok(block.includes('[role="tab"][aria-selected="true"]'));
 assert.ok(block.includes('@media(forced-colors:active)'));
 assert.doesNotMatch(block,/display:none|pointer-events:none|position:fixed|content:url/);
 const vendor=readFileSync(new URL('../src/m26/vendor/fullcalendar-7.0.2/monarch.purple.css',import.meta.url),'utf8');
 assert.ok(vendor.includes('--fc-monarch-background: #ffffff'));
});

test('U103 actual Coach appointment labels remain cream on dark Monarch 7 event surfaces',()=>{
 const s=readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');
 const section=s.split('U102 · Actual FullCalendar 7 Monarch runtime contract')[1]?.split('/* IBERFIT M27')[0]||'';
 assert.ok(section.includes('--fc-monarch-event-contrast:#F5F5F0'));
 assert.match(section,/\[role="gridcell"\] button\s*,/);
 assert.match(section,/\[role="gridcell"\] button :is\(span,small,strong\)/);
 assert.match(section,/color:#F5F5F0/);
 assert.match(section,/@media\(forced-colors:active\)/);
 assert.doesNotMatch(section,/opacity:0|display:none|pointer-events:none/);
});

test('U105 Coach mobile quick actions precede nonblocking launch journey without losing either',()=>{
 const src=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
 const coach=src.slice(src.indexOf('function renderCoachHoyRoute('),src.indexOf('// The IRI assessment is an initial diagnosis'));
 const priority=coach.indexOf('m26-coach-home-command');
 const quick=coach.indexOf('m26-coach-home-quick');
 const slot=coach.indexOf('<!-- m26-coach-launch-self-slot -->');
 const agenda=coach.indexOf('m26-coach-home-grid');
 assert.ok(priority>=0&&quick>priority&&slot>quick&&agenda>slot,'priority → fast actions → onboarding → agenda');
 assert.ok(coach.includes("area:'planificacion',label:'Programar entrenamiento'"));
 for(const area of ['clientes','planificacion','agenda'])assert.ok(coach.includes(area));
 assert.equal((coach.match(/m26-coach-launch-self-slot/g)||[]).length,1);
 assert.match(coach,/data-m26-area="\$\{area\}"/);
});

test('U106 Admin route visual fixture does not weaken default permission-denied mode',()=>{
 const fixture=readFileSync(new URL('../qa/visual/signature-route-shell.fixture.mjs',import.meta.url),'utf8');
 const permissions=readFileSync(new URL('../src/m26/admin/permission-policy.js',import.meta.url),'utf8');
 assert.match(fixture,/authorizedAdminSynthetic=role==='admin'&&realBodies&&params\.get\('adminSurface'\)==='authorized-synthetic'/);
 assert.match(fixture,/permissions:authorizedAdminSynthetic/);
 assert.match(fixture,/:baseline\.admin\.permissions/);
 assert.match(fixture,/normalizeAdminPermissions\(/);
 assert.match(permissions,/adminCan\(state,capability\)/);
 assert.match(permissions,/state\?\.available===true&&hasCapability\(state\.permissions,capability\)/);
});

test('U107 authorized Admin command center is not preceded by a duplicate generic landing',()=>{
 const src=readFileSync(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/m26/design/adaptive-layout.css',import.meta.url),'utf8');
 assert.match(src,/realAdminCommandCenter=vm\.identity\.role==='admin'/);
 assert.match(src,/routeContent\.includes\('data-admin-surface="command-center"'\)/);
 assert.match(src,/workspaceHome\(vm,\{compactAdmin:realAdminCommandCenter\}\)/);
 assert.match(src,/if\(isAdmin&&compactAdmin\)return shortcuts/);
 assert.match(src,/data-admin-quick-access/);
 for(const destination of ['admin-clientes','admin-agenda','admin-equipo','admin-analitica'])
  assert.match(src,new RegExp("area:'"+destination+"'"));
 const rules=css.split('SIGNATURE U107 · Admin: one operational homepage')[1]||'';
 assert.match(rules,/\[data-m26-role="admin"\]/);
 assert.match(rules,/min-height:46px/);
 assert.match(rules,/@media\(max-width:480px\)/);
 assert.doesNotMatch(rules,/pointer-events:none|display:none!important|visibility:hidden/);
});

test('U108 Admin decision count remains grammatical and translatable without inventing priorities',()=>{
 const source=readFileSync(new URL('../src/m26/admin/route-render.js',import.meta.url),'utf8');
 const catalog=readFileSync(new URL('../src/m26/ui/i18n-surface-admin.js',import.meta.url),'utf8');
 assert.match(source,/clientCount===1\?'1 cliente por revisar'/);
 assert.match(source,/clientCount>1\?String\(clientCount\)\+' clientes por revisar'/);
 assert.match(catalog,/\['1 cliente por revisar','1 client to review'/);
 assert.ok(!source.includes("badge(clientCount?String(clientCount)+' clientes por revisar'"));
});

test('U110 Admin tabular data remains horizontally inspectable on touch and keyboard',()=>{
 const cssSection=s.split('SIGNATURE U110 · Admin factual tables:')[1]||'';
 for(const rule of ['.m26-admin-table[role="region"]','overflow-x:auto','inline-size:max-content',
   'min-inline-size:100%','scrollbar-width:thin',':focus-visible','forced-colors:active'])
   assert.ok(cssSection.includes(rule),'required Admin table invariant '+rule);
 assert.doesNotMatch(cssSection,/display:none|visibility:hidden|pointer-events:none|transform:scale/);
 const source=readFileSync(new URL('../src/m26/admin/route-render.js',import.meta.url),'utf8');
 assert.match(source,/role="region" aria-label="\$\{e\(scrollLabel\)\}" tabindex="0"/);
 assert.match(source,/scope="col"/);
 const i18n=readFileSync(new URL('../src/m26/ui/i18n-surface-admin.js',import.meta.url),'utf8');
 assert.ok(i18n.includes('Desplaza la tabla lateralmente para ver todas las columnas y acciones.'));

 assert.match(source,/Desplaza la tabla lateralmente para ver todas las columnas y acciones/);
});
