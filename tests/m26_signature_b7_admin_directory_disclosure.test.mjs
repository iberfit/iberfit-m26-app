import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {__adminControllerInternals} from '../src/m26/admin/controller.js';

const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
const layer=css.slice(css.indexOf('SIGNATURE B7 · Admin User360'));
function fixture(){
  return renderAdminRoute({
    admin:{available:true},kind:'admin-usuarios',
    canManageStatus:true,canManageRoles:true,
    currentUserId:'ADM_SELF',
    users:[
      {id:'USER_A',userId:'USER_A',name:'Persona <script>bad</script>',
        authEmail:'a@example.test',status:'active',roles:['client'],
        primaryRole:'client',revision:4,lastAccessAt:'2026-10-23T11:00:00Z',
        client:{name:'Persona',modality:'online'},
        access:{status:'activo',authLinked:true},assignedCoachNames:['Coach Test']},
      {id:'USER_B',userId:'USER_B',name:'Cuenta con incidencia',
        status:'active',roles:['coach'],primaryRole:'coach',revision:2,
        integrityIssues:[{code:'AUTH_LINK_PENDING'}]},
      {id:'ADM_SELF',userId:'ADM_SELF',name:'Admin actual',status:'active',
        roles:['admin'],primaryRole:'admin',revision:6},
    ],
  });
}
test('B7 collapses healthy identities by default, expands integrity warning by default',()=>{
  const html=fixture();
  assert.equal((html.match(/data-admin-user-disclosure(?: open)?>/gu)||[]).length,3);
  const a=html.split('data-user-id="USER_A"')[1].split('data-user-id="USER_B"')[0];
  const b=html.split('data-user-id="USER_B"')[1].split('data-user-id="ADM_SELF"')[0];
  assert.match(a,/data-admin-user-disclosure>/u);
  assert.match(b,/data-admin-user-disclosure open>/u);
  assert.match(a,/<summary class="m26-admin-user360-summary">/u);
  assert.match(b,/Revisión requerida/u);
  assert.match(b,/AUTH_LINK_PENDING/u);
  assert.match(html,/Persona &lt;script&gt;bad&lt;\/script&gt;/u);
  assert.doesNotMatch(html,/<script>bad<\/script>/u);
});
test('B7 preserves B5 server-truth fields, disclosures, RLS-gated forms and self-delete safety',()=>{
  const html=fixture();
  for(const marker of ['m26-admin-user360-essentials','m26-admin-user360-context',
    'm26-admin-user-management','data-admin-form="user-status"',
    'data-admin-form="role-change"','data-admin-form="user-delete"',
    'name="baseRevision" value="4"','Cuenta Admin actual protegida',
    '<dt>Acceso Cliente</dt>','<dt>Coach / cartera</dt>',
    '<dt>Último acceso</dt>','<dt>Relación operativa</dt>']){
    assert.ok(html.includes(marker),'preserved B5: '+marker);
  }
  assert.match(html,/data-admin-user-search/u);
  assert.match(html,/data-admin-user-filter="attention"/u);
  assert.match(html,/data-admin-user-visible-count/u);
});
test('B7 disclosure snapshot round-trips context, protected controls and outer identity after ACK',()=>{
  function makeCard(id,values={}){
    const outer={open:Boolean(values.outer)},context={open:Boolean(values.context)},
      management={open:Boolean(values.management)};
    return {outer,context,management,
      getAttribute:key=>key==='data-user-id'?id:key==='data-user-integrity'?(values.integrity?'true':'false'):'',
      querySelector:key=>({
        '[data-admin-user-disclosure]':outer,
        '.m26-admin-user360-context':context,
        '.m26-admin-user-management':management,
      })[key]||null};
  }
  const source=[makeCard('u1',{outer:true,context:true,management:true}),
    makeCard('u2',{outer:false,context:false,management:false})];
  const target=[makeCard('u1'),makeCard('u2',{outer:true,integrity:true}),makeCard('new',{outer:true})];
  const dom=cards=>({
    querySelector:key=>key==='[data-admin-user-directory]'
      ?{querySelectorAll:sel=>sel==='[data-admin-user-card]'?cards:[]}
      :null,
  });
  const saved=__adminControllerInternals.userDirectoryDisclosureState(dom(source));
  assert.equal(saved.length,2);
  assert.equal(__adminControllerInternals.restoreUserDirectoryDisclosures(dom(target),saved),2);
  assert.equal(target[0].outer.open,true);
  assert.equal(target[0].context.open,true);
  assert.equal(target[0].management.open,true);
  assert.equal(target[1].outer.open,true,'A new integrity flag must reopen its previous identity');
  assert.equal(target[2].outer.open,true,'New integrity state must not be overwritten');
  assert.equal(__adminControllerInternals.restoreUserDirectoryDisclosures(dom([]),saved),0);
});
test('B7 Admin compact rows remain accessible on phone, tablet, desktop, forced colors',()=>{
  assert.ok(layer.length>1800);
  assert.match(layer,/min-height:76px/u);
  assert.match(layer,/:focus-visible/u);
  assert.match(layer,/@media\(max-width:1040px\)/u);
  assert.match(layer,/@media\(max-width:680px\)/u);
  assert.match(layer,/@media\(max-width:390px\)/u);
  assert.match(layer,/@media\(forced-colors:active\)/u);
  assert.match(layer,/touch-action:manipulation/u);
  assert.doesNotMatch(layer,/!important|position\s*:\s*fixed|animation\s*:/u);
});
