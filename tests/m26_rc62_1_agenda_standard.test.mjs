import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  FULLCALENDAR_STANDARD_VERSION,
  FULLCALENDAR_SOURCE_KIND,
  RC62_AGENDA_TIME_ZONE,
  agendaRoleEligible,
  buildRc62AgendaEvents,
  fullCalendarCoachOptions,
} from '../src/m26/agenda/fullcalendar-agenda.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC62.1 pins FullCalendar Standard 7.0.2 to the verified official npm package',()=>{
  assert.equal(FULLCALENDAR_STANDARD_VERSION,'7.0.2');
  assert.equal(FULLCALENDAR_SOURCE_KIND,'npm-registry-pinned-7.0.2');
  const source=read('src/m26/vendor/fullcalendar-7.0.2/SOURCE.md');
  assert.match(source,/Package: fullcalendar@7\.0\.2/u);
  assert.match(source,/official npm registry/u);
  assert.match(source,/Registry shasum: [a-f0-9]{40}/u);
  assert.match(source,/Registry integrity: sha512-[A-Za-z0-9+/]+=*/u);
});

test('RC62.1 vendors Standard assets and MIT license same-origin',()=>{
  const paths=[
    'src/m26/vendor/fullcalendar-7.0.2/all.global.js',
    'src/m26/vendor/fullcalendar-7.0.2/skeleton.css',
    'src/m26/vendor/fullcalendar-7.0.2/monarch.global.js',
    'src/m26/vendor/fullcalendar-7.0.2/monarch.theme.css',
    'src/m26/vendor/fullcalendar-7.0.2/monarch.purple.css',
    'src/m26/vendor/fullcalendar-7.0.2/es.global.js',
    'src/m26/vendor/fullcalendar-7.0.2/LICENSE.md',
  ];
  for(const path of paths)assert.ok(fs.statSync(path).size>20,path);
  assert.match(read('src/m26/vendor/fullcalendar-7.0.2/LICENSE.md'),/MIT License|Permission is hereby granted/iu);
});

test('RC62.1 is Coach-first and does not broaden Client or Admin agenda',()=>{
  assert.equal(agendaRoleEligible('coach'),true);
  assert.equal(agendaRoleEligible('client'),false);
  assert.equal(agendaRoleEligible('admin'),false);
  const route=read('src/m26/rc39/route-render.js');
  assert.match(route,/role==='coach'\?`<section class="m26-panel m26-rc62-agenda-calendar-panel"/u);
});

test('RC62.1 calendar is day-week operational view without mutating interactions',()=>{
  const options=fullCalendarCoachOptions({events:[]});
  assert.equal(options.initialView,'timeGridWeek');
  assert.equal(options.timeZone,RC62_AGENDA_TIME_ZONE);
  assert.equal(options.timeZone,'America/Santiago');
  assert.equal(options.editable,false);
  assert.equal(options.selectable,false);
  assert.equal(options.eventStartEditable,false);
  assert.equal(options.eventDurationEditable,false);
  assert.equal(options.eventInteractive,true);
  assert.match(options.headerToolbar.right,/timeGridWeek/u);
  assert.match(options.headerToolbar.right,/timeGridDay/u);
});

test('RC62.1 event projection is compact and rejects invalid appointment intervals',()=>{
  const events=buildRc62AgendaEvents([
    {id:'A1',clientId:'SECRET-CLIENT',title:'Sesión fuerza',startAt:'2026-08-17T14:00:00-04:00',endAt:'2026-08-17T15:00:00-04:00',status:'confirmada',modality:'presencial',body:{privateHealth:'no'}},
    {id:'BAD',title:'Inválida',startAt:'2026-08-17T15:00:00-04:00',endAt:'2026-08-17T14:00:00-04:00'},
  ]);
  assert.equal(events.length,1);
  assert.equal(events[0].id,'A1');
  assert.equal(events[0].title,'Sesión fuerza');
  assert.equal('clientId' in events[0],false);
  assert.equal('privateHealth' in events[0],false);
  assert.deepEqual(Object.keys(events[0].extendedProps).sort(),['appointmentId','modality','status']);
});

test('RC62.1 route keeps the accessible appointment-card fallback below the visual calendar',()=>{
  const route=read('src/m26/rc39/route-render.js');
  assert.match(route,/data-rc62-agenda-calendar/u);
  assert.match(route,/data-appointment-card/u);
  assert.match(route,/tabindex="-1"/u);
  assert.match(route,/m26-rc39-week/u);
});

test('RC62.1 controller composes agenda calendar into existing RC39 lifecycle',()=>{
  const controller=read('src/m26/rc39/controller.js');
  assert.match(controller,/createRc62AgendaCalendarController/u);
  assert.match(controller,/agendaCalendar\.mount\(\)/u);
  assert.match(controller,/agendaCalendar\.destroy\(\)/u);
});

test('RC62.1 runtime module is presentation-only and never calls backend mutation surfaces',()=>{
  const source=read('src/m26/agenda/fullcalendar-agenda.js');
  assert.doesNotMatch(source,/commandBus|transport\.|supabase|fetch\(|XMLHttpRequest|service_role/iu);
  assert.match(source,/editable:false/u);
  assert.match(source,/selectable:false/u);
});

test('RC62.1 excludes Premium Scheduler and resource views',()=>{
  const source=[
    read('src/m26/agenda/fullcalendar-agenda.js'),
    read('src/m26/vendor/fullcalendar-7.0.2/SOURCE.md'),
    read('package.json'),
  ].join('\n');
  assert.doesNotMatch(source,/fullcalendar-scheduler|schedulerLicenseKey|resourceTimeline|resourceTimeGrid/iu);
});

test('RC62.1 keeps npm manifests unchanged and loads vendor assets same-origin',()=>{
  const pkg=read('package.json');
  const runtime=read('src/m26/agenda/fullcalendar-agenda.js');
  assert.doesNotMatch(pkg,/"fullcalendar"/iu);
  assert.doesNotMatch(runtime,/cdn\.jsdelivr|unpkg|https:\/\//iu);
  assert.match(runtime,/\/src\/m26\/vendor\/fullcalendar-7\.0\.2\/all\.global\.js/u);
});

test('RC62.1 mobile keeps card fallback instead of forcing dense timegrid',()=>{
  const css=read('src/m26/rc39/rc39.css');
  assert.match(css,/IBERFIT RC62\.1 · FullCalendar Standard Coach Agenda/u);
  assert.match(css,/@media \(max-width:719px\)/u);
  assert.match(css,/m26-rc62-agenda-calendar-panel\{display:none!important\}/u);
});

test('RC62.1 stabilizes RC61 PWA history and versions the agenda shell',()=>{
  const rc61=read('tests/m26_rc61_2_sync_empty_transitions.test.mjs');
  const sw=read('public/m26/sw.js');
  assert.match(rc61,/Historical compatibility markers retained\[\^\\n\]\*m26-rc61-2\[\^\\n\]\*m26-rc61-1/u);
  assert.match(sw,/VERSION='m26-rc62-1'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc61-2'/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc62-1[^\n]*m26-rc61-2/u);
  assert.match(sw,/"\/src\/m26\/agenda\/fullcalendar-agenda\.js"/u);
  assert.match(sw,/"\/src\/m26\/vendor\/fullcalendar-7\.0\.2\/all\.global\.js"/u);
});

test('RC62.1 closes only Agenda Standard and opens Guidance',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC62=IN_PROGRESS_AGENDA_GUIDANCE_ONBOARDING/u);
  assert.match(roadmap,/RC62_1=CLOSED_AGENDA_STANDARD/u);
  assert.match(roadmap,/RC62_2=IN_PROGRESS_GUIDANCE/u);
  assert.match(roadmap,/RC62_3=PENDING_PROGRESSIVE_ONBOARDING/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});