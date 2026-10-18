import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAdminRoute,deriveAdminTeamAssignmentTriage} from '../src/m26/admin/route-render.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const profiles=[
  {id:'coach-active',coachId:'coach-active',name:'Ana',accountStatus:'active',status:'Activo · planificación pendiente',clients:[{id:'c-1',name:'Uno'}],upcomingCount:1},
  {id:'coach-inactive',coachId:'coach-inactive',name:'Beto',accountStatus:'inactive',status:'Inactive',clients:[],upcomingCount:0},
  {id:'coach-suspended',coachId:'coach-suspended',name:'Caro',accountStatus:'suspended',status:'Suspendido',clients:[],upcomingCount:0},
  {id:'coach-pending',coachId:'coach-pending',name:'Dani',accountStatus:'',status:'Activo · invitación sin verificar',clients:[],upcomingCount:0},
  {id:'coach-local',coachId:'coach-local',name:'Elena',accountStatus:' ACTIVO ',status:'Activo',clients:[],upcomingCount:0},
];
const assignments=[
  {id:'a-active',coachName:'Ana',clientName:'Uno',coachUserId:'coach-active',clientId:'c-1',status:'active',revision:7},
  {id:'a-ended',coachName:'Beto',clientName:'Dos',coachUserId:'coach-inactive',clientId:'c-2',status:'ended',revision:8},
  {id:'a-cancelled',coachName:'Caro',clientName:'Tres',status:'cancelled',revision:9},
  {id:'a-unknown',coachName:'Dani',clientName:'Cuatro',status:'',revision:11},
];
const vm=(canManage)=>({
  admin:true,kind:'admin-equipo',canManage,
  coachProfiles360:profiles,
  coaches:profiles.map(c=>({id:c.id,userId:c.coachId,name:c.name})),
  clients:[{id:'c-1',name:'Uno'},{id:'c-2',name:'Dos'}],
  assignments,organization:{timezone:'America/Santiago'},
});

test('Coach active count follows verified accountStatus, not an inactive string or speculative launch label',()=>{
  const actual=deriveAdminTeamAssignmentTriage({profiles,assignments});
  assert.equal(actual.activeCoaches,2);
  assert.equal(actual.activeAssignmentCount,1);
  assert.deepEqual(actual.active.map(a=>a.id),['a-active']);
  assert.deepEqual(actual.history.map(a=>a.id),['a-ended','a-cancelled','a-unknown']);
  assert.equal(Object.isFrozen(actual.history),true);
  assert.equal(deriveAdminTeamAssignmentTriage({profiles:[],assignments:[]}).activeCoaches,0);
  assert.equal(deriveAdminTeamAssignmentTriage({profiles:[{status:'active',accountStatus:null}]}).activeCoaches,0);
});

test('Admin team presents accurate current/history sections and preserves privileged assignment revisions',()=>{
  const html=renderAdminRoute(vm(true));
  assert.match(html,/Activos<\/span><strong>2<\/strong>/u);
  assert.match(html,/Asignaciones Coach–Cliente activas/);
  assert.match(html,/Relaciones vigentes/);
  assert.match(html,/Historial de asignaciones <span aria-label="Cantidad">3<\/span>/u);
  assert.equal((html.match(/data-admin-assignment-state="active"/g)||[]).length,1);
  assert.equal((html.match(/data-admin-assignment-state="history"/g)||[]).length,3);
  assert.equal((html.match(/data-admin-form="assignment-end"/g)||[]).length,1);
  assert.match(html,/name="assignmentId" value="a-active"/);
  assert.match(html,/name="baseRevision" value="7"/);
  assert.match(html,/name="reason" minlength="3" maxlength="500" required/);
  assert.match(html,/data-admin-form="assignment-create"/);
  assert.match(html,/name="coachUserId" required/);
  assert.match(html,/name="clientId" required/);
  assert.match(html,/name="startsAt" required/);
  assert.match(html,/role="region" aria-label="Relaciones activas de Coach y cliente" tabindex="0"/);
  assert.match(html,/role="region" aria-label="Historial de asignaciones Coach y cliente" tabindex="0"/);
});

test('Read-only team preserves profiles/history but never renders privileged assignment commands',()=>{
  const html=renderAdminRoute(vm(false));
  assert.match(html,/coach-active/);
  assert.match(html,/Historial de asignaciones/);
  assert.doesNotMatch(html,/data-admin-form="assignment-create"|data-admin-form="assignment-end"/);
  const empty=renderAdminRoute({...vm(false),assignments:[]});
  assert.match(empty,/Sin asignaciones activas/);
  assert.doesNotMatch(empty,/class="m26-admin-team-history"/);
});

test('Malicious coach and client fields remain escaped and cannot manufacture new privileged controls',()=>{
  const dirty=vm(true);
  dirty.assignments=[{id:'a-evil',coachName:'<script>alert(1)</script>',clientName:'<img src=x onerror=evil()>',status:'ended'}];
  const html=renderAdminRoute(dirty);
  assert.doesNotMatch(html,/<script>|<img src=x/u);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.match(html,/&lt;img src=x onerror=evil\(\)&gt;/u);
  assert.doesNotMatch(html,/data-admin-form="assignment-end"/u);
});

test('Responsive team tables have keyboard scroll, mobile touch and forced-colors protection',()=>{
  const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
  const styles=css.slice(css.indexOf('SIGNATURE 360 U10 · Coach team'));
  assert.ok(styles.length>100);
  assert.match(styles,/overflow-x:auto/);
  assert.match(styles,/min-height:44px/);
  assert.match(styles,/min-height:48px/);
  assert.match(styles,/@media\(max-width:700px\)/);
  assert.match(styles,/@media\(forced-colors:active\)/);
  assert.match(styles,/focus-visible/);
  assert.doesNotMatch(styles,/position:fixed|position:sticky/);
});

test('New team copy is translated in EN, FR and PT',()=>{
  const phrases=[
    'Seleccionar Coach','Seleccionar cliente','Fecha de inicio','Motivo de finalización',
    'Relaciones vigentes','Asignaciones Coach–Cliente activas','Historial de asignaciones',
    'Sin asignaciones activas','No existen relaciones Coach–Cliente activas verificadas.',
  ];
  for(const phrase of phrases)for(const language of ['en','fr','pt'])
    assert.notEqual(iberfitSurfaceTranslate(phrase,{language}),phrase,language+': '+phrase);
});
