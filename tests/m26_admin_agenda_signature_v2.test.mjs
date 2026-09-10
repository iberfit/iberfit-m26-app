import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('Admin Command Center is decision-first while retaining operational surfaces',()=>{
  const html=renderAdminRoute({
    admin:true,
    kind:'admin-inicio',
    summary:{activeClients:12},
    commandCenter:{
      summary:{
        totalClients:12,
        unassignedClients:2,
        iriPending:3,
        planningPending:1,
        schedulingPending:4,
        coachesNearCapacity:1,
        criticalTasks:1,
        openTasks:2,
      },
      priorities:[{
        kind:'warning',
        stageLabel:'Seguimiento',
        clientName:'Cliente A',
        action:{reason:'Revisión pendiente',area:'admin-clientes',label:'Revisar'},
        coachNames:['Carlos'],
      }],
      coachLoad:[],
      criticalTasks:[],
    },
    tasks:[{title:'Revisar agenda',detail:'Cambio pendiente',status:'open'}],
    audit:[{summary:'Acción trazada',occurredAt:'2026-09-10'}],
  });

  const hero=html.indexOf('IBERFIT Command Center');
  const decisions=html.indexOf('data-admin-priority-center');
  const kpis=html.indexOf('m30-admin-kpis');
  const operations=html.indexOf('m30-admin-operations-grid');
  const audit=html.indexOf('m30-admin-audit');

  assert.ok(hero>=0&&decisions>hero&&kpis>decisions&&operations>kpis&&audit>operations);
  assert.ok(html.includes('data-admin-surface="command-center"'));
  assert.ok(html.includes('data-m26-area="admin-clientes"'));
  assert.ok(html.includes('Capacidad de Coaches'));
  assert.ok(html.includes('Tareas abiertas'));
  assert.ok(html.includes('Actividad administrativa reciente'));
});

test('Admin mutation forms and critical controls remain present in source',()=>{
  const source=read('src/m26/admin/route-render.js');
  for(const form of [
    'user-status','role-change','assignment-create','assignment-end',
    'client-create','lead-create','lead-update','client-lifecycle','client-delete',
    'task-create','task-resolve','template-save','automation-save','settings-save'
  ]){
    assert.ok(source.includes('data-admin-form="${kind}"')||source.includes("'"+form+"'"));
    assert.ok(source.includes(form),'missing admin form '+form);
  }
  assert.ok(source.includes('ELIMINAR'));
  assert.ok(source.includes('canManage'));
  assert.ok(source.includes('canManageStatus'));
  assert.ok(source.includes('canManageRoles'));
});

test('Coach agenda exposes responsive operational landmarks and keeps calendar + cards',()=>{
  const html=renderRc39Route({
    kind:'agenda',
    role:'coach',
    rc39:{
      role:'coach',
      appointments:[],
      sessionProjections:[],
    },
  });
  assert.ok(html.includes('m30-agenda-route'));
  assert.ok(html.includes('data-agenda-role="coach"'));
  assert.ok(html.includes('m30-agenda-calendar'));
  assert.ok(html.includes('data-rc62-agenda-calendar'));
  assert.ok(html.includes('m30-agenda-list'));
  assert.ok(html.includes('Agenda vacía'));
});

test('Client agenda keeps its role semantics without injecting Coach-only calendar',()=>{
  const html=renderRc39Route({
    kind:'agenda',
    role:'client',
    rc39:{
      role:'client',
      appointments:[],
      sessionProjections:[],
    },
  });
  assert.ok(html.includes('data-agenda-role="client"'));
  assert.equal(html.includes('data-rc62-agenda-calendar'),false);
  assert.ok(html.includes('Tu agenda'));
  assert.ok(html.includes('m30-agenda-list'));
});

test('Signature V2.4 adapts Admin and Agenda without removing capabilities',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  const start=css.indexOf('/* Signature UX V2.4');
  assert.ok(start>=0);
  const added=css.slice(start);
  for(const selector of [
    '.m30-admin-command-route',
    '.m30-admin-decision-center',
    '.m30-admin-kpis',
    '.m26-admin-route .m26-admin-table',
    '.m30-agenda-route',
    '.m30-agenda-calendar',
    '.m30-agenda-list'
  ]) assert.ok(added.includes(selector),'missing V2.4 selector '+selector);
  for(const query of [
    '@media (max-width:1180px)',
    '@media (max-width:900px)',
    '@media (max-width:620px)',
    '@media (max-width:390px)'
  ]) assert.ok(added.includes(query),'missing V2.4 breakpoint '+query);
  assert.doesNotMatch(added,/display\s*:\s*none|visibility\s*:\s*hidden/iu);
  assert.equal(/pointer-events\s*:\s*none/iu.test(added),false);
});

test('Admin tables gain bounded horizontal scrolling and sticky headers without hiding columns',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  const added=css.slice(css.indexOf('/* Signature UX V2.4'));
  assert.ok(added.includes('overflow:auto'));
  assert.ok(added.includes('overscroll-behavior-inline:contain'));
  assert.ok(added.includes('scrollbar-gutter:stable'));
  assert.ok(added.includes('position:sticky'));
  assert.ok(added.includes('min-width:680px'));
});
