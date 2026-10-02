import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deriveAdminCommandCenter} from '../src/m26/admin/command-center.js';
import {buildCoach360Rows} from '../src/m26/admin/view-model.js';
import {todayOverview} from '../src/m26/modules/domain-selectors.js';

test('Solo IRI is visible as a person but excluded from active coach portfolio and operational pressure',()=>{
  const clients=[
    {id:'active-1',name:'Activa',relationshipType:'training',lifecycle:{status:'active'},assignments:[{status:'active'}],experience:{stage:'active'}},
    {id:'iri-1',name:'IRI',relationshipType:'iri_only',lifecycle:{status:'inactive'},assignments:[{status:'active'}],experience:{stage:'planning'}},
  ];
  const center=deriveAdminCommandCenter({clients,coaches:[],tasks:[]});
  assert.equal(center.summary.totalPeople,2);
  assert.equal(center.summary.iriOnlyPeople,1);
  assert.equal(center.summary.activeClients,1);
  assert.equal(center.priorities.some((item)=>item.clientId==='iri-1'),false);

  const rows=buildCoach360Rows({
    coaches:[{userId:'coach-1',name:'Coach'}],
    users:[{userId:'coach-1',roles:['coach'],status:'active'}],
    clients,
    assignments:[
      {coachUserId:'coach-1',clientId:'active-1',status:'active'},
      {coachUserId:'coach-1',clientId:'iri-1',status:'active'},
    ],
  });
  assert.equal(rows[0].clientCount,1);
  assert.equal(rows[0].assignmentCount,2);
  assert.equal(rows[0].iriOnlyCount,1);
  assert.deepEqual(rows[0].clients.map((item)=>item.id),['active-1']);
});

test('Solo IRI remains explicitly accessible but stays out of Coach daily portfolio',()=>{
  const state={
    identity:{role:'coach'},
    collections:{
      clients:[{id:'active-1',name:'Activa'},{id:'iri-1',name:'Solo IRI'}],
      clientProfiles:[
        {id:'p1',clientId:'active-1',version:1,revision:1,profile:{relationshipType:'training'}},
        {id:'p2',clientId:'iri-1',version:1,revision:1,profile:{relationshipType:'iri_only'}},
      ],
      appointments:[],sessionExecutions:[],sessions:[],iriAssessments:[],reports:[],trainingCycles:[],
    },
    pendingOperations:[],conflicts:[],rejectedOperations:[],
  };
  const overview=todayOverview(state,new Date('2026-10-02T12:00:00-03:00'));
  assert.deepEqual(overview.summaries.map((item)=>item.client.id),['active-1']);
  assert.equal(state.collections.clients.some((item)=>item.id==='iri-1'),true);
});

test('Admin supports creating and classifying a Solo IRI person',()=>{
  const route=fs.readFileSync('src/m26/admin/route-render.js','utf8');
  const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
  const wizard=fs.readFileSync('src/m26/admin/client-create-wizard.js','utf8');
  const migration=fs.readFileSync('supabase/migrations/20261002213000_client_lifecycle_iri_only_v1.sql','utf8');
  const edge=fs.readFileSync('supabase/functions/iberfit-admin-client-invite-v1/index.ts','utf8');
  assert.match(route,/Relación con IBERFIT/);
  assert.match(route,/value="iri_only">Solo Diagnóstico IRI/);
  assert.match(route,/value="iri_only">Solo Diagnóstico IRI/);
  assert.match(controller,/relationshipType/);
  assert.match(wizard,/syncRelationshipType/);
  assert.match(migration,/v_relationship not in \('training','iri_only'\)/);
  assert.match(migration,/custodia y gestión del Diagnóstico IRI/);
  assert.match(migration,/status='sin_acceso'/);
  assert.match(edge,/relationshipType==='iri_only'/);
  assert.match(edge,/reason:'iri_only_no_access'/);
});
