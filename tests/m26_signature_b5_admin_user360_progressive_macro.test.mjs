import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';

const render=()=>renderAdminRoute({
  admin:{available:true},kind:'admin-usuarios',canManageStatus:true,canManageRoles:true,
  currentUserId:'ADMIN_SELF',
  users:[
    {id:'USER_A',userId:'USER_A',name:'Cliente <script>bad</script>',authEmail:'qa-client@example.test',
      contactEmail:'contact@example.test',status:'active',primaryRole:'client',roles:['client'],
      revision:7,lastAccessAt:'2026-10-23T12:00:00Z',
      client:{name:'QA Cliente',modality:'online',lifecycleStatus:'active'},
      assignedCoachNames:['Coach QA'],
      access:{status:'activo',authLinked:true,activatedAt:'2026-10-20T12:00:00Z',invitationSentAt:'2026-10-19T12:00:00Z'}},
    {id:'USER_B',userId:'USER_B',name:'Admin QA',status:'suspended',primaryRole:'admin',
      roles:['admin'],revision:1,integrityIssues:[{code:'QA_INTEGRITY'}]},
  ],
  user360Summary:{total:2,activeUsers:1,pendingInvitations:0,integrityIssueCount:1},
});

test('B5 admin directory prioritizes actionable Auth state, coach and last access before native disclosure',()=>{
  const html=render();
  const card=html.split('data-user-id="USER_A"')[1].split('data-user-id="USER_B"')[0];
  assert.match(card,/m26-admin-user360-essentials/u);
  assert.match(card,/<dt>Acceso Cliente<\/dt>/u);
  assert.match(card,/<dt>Coach \/ cartera<\/dt>/u);
  assert.match(card,/<dt>Último acceso<\/dt>/u);
  const disclosure=card.indexOf('<details class="m26-admin-user360-context">');
  assert.ok(disclosure>card.indexOf('m26-admin-user360-essentials'));
  assert.ok(disclosure>card.indexOf('<dt>Último acceso</dt>'));
  assert.match(card,/<summary>Ver datos de la cuenta <small>Ficha Cliente vinculada<\/small><\/summary>/u);
  for(const label of ['Relación operativa','Correo de contacto','Activación']){
    assert.ok(card.includes('<dt>'+label+'</dt>'),label+' must be preserved');
  }
  assert.ok(card.includes('contact@example.test'));
  assert.match(card,/data-admin-form="user-status"/u);
  assert.match(card,/data-admin-form="role-change"/u);
  assert.match(card,/data-admin-form="user-delete"/u);
  assert.match(card,/name="baseRevision" value="7"/u);
  assert.match(card,/Gestionar acceso y estado/u);
});

test('B5 preserves authorization, integrity, full directory search and safe escaping',()=>{
  const html=render();
  assert.match(html,/data-admin-user-search/u);
  assert.match(html,/data-admin-user-filter="attention"/u);
  assert.match(html,/data-admin-user-review-filter/u);
  assert.match(html,/data-user-integrity="true"/u);
  assert.match(html,/QA_INTEGRITY/u);
  assert.match(html,/data-user-roles="\\|client\\|"/u);
  assert.match(html,/Cliente &lt;script&gt;bad&lt;\/script&gt;/u);
  assert.doesNotMatch(html,/<script>bad<\/script>/u);
  assert.match(html,/name="confirmPhrase"/u);
  assert.match(html,/name="confirmAcknowledged"/u);
  assert.match(html,/Sin vínculo de acceso|Acceso activo/u);
});

test('B5 CSS is focused, responsive, forced-color aware and keyboard-accessible',()=>{
  const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
  const start=css.indexOf('SIGNATURE 360 B5 BEGIN');
  const end=css.indexOf('SIGNATURE 360 B5 END');
  assert.ok(start>0&&end>start);
  const layer=css.slice(start,end);
  assert.match(layer,/m26-admin-user360-essentials/u);
  assert.match(layer,/m26-admin-user360-context>summary:focus-visible/u);
  assert.match(layer,/min-height:44px/u);
  assert.match(layer,/@media\(max-width:900px\)/u);
  assert.match(layer,/@media\(max-width:680px\)/u);
  assert.match(layer,/@media\(forced-colors:active\)/u);
  assert.doesNotMatch(layer,/!important/u);
});
