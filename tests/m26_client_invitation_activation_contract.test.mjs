import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20260908162000_client_invitation_activation_v26.sql',import.meta.url),'utf8');
const edge=await readFile(new URL('../supabase/functions/iberfit-client-onboarding-v1/index.ts',import.meta.url),'utf8');
const onboarding=await readFile(new URL('../src/m26/workflows/client-onboarding.js',import.meta.url),'utf8');

test('invitation lifecycle persists pending, sent, linked-existing and error states',()=>{
  assert.match(migration,/invitation_attempt_count integer not null default 0/);
  assert.match(migration,/last_invitation_attempt_at timestamptz/);
  assert.match(migration,/invitation_sent_at timestamptz/);
  assert.match(migration,/invitation_status in \('not_started','pending','sent','linked_existing','error'\)/);
  assert.match(migration,/invitation_attempt_count=invitation_attempt_count\+1/);
  assert.match(migration,/case when v_delivery='sent' then coalesce\(invitation_sent_at,v_sent_at\) else invitation_sent_at end/);
});

test('invitation lifecycle remains privileged, scoped and audited',()=>{
  assert.equal((migration.match(/iberfit_require_privileged_assurance_v65d\(\)/g)||[]).length,3);
  assert.match(migration,/IBERFIT_INVITATION_CLIENT_SCOPE_REQUIRED/);
  assert.match(migration,/IBERFIT_INVITATION_AUTH_EMAIL_MISMATCH/);
  assert.match(migration,/IBERFIT_INVITATION_AUTH_USER_CONFLICT/);
  assert.match(migration,/CLIENTE_INVITACION_INTENTO/);
  assert.match(migration,/CLIENTE_INVITACION_COMPLETADA/);
  assert.match(migration,/CLIENTE_INVITACION_ERROR/);
  assert.match(migration,/iberfit_client_invitation_begin_v26\(uuid,text\) from public, anon, service_role/);
  assert.match(migration,/iberfit_client_invitation_finalize_v26\(uuid,uuid,text\) from public, anon, service_role/);
  assert.match(migration,/iberfit_client_invitation_fail_v26\(uuid,text\) from public, anon, service_role/);
});

test('retired hosted onboarding edge is inert and cannot touch Auth or service-role data',()=>{
  assert.match(edge,/const VERSION='client-onboarding-retired-v1'/u);
  assert.match(edge,/M26_CLIENT_ONBOARDING_RETIRED/u);
  assert.match(edge,/status:410/u);
  assert.doesNotMatch(edge,/createClient|SUPABASE_SERVICE_ROLE_KEY|inviteUserByEmail|deleteUser|iberfit_client_invitation_/u);
});

test('shared client creation no longer requests invitation implicitly',()=>{
  assert.match(onboarding,/inviteClient:false/u);
  assert.doesNotMatch(onboarding,/inviteClient:true/u);
  assert.match(onboarding,/onboardingVersion:'m26-v12\.5-expediente'/u);
});
