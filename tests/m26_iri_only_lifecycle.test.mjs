import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deriveAdminCommandCenter} from '../src/m26/admin/command-center.js';
import {buildCoach360Rows} from '../src/m26/admin/view-model.js';

test('Solo IRI is visible as a person but excluded from active coach portfolio and operational pressure',()=>{
  const clients=[
    {id:'active-1',name:'Activa',lifecycle:{status:'active'},assignments:[{status:'active'}],experience:{stage:'active'}},
    {id:'iri-1',name:'IRI',lifecycle:{status:'iri_only'},assignments:[{status:'active'}],experience:{stage:'planning'}},
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

test('Admin supports creating and classifying a Solo IRI person',()=>{
  const route=fs.readFileSync('src/m26/admin/route-render.js','utf8');
  const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
  const wizard=fs.readFileSync('src/m26/admin/client-create-wizard.js','utf8');
  const migration=fs.readFileSync('supabase/migrations/20261002213000_client_lifecycle_iri_only_v1.sql','utf8');
  assert.match(route,/Relación con IBERFIT/);
  assert.match(route,/value="iri_only">Solo Diagnóstico IRI/);
  assert.match(route,/option value="iri_only">Solo IRI/);
  assert.match(controller,/relationshipType/);
  assert.match(wizard,/syncRelationshipType/);
  assert.match(migration,/'iri_only'::text/);
  assert.match(migration,/custodia y gestión del Diagnóstico IRI/);
});
