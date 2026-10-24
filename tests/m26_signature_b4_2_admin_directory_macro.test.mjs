import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {__adminControllerInternals} from '../src/m26/admin/controller.js';
const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
test('User360 compact directory preserves protected forms, filters and integrity review',()=>{
  const html=renderAdminRoute({admin:{available:true},kind:'admin-usuarios',currentUserId:'ADMIN',
    canManageStatus:true,canManageRoles:true,users:[
    {id:'U1',userId:'U1',name:'Persona <script>alert(1)</script>',email:'p@example.cl',status:'active',
      roles:['client','coach'],primaryRole:'client',revision:3,
      integrityIssues:[{code:'AUTH_LINK_PENDING'}],client:{name:'Persona',modality:'online'}},
    {id:'ADMIN',userId:'ADMIN',name:'Admin QA',email:'admin@example.cl',status:'active',roles:['admin'],revision:4}
  ]});
  assert.equal((html.match(/data-admin-user-disclosure(?: open)?>/gu)||[]).length,2);
  assert.equal((html.match(/data-admin-user-card\b/gu)||[]).length,2);
  assert.match(html,/data-admin-user-disclosure open>/u);
  assert.match(html,/<summary class="m26-admin-user360-summary">/u);
  assert.match(html,/data-admin-form="user-status"/u);
  assert.match(html,/data-admin-form="role-change"/u);
  assert.match(html,/data-admin-form="user-delete"/u);
  assert.match(html,/Cuenta Admin actual protegida/u);
  assert.match(html,/data-admin-user-search/u);
  assert.match(html,/data-user-integrity="true"/u);
  assert.match(html,/Persona &lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/u);
});
test('Disclosure restoration retains expansion per id through server refresh',()=>{
  const {userDirectoryDisclosureState,restoreUserDirectoryDisclosures}=__adminControllerInternals;
  const card=(id,open)=>({getAttribute(k){return k==='data-user-id'?id:'';},
    disclosure:{open},querySelector(k){return k==='[data-admin-user-disclosure]'?this.disclosure:null;}});
  let cards=[card('U1',true),card('U2',false)];
  const directory={querySelectorAll(k){return k==='[data-admin-user-card]'?cards:[];}};
  const root={querySelector(k){return k==='[data-admin-user-directory]'?directory:null;}};
  const prior=userDirectoryDisclosureState(root);
  assert.deepEqual(prior,[{userId:'U1',open:true},{userId:'U2',open:false}]);
  cards=[card('U2',true),card('U1',false),card('U3',true)];
  assert.equal(restoreUserDirectoryDisclosures(root,prior),2);
  assert.equal(cards[0].disclosure.open,false);
  assert.equal(cards[1].disclosure.open,true);
  assert.equal(cards[2].disclosure.open,true);
});
test('Author CSS hides closed details and retains focus and compact touch on mobile',()=>{
  assert.match(css,/\.m26-admin-user360-disclosure:not\(\[open\]\)>\.m26-admin-user360-details\{display:none\}/u);
  assert.match(css,/\.m26-admin-operation-resolve:not\(\[open\]\)>\.m26-admin-form\{display:none\}/u);
  assert.match(css,/summary:focus-visible/u);
  assert.match(css,/@media\(max-width:390px\)/u);
  const route=readFileSync(new URL('../src/m26/admin/route-render.js',import.meta.url),'utf8');
  assert.match(route,/m26-admin-operation-resolve/u);
  assert.match(route,/Resolver incidencia/u);
});
