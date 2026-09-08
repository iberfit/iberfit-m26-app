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

test('hosted onboarding persists the client before touching Auth and compensates only newly invited identities',()=>{
  const createIndex=edge.indexOf("userClient.rpc('iberfit_create_client_draft_v12'");
  const authLookupIndex=edge.indexOf('findUserByEmail(admin,email)');
  assert.ok(createIndex>=0&&authLookupIndex>createIndex,'client persistence must precede Auth operations');
  assert.match(edge,/admin\.auth\.admin\.inviteUserByEmail/);
  assert.match(edge,/if\(newlyInvitedUserId&&UUID\.test\(newlyInvitedUserId\)\)\{try\{await admin\.auth\.admin\.deleteUser/);
  assert.doesNotMatch(edge,/deleteUser\(String\(authUser/);
  assert.match(edge,/p_delivery:delivery/);
  assert.match(edge,/status:'error'/);
});

test('client onboarding requests invitation by default and no longer encodes a disabled invite',()=>{
  assert.match(onboarding,/inviteClient:true/);
  assert.doesNotMatch(onboarding,/inviteClient:false/);
  assert.match(onboarding,/onboardingVersion:'m26-v12\.4-invitation'/);
});
