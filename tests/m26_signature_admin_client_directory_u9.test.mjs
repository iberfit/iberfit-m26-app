import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {__adminControllerInternals} from '../src/m26/admin/controller.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const matches=__adminControllerInternals.personDirectoryMatchesFilter;
const c=(name,id,serviceKind,trainingServiceStatus)=>({
  id,name,email:`${id}@example.cl`,status:'active',
  serviceKind,trainingServiceStatus,
  lifecycle:{status:'active',access:{status:'activo'}},coachNames:[],
  revision:3,profile:{},
});
const clients=[
  c('Training active','client-active','training','active'),
  c('Training paused','client-paused','training','paused'),
  c('Training ended','client-ended','training','ended'),
  c('IRI only','client-iri','none','none'),
];
const vm=(canManage=true)=>({
  admin:true,kind:'admin-clientes',canManage,
  clients,coaches:[],currentUserId:'admin-1',
  leads:[{id:'lead-1',name:'Potential client',status:'new',email:'lead@example.cl',revision:7}],
  organization:{timezone:'America/Santiago',locale:'es-CL'},
});
test('Admin no-active-training filter includes paused, ended and IRI-only but not active training',()=>{
  assert.equal(typeof matches,'function');
  const values=clients.map(x=>matches({
    personStatus:x.lifecycle.status,
    serviceKind:x.serviceKind,
    trainingServiceStatus:x.trainingServiceStatus,
  },'no-training'));
  assert.deepEqual(values,[false,true,true,true]);
  assert.deepEqual(clients.map(x=>matches({
    personStatus:x.status,serviceKind:x.serviceKind,
    trainingServiceStatus:x.trainingServiceStatus,
  },'training')),[true,true,true,false]);
  assert.equal(matches({personStatus:'inactive',serviceKind:'training',trainingServiceStatus:'ended'},'inactive'),true);
  assert.equal(matches({personStatus:'active',serviceKind:'training',trainingServiceStatus:'active'},'onboarding'),false);
  assert.equal(matches({personStatus:'active',serviceKind:'training',trainingServiceStatus:'active'},'all'),true);
  assert.equal(matches({personStatus:'active',serviceKind:'none',trainingServiceStatus:''},'no-training'),true);
});

test('Admin directory tables preserve native headings, region labels and keyboard focus with scroll',()=>{
  const html=renderAdminRoute(vm(false));
  assert.match(html,/class="m26-admin-table m26-admin-client-table" role="region" aria-label="Personas con expediente y gestión" tabindex="0"/);
  assert.match(html,/class="m26-admin-table m26-admin-lead-table" role="region" aria-label="Leads y seguimiento" tabindex="0"/);
  assert.equal((html.match(/<table><thead><tr>/g)||[]).length,2);
  assert.equal((html.match(/<th scope="col">/g)||[]).length,9);
  assert.match(html,/data-training-service-status="active"/);
  assert.match(html,/data-training-service-status="paused"/);
  assert.match(html,/data-training-service-status="ended"/);
  assert.match(html,/data-training-service-status="none"/);
  assert.match(html,/data-admin-person-filter-status" role="status" aria-live="polite"/);
  assert.match(html,/Desplaza la tabla lateralmente para ver todas las columnas y acciones/);
  assert.doesNotMatch(html,/data-admin-form="client-training-service"/);
  assert.doesNotMatch(html,/data-admin-client-edit-open=/);
});

test('Client and lead action forms keep every privileged command and gain input labels',()=>{
  const html=renderAdminRoute(vm(true));
  assert.equal((html.match(/data-admin-form="client-training-service"/g)||[]).length,4);
  assert.equal((html.match(/data-admin-form="lead-update"/g)||[]).length,1);
  assert.equal((html.match(/data-admin-client-edit-open=/g)||[]).length,4);
  assert.equal((html.match(/data-admin-form="client-delete"/g)||[]).length,4);
  assert.equal((html.match(/data-m26-open-client-area="expediente"/g)||[]).length,3);
  assert.match(html,/<label>Estado del lead<select name="status">/);
  assert.match(html,/<label>Próxima acción<input type="datetime-local" name="nextActionAt">/);
  assert.match(html,/<label>Estado del servicio<select name="status">/);
  assert.match(html,/<label>Motivo del cambio<input name="reason" minlength="3" maxlength="500" required/);
  assert.match(html,/name="baseRevision" value="7"/);
  assert.match(html,/data-admin-client-edit-dialog/);
  assert.match(html,/data-client-create-wizard/);
  assert.match(html,/data-admin-form="client-invite-resend"|Sin acceso|Invitación/);
});

test('Client names remain escaped when inserted into table rows and attributes',()=>{
  const dirty=vm(false);
  dirty.clients=[c('<script>alert(1)</script>','bad\" onmouseover=\"evil','training','paused')];
  const html=renderAdminRoute(dirty);
  assert.doesNotMatch(html,/<script>|onmouseover="evil"/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/data-admin-client-id="bad&quot; onmouseover=&quot;evil"/);
});

test('Client table mobile ergonomics preserve semantic table and keyboard scroll controls',()=>{
  const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
  const block=css.slice(css.indexOf('SIGNATURE 360 U9 · Client/lead'));
  assert.ok(block.length>100);
  assert.match(block,/overflow-x:auto/);
  assert.match(block,/scroll-padding-inline:1rem/);
  assert.match(block,/:focus-visible/);
  assert.match(block,/outline:3px solid var\(--iberfit-color-focus/);
  assert.match(block,/@media\(max-width:700px\)/);
  assert.match(block,/@media\(forced-colors:active\)/);
  assert.doesNotMatch(block,/display:none\s*;\s*}\s*\/\*?[^\n]*client-row-actions/u);
});

test('Client table navigation copy has ES EN FR PT registered translations',()=>{
  const phrases=[
    'Estado del lead','Próxima acción','Estado del servicio','Motivo del cambio',
    'Leads y seguimiento','Personas con expediente y gestión',
    'Desplaza la tabla lateralmente para ver todas las columnas y acciones.',
  ];
  for(const phrase of phrases)for(const language of ['en','fr','pt']){
    const result=iberfitSurfaceTranslate(phrase,{language});
    assert.notEqual(result,phrase,`${language}: ${phrase}`);
  }
});
