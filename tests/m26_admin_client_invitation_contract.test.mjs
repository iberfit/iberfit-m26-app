import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260908143000_admin_client_invitation_v26.sql', import.meta.url), 'utf8');
const edge = await readFile(new URL('../supabase/functions/iberfit-admin-client-invite-v1/index.ts', import.meta.url), 'utf8');
const transport = await readFile(new URL('../src/m26/admin/transport.js', import.meta.url), 'utf8');
const catalog = await readFile(new URL('../src/m26/admin/command-catalog.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/m26/admin/service.js', import.meta.url), 'utf8');

test('ADMIN client creation is a registered privileged command routed through hosted Auth', () => {
  assert.match(catalog, /ADMIN_CLIENTE_CREAR/);
  assert.match(service, /ADMIN_CLIENTE_CREAR/);
  assert.match(transport, /iberfit-admin-client-invite-v1/);
  assert.match(edge, /inviteUserByEmail/);
  assert.match(edge, /resetPasswordForEmail/);
});

test('invitation telemetry records attempts and sent timestamp only after accepted delivery', () => {
  assert.match(migration, /last_invitation_attempt_at/);
  assert.match(migration, /invitation_attempt_count=invitation_attempt_count\+1/);
  assert.match(migration, /invitation_delivery_status='pending'/);
  assert.match(migration, /invitation_sent_at=case when v_status='sent' then coalesce\(invitation_sent_at,now\(\)\) else invitation_sent_at end/i);
  assert.match(migration, /ADMIN_CLIENT_INVITATION_ERROR/);
});

test('existing Auth identities are reused without creating duplicates', () => {
  assert.match(edge, /findAuthUserByEmail/);
  assert.match(edge, /recovery-existing-user/);
  assert.match(migration, /V26_INVITE_IDENTITY_ALREADY_LINKED/);
  assert.match(migration, /V26_INVITE_IDENTITY_EMAIL_MISMATCH/);
});

test('new Auth identity is compensated if database binding fails', () => {
  assert.match(edge, /createdAuthUserId/);
  assert.match(edge, /deleteUser\(createdAuthUserId\)/);
  assert.match(edge, /iberfit_admin_client_invitation_bind_v26/);
});

test('invitation flow remains fail-closed behind actor authentication, admin authorization and privileged assurance', () => {
  assert.match(migration, /iberfit_require_privileged_assurance_v65d\(\)/);
  assert.match(migration, /roles','\[\]'::jsonb\)\?'admin'/);
  assert.match(edge, /ALLOWED_ORIGINS/);
  assert.match(edge, /authorization\.startsWith\('Bearer '\)/);
  assert.match(edge, /await userClient\.auth\.getUser\(\)/u);
  const authValidation=edge.indexOf('await userClient.auth.getUser()');
  const privilegedRpc=edge.indexOf("userClient.rpc('iberfit_admin_execute_v14'");
  assert.ok(authValidation>=0&&privilegedRpc>authValidation);
});


test('invitation Edge Function isolates canonical origins by deployed project', () => {
  assert.match(edge, /const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu'/u);
  assert.match(edge, /const PROD_PROJECT_REF='pjhmrhejsoofmouedavw'/u);
  assert.match(edge, /DEPLOYMENT_PROJECT_REF===QA_PROJECT_REF[\s\S]{0,180}\['https:\/\/m26-canary\.iberfit\.cl'\]/u);
  assert.match(edge, /DEPLOYMENT_PROJECT_REF===PROD_PROJECT_REF[\s\S]{0,180}\['https:\/\/app\.iberfit\.cl'\]/u);
  assert.match(edge, /:[\s\n]*\[\],[\s\n]*\);/u);
  assert.doesNotMatch(edge, /coach\.iberfit\.cl/u);
  assert.match(edge, /const FUNCTION_VERSION='admin-client-invite-v26\.3';/u);
});


test('OPTIONS 204 never carries a response body and preserves environment-bound CORS', () => {
  assert.match(edge, /new Response\(status===204\?null:JSON\.stringify\(body\),\{status,headers:cors\(origin\)\}\)/u);
  assert.match(edge, /if\(req\.method==='OPTIONS'\)return reply\(ALLOWED_ORIGINS\.has\(origin\)\?204:403,\{\},origin\)/u);
  assert.match(edge, /'https:\/\/app\.iberfit\.cl'/u);
  assert.match(edge, /'https:\/\/m26-canary\.iberfit\.cl'/u);
  assert.doesNotMatch(edge, /coach\.iberfit\.cl/u);
});
