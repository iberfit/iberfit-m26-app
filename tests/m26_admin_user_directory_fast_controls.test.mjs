import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {__adminControllerInternals} from '../src/m26/admin/controller.js';
import {createHydrationCoordinator} from '../src/m26/app/hydration-coordinator.js';
import {createAdminCommandService} from '../src/m26/admin/service.js';
import {projectAdminSnapshot} from '../src/m26/admin/admin-state.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('user directory renders fast local search, filters and stable user identity',()=>{
  const html=renderAdminRoute({
    admin:{available:true},
    kind:'admin-usuarios',
    users:[
      {id:'U1',userId:'U1',name:'Carlos Catalán',email:'carlos@example.com',status:'active',roles:['coach','admin'],primaryRole:'coach',revision:3,lastAccessAt:'2026-09-10T20:00:00Z'},
      {id:'U2',userId:'U2',name:'Ana',email:'ana@example.com',status:'suspended',roles:['client'],primaryRole:'client',revision:1},
    ],
    canManageStatus:true,
    canManageRoles:true,
  });

  assert.match(html,/data-admin-user-directory/u);
  assert.match(html,/data-admin-user-search/u);
  assert.match(html,/data-admin-user-filter="status"/u);
  assert.match(html,/data-admin-user-filter="role"/u);
  assert.match(html,/data-admin-user-visible-count>2</u);
  assert.match(html,/data-user-id="U1"/u);
  assert.match(html,/data-user-status="active"/u);
  assert.match(html,/data-user-roles="\|coach\|admin\|"/u);
  assert.match(html,/data-admin-form="user-status"/u);
  assert.match(html,/data-admin-form="role-change"/u);
  assert.match(html,/option value="active" selected/u);
  assert.match(html,/<dt>Último acceso<\/dt>/u);
  assert.match(html,/Cuenta 360/u);
});

test('user filter matching is accent-insensitive and combines query, status and role',()=>{
  const {normalizeUserFilter,applyUserDirectoryFilters}=__adminControllerInternals;
  assert.equal(normalizeUserFilter('  Catalán  '),'catalan');

  const search={value:'catalan'};
  const status={value:'active'};
  const role={value:'coach'};
  const count={textContent:'2'};
  const empty={hidden:true};
  const makeCard=(attrs)=>({
    hidden:false,
    getAttribute(name){return attrs[name]||'';},
  });
  const cards=[
    makeCard({'data-user-search':'carlos catalán carlos@example.com coach active','data-user-status':'active','data-user-roles':'|coach|admin|'}),
    makeCard({'data-user-search':'ana ana@example.com client suspended','data-user-status':'suspended','data-user-roles':'|client|'}),
  ];
  const directory={
    querySelector(selector){
      if(selector==='[data-admin-user-search]')return search;
      if(selector==='[data-admin-user-filter="status"]')return status;
      if(selector==='[data-admin-user-filter="role"]')return role;
      if(selector==='[data-admin-user-visible-count]')return count;
      if(selector==='[data-admin-user-no-results]')return empty;
      return null;
    },
    querySelectorAll(selector){return selector==='[data-admin-user-card]'?cards:[];},
  };
  const root={querySelector:(selector)=>selector==='[data-admin-user-directory]'?directory:null};

  assert.equal(applyUserDirectoryFilters(root),1);
  assert.equal(cards[0].hidden,false);
  assert.equal(cards[1].hidden,true);
  assert.equal(count.textContent,'1');
  assert.equal(empty.hidden,true);

  search.value='nadie';
  assert.equal(applyUserDirectoryFilters(root),0);
  assert.equal(count.textContent,'0');
  assert.equal(empty.hidden,false);
});

test('status and role mutations for the same user share a lock while other users remain independent',()=>{
  const {adminOperationLockKey}=__adminControllerInternals;
  const a=new FormData();a.set('userId','U1');
  const b=new FormData();b.set('userId','U2');

  assert.equal(adminOperationLockKey('user-status',a),'user:U1');
  assert.equal(adminOperationLockKey('role-change',a),'user:U1');
  assert.equal(adminOperationLockKey('user-status',b),'user:U2');
  assert.notEqual(adminOperationLockKey('user-status',a),adminOperationLockKey('user-status',b));
});

test('hydration coordinator coalesces overlap and guarantees a final pass for the newest change',async()=>{
  let releaseFirst;
  const firstGate=new Promise((resolve)=>{releaseFirst=resolve;});
  const calls=[];
  const coordinator=createHydrationCoordinator(async({reason})=>{
    calls.push(reason);
    if(calls.length===1)await firstGate;
    return reason;
  });

  const first=coordinator.request({reason:'first-change'});
  await Promise.resolve();
  const second=coordinator.request({reason:'second-change'});
  const third=coordinator.request({reason:'latest-change'});
  releaseFirst();

  const results=await Promise.all([first,second,third]);
  assert.deepEqual(calls,['first-change','latest-change']);
  assert.deepEqual(results,['latest-change','latest-change','latest-change']);
});

test('application integrates hydration coordinator instead of duplicate concurrent refreshes',()=>{
  const app=read('src/m26/app/application.js');
  assert.match(app,/import \{createHydrationCoordinator\} from '\.\/hydration-coordinator\.js';/u);
  assert.match(app,/const hydrationCoordinator=createHydrationCoordinator\(hydratePass\);/u);
  assert.match(app,/return hydrationCoordinator\.request\(options\);/u);
  assert.doesNotMatch(app,/hydrateInFlight|hydrateQueuedReason/u);
});


test('confirmed admin mutation returns promptly when the canonical refresh is still running',async()=>{
  const org='00000000-0000-4000-8000-000000000140';
  const admin=projectAdminSnapshot({
    ok:true,
    organization:{id:org,name:'IBERFIT',revision:1},
    permissions:['operation.manage_global'],
    data:{organizationUsers:[],applicationRoles:[],coachProfiles:[],coachClientAssignments:[],leads:[],clientLifecycle:[],operationalTasks:[],notificationTemplates:[],notificationDeliveries:[],automationRules:[],auditEvents:[]},
    analytics:{},
    revision:1,
  },{id:'U1',role:'admin'});
  let releaseRefresh;
  const gate=new Promise((resolve)=>{releaseRefresh=resolve;});
  let refreshStarted=false;
  const service=createAdminCommandService({
    transport:{execute:async()=>({ok:true,kind:'ack'})},
    getToken:async()=>'jwt',
    getAdminState:()=>admin,
    isOnline:()=>true,
    refreshWaitMs:0,
    refreshState:async()=>{refreshStarted=true;await gate;},
  });

  const result=await service.execute({
    operationId:'OP-FAST-ACK',
    type:'ADMIN_TAREA_CREAR',
    entityId:org,
    organizationId:org,
    payload:{title:'Revisar'},
  });

  assert.equal(result.ok,true);
  assert.equal(result.refreshPending,true);
  assert.equal(refreshStarted,true);
  releaseRefresh();
  assert.deepEqual(await result.whenRefreshed,{settled:true,ok:true});
});

test('refresh failure after an ACK is diagnosed without turning a saved mutation into a false failure',async()=>{
  const org='00000000-0000-4000-8000-000000000140';
  const admin=projectAdminSnapshot({
    ok:true,
    organization:{id:org,name:'IBERFIT',revision:1},
    permissions:['operation.manage_global'],
    data:{organizationUsers:[],applicationRoles:[],coachProfiles:[],coachClientAssignments:[],leads:[],clientLifecycle:[],operationalTasks:[],notificationTemplates:[],notificationDeliveries:[],automationRules:[],auditEvents:[]},
    analytics:{},
    revision:1,
  },{id:'U1',role:'admin'});
  const diagnostics=[];
  const service=createAdminCommandService({
    transport:{execute:async()=>({ok:true,kind:'ack'})},
    getToken:async()=>'jwt',
    getAdminState:()=>admin,
    isOnline:()=>true,
    refreshWaitMs:50,
    refreshState:async()=>{throw new Error('NETWORK');},
    onRefreshError:(error)=>diagnostics.push(error.message),
  });

  const result=await service.execute({
    operationId:'OP-ACK-REFRESH-FAIL',
    type:'ADMIN_TAREA_CREAR',
    entityId:org,
    organizationId:org,
    payload:{title:'Revisar'},
  });

  assert.equal(result.ok,true);
  assert.equal(result.refreshPending,false);
  assert.equal(result.refreshOk,false);
  assert.deepEqual(await result.whenRefreshed,{settled:true,ok:false});
  assert.deepEqual(diagnostics,['NETWORK']);
});
