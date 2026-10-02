import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261002160000_iri_only_lifecycle_v1.sql','utf8');
const route=fs.readFileSync('src/m26/admin/route-render.js','utf8');
const wizard=fs.readFileSync('src/m26/admin/client-create-wizard.js','utf8');
const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
const transport=fs.readFileSync('src/m26/admin/transport.js','utf8');
const viewModel=fs.readFileSync('src/m26/admin/view-model.js','utf8');
const commandCenter=fs.readFileSync('src/m26/admin/command-center.js','utf8');
const edge=fs.readFileSync('supabase/functions/iberfit-admin-client-invite-v1/index.ts','utf8');

test('lifecycle accepts iri_only and create remains transactional',()=>{
  assert.match(migration,/'iri_only'/);
  assert.match(migration,/create or replace function public\.iberfit_admin_create_client_v26/);
  assert.match(migration,/Solo IRI · sin recurrencia/);
  assert.match(migration,/status='sin_acceso'/);
  assert.match(migration,/iri_only_no_invitation/);
  assert.match(migration,/Asignación para evaluación e informe IRI/);
  assert.match(migration,/revoke all on function public\.iberfit_admin_create_client_v26/);
});

test('Admin explicitly separates training from standalone IRI',()=>{
  assert.match(route,/Solo IRI · diagnóstico \+ informe/);
  assert.match(route,/option value="iri_only">Solo IRI/);
  assert.match(route,/Personas y clientes/);
  assert.match(route,/Clientes activos/);
  assert.match(route,/Solo IRI/);
  assert.match(wizard,/syncEngagementMode/);
  assert.match(wizard,/Crear persona Solo IRI/);
  assert.match(controller,/engagementType/);
  assert.match(controller,/Solo IRI · sin recurrencia/);
});

test('standalone IRI bypasses invite delivery but preserves server-side defense',()=>{
  assert.match(transport,/isIriOnlyCreate/);
  assert.match(edge,/engagementType==='iri_only'/);
  assert.match(edge,/iri_only_no_invitation/);
});

test('iri_only assignment does not inflate Coach active portfolio or Admin training priorities',()=>{
  assert.match(viewModel,/iriOnlyClients/);
  assert.match(viewModel,/lifecycle\?\.status.*==='active'/s);
  assert.match(commandCenter,/iriOnlyPeople/);
  assert.match(commandCenter,/status\)\.toLowerCase\(\)!=='iri_only'/);
});
