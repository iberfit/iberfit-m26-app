import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  hasTrainingService,
  trainingServiceActive,
  trainingServiceKindFrom,
  trainingServiceStatusFrom,
} from '../src/m26/domain/training-service.js';
import {renderSessionsRoute} from '../src/m26/modules/route-render.js';

const migration=fs.readFileSync('supabase/migrations/20261005090000_person_iri_training_service_architecture_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/iberfit-admin-client-invite-v1/index.ts','utf8');
const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
const viewModel=fs.readFileSync('src/m26/modules/route-view-model.js','utf8');
const experience=fs.readFileSync('src/m26/experience/client-experience.js','utf8');
const render=fs.readFileSync('src/m26/modules/route-render.js','utf8');
const adminRender=fs.readFileSync('src/m26/admin/route-render.js','utf8');
const routeGuard=fs.readFileSync('src/m26/shell/route-guard.js','utf8');
const workflowController=fs.readFileSync('src/m26/app/workflow-controller.js','utf8');

test('persona, IRI y servicio de entrenamiento son dimensiones independientes',()=>{
  assert.match(migration,/create table if not exists public\.iberfit_training_service_events_v1/u);
  assert.match(migration,/person_id uuid not null references public\.clients\(id\)/u);
  assert.match(migration,/status text not null check\(status in \('active','paused','ended'\)\)/u);
  assert.match(migration,/IRI assessments are independent and never imply an active training service/u);
  assert.doesNotMatch(migration,/status text not null check\(status in \([^)]*iri_only/u);
  assert.doesNotMatch(migration,/\bdrop\s+(?:table|function|index|constraint)\b/iu);
  assert.doesNotMatch(migration,/\bdo\s+\$\$/iu);
  assert.match(controller,/entryIntent:serviceIntent/u);
  assert.match(controller,/trainingServiceStatus:iriEntry\?'none':'active'/u);
});

test('compatibilidad histórica nunca gana sobre el estado explícito de servicio',()=>{
  assert.equal(trainingServiceStatusFrom({trainingServiceStatus:'none',lifecycleStatus:'active'}),'none');
  assert.equal(trainingServiceStatusFrom({trainingServiceStatus:'active',lifecycleStatus:'iri_only'}),'active');
  assert.equal(trainingServiceStatusFrom({lifecycleStatus:'iri_only'}),'none');
  assert.equal(trainingServiceStatusFrom({}),'active');
  assert.equal(trainingServiceStatusFrom({lifecycleStatus:'onboarding'}),'active');
  assert.equal(hasTrainingService({trainingServiceStatus:'paused'}),true);
  assert.equal(hasTrainingService({trainingServiceStatus:'ended'}),false);
  assert.equal(trainingServiceActive({trainingServiceStatus:'paused'}),false);
  assert.equal(trainingServiceActive({trainingServiceStatus:'active'}),true);
  assert.equal(trainingServiceKindFrom({trainingServiceStatus:'none'}),'none');
  assert.equal(trainingServiceKindFrom({trainingServiceStatus:'active'}),'training');
});

test('la pausa conserva historial y planificación pero bloquea ejecutar una sesión',()=>{
  const pausedHtml=renderSessionsRoute({
    role:'client',
    serviceKind:'training',
    serviceActive:false,
    canBuild:false,
    sessions:[{
      id:'SESSION-PAUSED',
      title:'Sesión preparada',
      clientContent:{title:'Sesión preparada',summary:'Contenido confirmado'},
    }],
    sessionCounts:{published:1},
    executions:[],
    nextSessionPreparation:null,
  });
  assert.match(pausedHtml,/Entrenamiento en pausa/u);
  assert.match(pausedHtml,/consultar planificación, historial y contexto/u);
  assert.doesNotMatch(pausedHtml,/data-workflow-action="start-published-session"/u);

  const activeHtml=renderSessionsRoute({
    role:'client',
    serviceKind:'training',
    serviceActive:true,
    canBuild:false,
    sessions:[{
      id:'SESSION-ACTIVE',
      title:'Sesión preparada',
      clientContent:{title:'Sesión preparada',summary:'Contenido confirmado'},
    }],
    sessionCounts:{published:1},
    executions:[],
    nextSessionPreparation:null,
  });
  assert.match(activeHtml,/data-workflow-action="start-published-session"/u);
  assert.match(workflowController,/requireActiveTrainingService\(clientId\)/u);
  assert.match(workflowController,/M26_TRAINING_SERVICE_NOT_ACTIVE/u);
});

test('diagnóstico inicial y reevaluaciones quedan físicamente separados',()=>{
  assert.match(migration,/create table if not exists public\.iri_reevaluations_v1/u);
  assert.match(migration,/initial_assessment_id uuid not null/u);
  assert.match(migration,/create unique index if not exists iri_assessments_id_client_integrity_v1[\s\S]*?on public\.iri_assessments\(id,client_id\)/u);
  assert.match(migration,/constraint iri_reevaluations_initial_person_fk_v1[\s\S]*?foreign key\(initial_assessment_id,person_id\)[\s\S]*?references public\.iri_assessments\(id,client_id\)/u);
  assert.match(migration,/unique\(person_id,sequence\)/u);
  assert.match(migration,/follow-up\/evolution never mutates baseline semantics/u);
  assert.doesNotMatch(migration,/drop constraint/u);
  assert.doesNotMatch(migration,/drop index/u);
  assert.match(viewModel,/return !type\|\|type==='inicial'/u);
});

test('el IRI es recomendado pero nunca bloquea el entrenamiento',()=>{
  assert.match(experience,/const iriBlocking=false/u);
  assert.match(experience,/iriRequired:false/u);
  assert.match(experience,/iriRecommended/u);
  assert.match(routeGuard,/TRAINING_SERVICE_AREAS/u);
  assert.match(routeGuard,/!hasTrainingService\(serviceClient\)/u);
  assert.match(routeGuard,/M26_TRAINING_SERVICE_REQUIRED/u);
  assert.doesNotMatch(routeGuard,/M26_IRI_ONLY_TRAINING_ROUTE_FORBIDDEN/u);
  assert.match(controller,/initialAssessmentMode:iriEntry\?'iri':/u);
});

test('alta directa con IRI diferido no conserva un IRI vacío artificial',()=>{
  assert.match(migration,/v_entry='training' and v_assessment='deferred'/u);
  assert.match(migration,/status::text='borrador' and a\.revision=0/u);
  assert.match(migration,/not exists\(select 1 from public\.iri_consents_v1/u);
  assert.match(migration,/not exists\(select 1 from public\.iri_report_issuances_v1/u);
  assert.match(migration,/not exists\(select 1 from private\.m26_iri_drafts_v1/u);
  assert.match(migration,/delete from public\.iri_assessments/u);
});

test('la interfaz deja de presentar Solo IRI como un tipo de cliente',()=>{
  assert.doesNotMatch(render,/Solo IRI/u);
  assert.doesNotMatch(adminRender,/Solo IRI/u);
  assert.match(adminRender,/Diagnóstico IRI · recomendado/u);
  assert.match(adminRender,/Iniciar entrenamiento/u);
  assert.match(adminRender,/client-training-service/u);
  assert.match(render,/Sin entrenamiento activo/u);
});

test('el acceso a la app sigue siendo independiente del servicio contratado',()=>{
  assert.match(edge,/accessMode==='internal'/u);
  assert.match(edge,/accessStatus:'sin_acceso'/u);
  assert.match(edge,/reason:'internal_record'/u);
  const internal=edge.indexOf("accessMode==='internal'");
  const returned=edge.indexOf("reason:'internal_record'",internal);
  const service=edge.indexOf('const service=createClient',returned);
  const invite=edge.indexOf('inviteUserByEmail',service);
  assert.ok(internal>=0&&returned>internal&&service>returned&&invite>service);
});

test('mutar el servicio exige Admin, assurance privilegiado, razón e idempotencia',()=>{
  assert.match(migration,/iberfit_admin_set_training_service_v1/u);
  assert.match(migration,/iberfit_require_privileged_assurance_v65d/u);
  assert.match(migration,/V1_TRAINING_SERVICE_ADMIN_REQUIRED/u);
  assert.match(migration,/char_length\(v_reason\)<3/u);
  assert.match(migration,/iberfit_admin_mutation_receipts/u);
  assert.match(migration,/revoke all on function public\.iberfit_admin_set_training_service_v1\(jsonb,jsonb\) from public,anon/u);
  assert.match(migration,/grant execute on function public\.iberfit_admin_set_training_service_v1\(jsonb,jsonb\) to authenticated,service_role/u);
});
