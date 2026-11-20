import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  legacyClientDraftPayload,
  validateClientOnboardingDraft,
} from '../src/m26/workflows/client-onboarding.js';
import {initialAssessmentPostCreateArea} from '../src/m26/domain/initial-assessment.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261120112500_coach_deferred_iri_training_service_assignment_v1.sql');
const rollback=read('supabase/rollbacks/20261120112500_coach_deferred_iri_training_service_assignment_v1.rollback.sql');
const workflow=read('src/m26/app/workflow-controller.js');
const progressive=read('src/m26/onboarding/progressive-onboarding.js');

const essential={
  name:'Cliente QA Ejemplo',email:'cliente.p0@example.invalid',
  phone:'+56911111111',birthDate:'1991-11-10',modality:'online',
};

test('P0: posponer IRI solicita servicio activo sin fingir diagnóstico ni prescripción',()=>{
  const payload=legacyClientDraftPayload({...essential,initialAssessmentMode:'deferred'});
  assert.equal(payload.trainingServiceIntent,'active');
  assert.equal(payload.profile.initialAssessmentMode,'deferred');
  assert.equal(payload.objective,'Objetivo pendiente de definir');
  assert.equal(payload.frequency,'Frecuencia pendiente de acordar');
  assert.equal(payload.profile.primaryObjective,'');
  assert.equal(payload.profile.weeklyFrequency,null);
  assert.equal(payload.accessEnabled,false);
  assert.equal(payload.inviteClient,false);
  assert.deepEqual(payload.profile.onboardingPendingFields,[
    'sexForNorms','weeklyFrequency','sessionDurationMinutes','primaryObjective',
  ]);
  assert.equal(initialAssessmentPostCreateArea('deferred'),'expediente');
});

test('P0: IRI recomendado no activa un servicio implícito',()=>{
  const valid={...essential,initialAssessmentMode:'iri',
    sexForNorms:'female',weeklyFrequency:'2',sessionDurationMinutes:'60',
    primaryObjective:'Incrementar fuerza y movilidad sosteniblemente',
  };
  const payload=legacyClientDraftPayload(valid);
  assert.equal(payload.trainingServiceIntent,'none');
  assert.equal(payload.profile.initialAssessmentMode,'iri');
  assert.equal(payload.objective,valid.primaryObjective);
  assert.equal(payload.frequency,'2 sesiones por semana');
});

test('P0: identidad insuficiente nunca atraviesa el transporte',()=>{
  const errors=validateClientOnboardingDraft({
    ...essential,name:'',email:'invalid',phone:'',birthDate:'',
    initialAssessmentMode:'deferred',
  });
  assert.equal(errors.ok,false);
  for(const key of ['name','email','phone','birthDate'])assert.ok(errors.errors.includes(key));
  assert.match(workflow,/function validateClientOnboardingForm\(form\)/u);
  assert.match(workflow,/validateClientOnboardingDraft\(raw\)/u);
  assert.match(workflow,/ONBOARDING_FIELD_LABELS\[name\]/u);
  assert.match(workflow,/control\.setAttribute\?\.\('aria-invalid','true'\)/u);
  assert.match(workflow,/focusInvalidControl\(controls\[0\]\)/u);
});

test('P0: nueva alta diferida abre planificación, nunca exige completar IRI',()=>{
  assert.match(workflow,/payload\.trainingServiceIntent==='active'\?'planificacion':onboardingDestination/u);
  assert.match(workflow,/store\.selectClient\?\.\(created\.id\);store\.navigate\?\.\(nextArea\)/u);
  assert.match(progressive,/deferred\?'Crear expediente y abrir planificación'/u);
  assert.match(progressive,/Posponer el IRI/u);
  assert.match(progressive,/El diagnóstico inicial seguirá disponible para realizarlo después/u);
});

test('P0: backend conserva controles de identidad, org, autoría, historial y service RLS',()=>{
  assert.match(migration,/M26_COACH_DEFERRED_IRI_CREATE_SOURCE_DRIFT/u);
  assert.match(migration,/iberfit_require_privileged_assurance_v65d/u);
  assert.match(migration,/iberfit_create_client_draft_v12_pre_v65e\(p_payload\)/u);
  assert.match(migration,/IF NOT v_new THEN RETURN v_result; END IF/u);
  assert.match(migration,/v_coach_role:=v_primary='coach' OR EXISTS/u);
  assert.match(migration,/iberfit_assert_client_org_scope_v65e/u);
  assert.match(migration,/i\.created_by=v_actor/u);
  assert.match(migration,/public\.iberfit_coach_client_assignments/u);
  assert.match(migration,/public\.iberfit_training_service_events_v1/u);
  assert.match(migration,/ON CONFLICT\(client_id,coach_user_id\) DO NOTHING/u);
  assert.match(migration,/v_intent<>'active' THEN RETURN v_result/u);
  assert.match(migration,/M26_ONBOARDING_TRAINING_GATEWAY_ACL_DRIFT/u);
  assert.doesNotMatch(migration,/\b(?:DELETE|TRUNCATE|DROP TABLE|DISABLE ROW LEVEL SECURITY)\b/iu);
});

test('P0: rollback restaura la función exacta y no elimina los datos creados',()=>{
  assert.match(rollback,/c9590e8089d04f7129a21e2c17e714da/u);
  assert.match(rollback,/906a923478573671ddc5532af9172356/u);
  assert.doesNotMatch(rollback,/\b(?:DELETE|TRUNCATE|DROP TABLE|DISABLE ROW LEVEL SECURITY)\b/iu);
  assert.match(rollback,/M26_ONBOARDING_TRAINING_ROLLBACK_NOT_VERIFIED/u);
});
