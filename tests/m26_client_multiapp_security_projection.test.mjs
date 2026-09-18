import test from 'node:test';
import assert from 'node:assert/strict';

import {stateFromBootstrap} from '../src/m26/production-state.js';
import {createShellViewModel} from '../src/m26/shell/shell-view-model.js';

function snapshot(userOverrides={}){
  return {
    user:{
      id:'usr-client-multiapp',
      name:'Cliente multiapp',
      email:'client.multiapp@example.org',
      role:'client',
      clientId:'client-own',
      authorizedRoles:['client','admin'],
      roleChoiceConfirmed:false,
      ...userOverrides,
    },
    canary:{active:true,scope:'allowlist',version:'26.0.0'},
    environment:{mode:'QA'},
    data:{
      clients:[
        {id:'client-own',name:'Cliente propio'},
        {id:'client-other',name:'Otro cliente'},
      ],
      privateNotes:[
        {id:'note-own',clientId:'client-own',note:'privada'},
      ],
    },
  };
}

test('Client identity remains minimized while app authorization is stored separately',()=>{
  const state=stateFromBootstrap(snapshot());
  assert.deepEqual(state.identity,{
    id:'usr-client-multiapp',
    role:'client',
    clientId:'client-own',
    name:'Cliente multiapp',
    email:'client.multiapp@example.org',
  });
  assert.deepEqual(state.applicationAccess.authorizedRoles,['client','admin']);
  assert.equal(state.applicationAccess.roleChoiceConfirmed,false);
});

test('Client multiapp access does not weaken Client data projection',()=>{
  const state=stateFromBootstrap(snapshot({authorizedRoles:['client','coach','admin']}));
  assert.deepEqual(state.applicationAccess.authorizedRoles,['client','coach','admin']);
  assert.equal(Object.hasOwn(state.identity,'authorizedRoles'),false);
  assert.equal(Object.hasOwn(state.identity,'roleChoiceConfirmed'),false);
  assert.deepEqual(state.collections.clients.map((item)=>item.id),['client-own']);
  assert.deepEqual(state.collections.privateNotes,[]);
});

test('shell receives authorized apps without expanding persisted Client identity',()=>{
  const state=stateFromBootstrap(snapshot());
  const vm=createShellViewModel(state);
  assert.deepEqual(vm.identity.authorizedRoles,['admin','client']);
  assert.equal(vm.canSwitchApplication,true);
  assert.equal(vm.needsRoleChoice,true);
  assert.equal(Object.hasOwn(state.identity,'authorizedRoles'),false);
});

test('role aliases are normalized and the active role is retained only in application access',()=>{
  const state=stateFromBootstrap(snapshot({authorizedRoles:['administrador','cliente','admin']}));
  assert.deepEqual(state.applicationAccess.authorizedRoles,['admin','client']);
  assert.equal(state.identity.role,'client');
  assert.equal(Object.hasOwn(state.identity,'authorizedRoles'),false);
});
