import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {__adminControllerInternals} from '../src/m26/admin/controller.js';

const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
function directoryFixture(){
  const search={value:''},status={value:''},role={value:''},attention={value:''};
  const count={textContent:''},empty={hidden:true},reset={hidden:true};
  const review={attributes:new Map(),setAttribute(k,v){this.attributes.set(k,v);}};
  function user(id,{name,statusValue='active',roleValue='client',access='',integrity=false,unlinked=false}={}){
    const attrs={
      'data-user-search':name||id,'data-user-status':statusValue,
      'data-user-roles':`|${roleValue}|`,
      'data-user-access-state':access,
      'data-user-integrity':integrity?'true':'false',
      'data-user-unlinked':unlinked?'true':'false',
    };
    return {id,hidden:false,getAttribute(k){return attrs[k]||'';}};
  }
  const cards=[
    user('1',{name:'María Robles',access:'activo',integrity:true}),
    user('2',{name:'Pablo Invite',access:'invitacion_pendiente'}),
    user('3',{name:'Cliente sin enlace',unlinked:true}),
    user('4',{name:'Coach sano',roleValue:'coach',access:''}),
  ];
  const refs={
    '[data-admin-user-search]':search,
    '[data-admin-user-filter="status"]':status,
    '[data-admin-user-filter="role"]':role,
    '[data-admin-user-filter="attention"]':attention,
    '[data-admin-user-visible-count]':count,
    '[data-admin-user-no-results]':empty,
    '[data-admin-user-filter-reset]':reset,
  };
  const directory={
    querySelector:(selector)=>refs[selector]||null,
    querySelectorAll:(selector)=>selector==='[data-admin-user-card]'?cards:[],
  };
  const root={querySelector:(selector)=>
    selector==='[data-admin-user-directory]'?directory:
    selector==='[data-admin-user-review-filter]'?review:null};
  return {root,cards,search,status,role,attention,count,empty,reset,review};
}

test('Admin triage is scoped to visible real users and retains privileged management',()=>{
  const html=renderAdminRoute({
    admin:{available:true},kind:'admin-usuarios',
    users:[
      {id:'u1',userId:'u1',name:'María',status:'active',roles:['client'],primaryRole:'client',
        access:{status:'activo',authLinked:false},integrityIssues:[{code:'UNVERIFIED_LINK'}]},
      {id:'u2',userId:'u2',name:'Luis',status:'active',roles:['client'],
        access:{status:'invitacion_pendiente',authLinked:false},integrityIssues:[]},
      {id:'u3',userId:'u3',name:'Ana',status:'active',roles:['coach'],integrityIssues:[]},
    ],
    user360Summary:{total:3,activeUsers:3,pendingInvitations:1,integrityIssueCount:1},
    canManageStatus:true,canManageRoles:true,
  });
  assert.match(html,/data-admin-user-filter="attention"/u);
  assert.match(html,/<option value="integrity">Vínculo a revisar<\/option>/u);
  assert.match(html,/<option value="invitation">Invitación pendiente<\/option>/u);
  assert.match(html,/<option value="unlinked">Cliente sin vínculo<\/option>/u);
  assert.match(html,/data-admin-user-review-filter aria-controls="m26-admin-user-results"/u);
  assert.match(html,/data-admin-user-filter-reset hidden/u);
  assert.match(html,/data-user-id="u1"[^>]*data-user-integrity="true" data-user-unlinked="true"/u);
  assert.match(html,/data-user-id="u2"[^>]*data-user-access-state="invitacion_pendiente" data-user-integrity="false" data-user-unlinked="false"/u);
  assert.match(html,/data-user-id="u3"[^>]*data-user-unlinked="false"/u);
  assert.match(html,/data-admin-form="user-status"/u);
  assert.match(html,/data-admin-form="role-change"/u);
  assert.doesNotMatch(html,/vincular por correo autom[aá]ticamente/u);
});

test('Primary-role-only Cliente retains an honest unlinked access state',()=>{
  const html=renderAdminRoute({
    admin:{available:true},kind:'admin-usuarios',
    users:[{id:'u-cl',userId:'u-cl',name:'Cliente sin rol expandido',
      primaryRole:'client',roles:[],status:'active',access:null,integrityIssues:[]}],
    user360Summary:{total:1,activeUsers:1,pendingInvitations:0,integrityIssueCount:0},
    canManageStatus:false,canManageRoles:false,
  });
  assert.match(html,/data-user-roles="\|client\|"/u);
  assert.match(html,/data-user-unlinked="true"/u);
  assert.match(html,/Sin vínculo de acceso/u);
  assert.doesNotMatch(html,/Esta identidad no usa la aplicación Cliente/u);
});

test('Global orphaned access anomaly never invents an associated user or fake drilldown',()=>{
  const html=renderAdminRoute({
    admin:{available:true},kind:'admin-usuarios',
    users:[{id:'u1',userId:'u1',name:'Cliente aislado',roles:['client'],status:'active',integrityIssues:[]}],
    user360Summary:{total:1,activeUsers:1,pendingInvitations:0,integrityIssueCount:2},
    canManageStatus:false,canManageRoles:false,
  });
  assert.match(html,/Hay vínculos sin una cuenta del directorio identificable/u);
  assert.doesNotMatch(html,/data-admin-user-review-filter/u);
  assert.match(html,/data-user-integrity="false"/u);
});

test('Triage searches real integrity issues, does not infer broken access from invitation',()=>{
  const f=directoryFixture();
  const {applyUserDirectoryFilters}=__adminControllerInternals;
  f.attention.value='integrity';
  assert.equal(applyUserDirectoryFilters(f.root),1);
  assert.deepEqual(f.cards.map(x=>!x.hidden),[true,false,false,false]);
  assert.equal(f.count.textContent,'1');
  assert.equal(f.empty.hidden,true);
  assert.equal(f.reset.hidden,false);
  assert.equal(f.review.attributes.get('aria-pressed'),'true');

  f.attention.value='invitation';
  assert.equal(applyUserDirectoryFilters(f.root),1);
  assert.deepEqual(f.cards.map(x=>!x.hidden),[false,true,false,false]);
  assert.equal(f.review.attributes.get('aria-pressed'),'false');

  f.attention.value='unlinked';
  assert.equal(applyUserDirectoryFilters(f.root),1);
  assert.deepEqual(f.cards.map(x=>!x.hidden),[false,false,true,false]);
});

test('Filters combine role, status, accent-insensitive search and triage precisely',()=>{
  const f=directoryFixture();
  const {applyUserDirectoryFilters}=__adminControllerInternals;
  f.search.value='maria';f.role.value='client';f.status.value='active';f.attention.value='integrity';
  assert.equal(applyUserDirectoryFilters(f.root),1);
  f.search.value='pablo';
  assert.equal(applyUserDirectoryFilters(f.root),0);
  assert.equal(f.empty.hidden,false);
  assert.equal(f.count.textContent,'0');
  assert.equal(f.reset.hidden,false);
});

test('Reset and filtered view restoration do not mutate user data',()=>{
  const f=directoryFixture();
  const {userDirectoryFilterState,applyUserDirectoryFilters}=__adminControllerInternals;
  f.attention.value='invitation';f.search.value='invite';f.role.value='client';
  const saved=userDirectoryFilterState(f.root);
  assert.deepEqual(saved,{query:'invite',status:'',role:'client',attention:'invitation'});
  f.attention.value='';f.search.value='';f.role.value='';
  assert.equal(applyUserDirectoryFilters(f.root,saved),1);
  assert.equal(f.attention.value,'invitation');
  assert.equal(f.search.value,'invite');
  assert.equal(applyUserDirectoryFilters(f.root,{query:'',status:'',role:'',attention:''}),4);
  assert.equal(f.reset.hidden,true);
  assert.equal(f.review.attributes.get('aria-pressed'),'false');
  assert.ok(f.cards.every(x=>!x.hidden));
});

test('Admin triage is a calm responsive tool, not a new authorization path',()=>{
  const section=css.slice(css.indexOf('SIGNATURE 360 · Admin access triage.'));
  assert.match(section,/@media\(max-width:680px\)/u);
  assert.match(section,/@media\(max-width:390px\)/u);
  assert.match(section,/@media\(forced-colors:active\)/u);
  assert.match(section,/min-height:48px/u);
  assert.match(section,/outline:3px solid var\(--iberfit-color-focus\)/u);
  assert.doesNotMatch(section,/\b(?:fetch|localStorage|sessionStorage)\s*\(/u);
  assert.doesNotMatch(section,/position:fixed/u);
});
