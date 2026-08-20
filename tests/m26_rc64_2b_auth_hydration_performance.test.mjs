import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  filterSnapshotForAssignmentScope,
} from '../src/m26/shared/integration-context.js';
import {
  stateFromBootstrap,
} from '../src/m26/production-state.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function coachSnapshot(){
  return {
    user:{id:'usr-coach',role:'coach',name:'Coach QA'},
    canary:{active:true,scope:'allowlist',version:'26.0.0'},
    environment:{name:'PRODUCTION'},
    serverTime:'2026-08-20T16:00:00.000Z',
    data:{
      clients:[
        {id:'client-a',name:'A'},
        {id:'client-b',name:'B'},
      ],
      clientProfiles:[
        {id:'client-a',clientId:'client-a',objective:'A'},
        {id:'client-b',clientId:'client-b',objective:'B'},
      ],
      appointments:[
        {id:'appt-a',clientId:'client-a',status:'confirmed'},
        {id:'appt-b',clientId:'client-b',status:'confirmed'},
      ],
      metrics:{progress:null},
    },
    remoteRevisions:{},
  };
}

test('RC64.2B coach assignment projection filters without cloning the entire remote snapshot',()=>{
  const source=coachSnapshot();
  const projected=filterSnapshotForAssignmentScope(
    source,
    {
      available:true,
      membershipStatus:'active',
      assignmentScopeEnforced:true,
      assignedClientIds:['client-a'],
      revision:2,
    },
    'coach',
  );

  assert.notEqual(projected,source);
  assert.notEqual(projected.data,source.data);
  assert.deepEqual(projected.data.clients.map((item)=>item.id),['client-a']);
  assert.deepEqual(projected.data.clientProfiles.map((item)=>item.clientId),['client-a']);
  assert.deepEqual(projected.data.appointments.map((item)=>item.clientId),['client-a']);

  assert.deepEqual(source.data.clients.map((item)=>item.id),['client-a','client-b']);
  assert.deepEqual(source.data.clientProfiles.map((item)=>item.clientId),['client-a','client-b']);
  assert.deepEqual(source.data.appointments.map((item)=>item.clientId),['client-a','client-b']);

  const integration=read('src/m26/shared/integration-context.js');
  const fnStart=integration.indexOf('export function filterSnapshotForAssignmentScope');
  assert.ok(fnStart>=0);
  const block=integration.slice(fnStart);
  assert.doesNotMatch(block,/structuredClone\(snapshot\)/u);
});

test('RC64.2B coach state keeps defensive collection isolation without a redundant second collection clone',()=>{
  const source=coachSnapshot();
  const state=stateFromBootstrap(source);

  assert.equal(state.identity.role,'coach');
  assert.notEqual(state.collections.clients,source.data.clients);
  assert.notEqual(state.collections.clients[0],source.data.clients[0]);

  state.collections.clients[0].name='Changed only in canonical state';
  assert.equal(source.data.clients[0].name,'A');

  const production=read('src/m26/production-state.js');
  assert.match(
    production,
    /identity\.role==='client'\?restrictCollectionsForIdentity\(rawCollections,identity\):rawCollections/u,
  );
});

test('RC64.2B first hydration skips full-state JSON equality work but rehydration retains dedupe guard',()=>{
  const store=read('src/m26/canonical-store.js');
  assert.match(store,/const initialHydration=!state\?\.identity\|\|state\?\.hydration\?\.status!=='ready';/u);
  assert.match(store,/if\(!initialHydration&&sameJson\(next,state\)\)return getState\(\);/u);
  assert.match(store,/function sameJson\(a,b\)/u);
});
