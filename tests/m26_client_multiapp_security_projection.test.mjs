import test from 'node:test';
import assert from 'node:assert/strict';

import {stateFromBootstrap} from '../src/m26/production-state.js';

function snapshot(userOverrides={}){
  return {
    user:{
      id:'usr-client-multiapp',
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

test('client projection preserves backend-authorized multiapp metadata',()=>{
  const state=stateFromBootstrap(snapshot());
  assert.equal(state.identity.role,'client');
  assert.equal(state.identity.clientId,'client-own');
  assert.deepEqual(state.identity.authorizedRoles,['client','admin']);
  assert.equal(state.identity.roleChoiceConfirmed,false);
});

test('client multiapp metadata does not weaken client data projection',()=>{
  const state=stateFromBootstrap(snapshot({authorizedRoles:['client','coach','admin']}));
  assert.deepEqual(state.identity.authorizedRoles,['client','coach','admin']);
  assert.deepEqual(state.collections.clients.map((item)=>item.id),['client-own']);
  assert.deepEqual(state.collections.privateNotes,[]);
});

test('role aliases are normalized and the active role is always retained',()=>{
  const state=stateFromBootstrap(snapshot({authorizedRoles:['administrador','cliente','admin']}));
  assert.deepEqual(state.identity.authorizedRoles,['admin','client']);
});
