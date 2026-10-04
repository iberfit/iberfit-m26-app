import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261002234000_solo_iri_access_mode_v1.sql','utf8');
const correctiveMigration=fs.readFileSync('supabase/migrations/20261003021000_solo_iri_restore_client_create_least_privilege_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/iberfit-admin-client-invite-v1/index.ts','utf8');
const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
const viewModel=fs.readFileSync('src/m26/modules/route-view-model.js','utf8');
const render=fs.readFileSync('src/m26/modules/route-render.js','utf8');
const routeGuard=fs.readFileSync('src/m26/shell/route-guard.js','utf8');

test('Solo IRI uses one canonical lifecycle and explicit access mode',()=>{
  assert.match(migration,/v_initial_lifecycle not in \('onboarding','iri_only'\)/u);
  assert.match(migration,/case when v_initial_lifecycle='iri_only' then 'internal' else 'app' end/u);
  assert.match(migration,/v_access_mode not in \('internal','app'\)/u);
  assert.match(migration,/case when v_access_mode='internal' then 'sin_acceso' else 'invitacion_pendiente' end/u);
  assert.doesNotMatch(migration,/values\([\s\S]{0,180}'inactive'/u);
  assert.match(controller,/initialLifecycleStatus:iriOnly\?'iri_only':'onboarding'/u);
  assert.match(controller,/accessMode,/u);
});

test('internal record never implies an invitation or Hosted Auth identity',()=>{
  assert.match(edge,/accessMode==='internal'/u);
  assert.match(edge,/accessStatus:'sin_acceso'/u);
  assert.match(edge,/reason:'internal_record'/u);
  const internal=edge.indexOf("accessMode==='internal'");
  const returned=edge.indexOf("reason:'internal_record'",internal);
  const service=edge.indexOf('const service=createClient',returned);
  const invite=edge.indexOf('inviteUserByEmail',service);
  assert.ok(internal>=0&&returned>internal&&service>returned&&invite>service);
});

test('Solo IRI is excluded from training semantics at ViewModel and route guard level',()=>{
  assert.match(viewModel,/experience\.serviceKind!=='iri_only'/u);
  assert.match(viewModel,/selectedIriOnly/u);
  assert.match(viewModel,/iriOnly\?\[\]:deriveAdherenceAlerts/u);
  assert.match(viewModel,/canBuild: !iriOnly/u);
  assert.match(viewModel,/canGenerate: !iriOnly/u);
  assert.match(routeGuard,/IRI_ONLY_TRAINING_AREAS/u);
  assert.match(routeGuard,/M26_IRI_ONLY_TRAINING_ROUTE_FORBIDDEN/u);
});

test('Solo IRI surfaces explain evaluation-only state instead of training actions',()=>{
  assert.match(render,/Persona · Solo IRI/u);
  assert.match(render,/Sin seguimiento de entrenamiento/u);
  assert.match(render,/Sin planificación de entrenamiento/u);
  assert.match(render,/Sin sesiones de entrenamiento/u);
  assert.match(render,/Seguimiento diario no activado/u);
  assert.match(render,/Propuestas de entrenamiento no activadas/u);
  assert.match(render,/Abrir \/ completar IRI/u);
  assert.match(render,/Ver informe IRI/u);
  assert.match(render,/IRI en preparación/u);
  assert.match(render,/borrador protegido/u);
  assert.match(render,/recupera el borrador local o remoto disponible/u);
});

test('least privilege is restored append-only after the immutable Solo IRI migration',()=>{
  assert.match(migration,/grant execute on function public\.iberfit_admin_create_client_v26\(jsonb,jsonb\) to authenticated,service_role/u);
  assert.match(correctiveMigration,/revoke all on function public\.iberfit_admin_create_client_v26\(jsonb,jsonb\)[\s\S]*?from public,anon,authenticated/u);
  assert.match(correctiveMigration,/grant execute on function public\.iberfit_admin_create_client_v26\(jsonb,jsonb\)[\s\S]*?to service_role/u);
  assert.match(correctiveMigration,/revoke all on function public\.iberfit_admin_create_client_v26_pre_privileged_assurance\(jsonb,jsonb\)[\s\S]*?from public,anon,authenticated/u);
  assert.match(correctiveMigration,/grant execute on function public\.iberfit_admin_create_client_v26_pre_privileged_assurance\(jsonb,jsonb\)[\s\S]*?to service_role/u);
  assert.doesNotMatch(correctiveMigration,/grant execute[\s\S]*?to authenticated/u);
});
