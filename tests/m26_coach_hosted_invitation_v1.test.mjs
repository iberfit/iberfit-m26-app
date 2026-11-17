import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/iberfit-coach-client-invite-v1/index.ts','utf8');
const adminEdge=fs.readFileSync('supabase/functions/iberfit-admin-client-invite-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql','utf8');
const transport=fs.readFileSync('src/m26/supabase-transport.js','utf8');
const workflow=fs.readFileSync('src/m26/app/workflow-controller.js','utf8');
const app=fs.readFileSync('src/m26/app/application.js','utf8');
const route=fs.readFileSync('src/m26/modules/route-render.js','utf8');
const registry=fs.readFileSync('src/m26/ui/interactive-audit.js','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

test('Coach invitation is a separate user action, never implicit on client creation',()=>{
  assert.match(route,/data-workflow-action="coach-send-client-invite"/u);
  assert.match(registry,/'coach-send-client-invite':\{roles:\['coach'\],domain:'client-access'\}/u);
  assert.match(config,/\[functions\.iberfit-coach-client-invite-v1\]\s*verify_jwt\s*=\s*false/u);
  assert.match(transport,/\/functions\/v1\/iberfit-coach-client-invite-v1/u);
  assert.match(workflow,/sendCoachClientInvitation/u);
  assert.match(app,/ensurePrivilegedActionAssurance[^;]+confirmar invitación a cliente/u);
  assert.match(transport,/COACH_CLIENTE_REENVIAR_INVITACION/u);
  assert.match(edge,/COACH_CLIENTE_REENVIAR_INVITACION/u);
  assert.match(fs.readFileSync('src/m26/workflows/client-onboarding.js','utf8'),/inviteClient:false/u);
});

test('Three RPCs preserve privileged assurance and scope assigned Coach by organization',()=>{
  const fragments=migration.split(/create or replace function public\.iberfit_admin_client_invitation_/u).slice(1);
  assert.equal(fragments.length,3);
  for(const item of fragments){
    assert.match(item,/iberfit_require_privileged_assurance_v65d/u);
    assert.match(item,/iberfit_organization_memberships/u);
    assert.match(item,/client_assignments/u);
    assert.match(item,/iberfit_coach_client_assignments/u);
    assert.match(item,/V26_INVITE_ROLE_OR_CLIENT_SCOPE_REQUIRED/u);
    assert.match(item,/iberfit_assert_client_org_scope_v65e/u);
    assert.match(item,/auth\.uid\(\)/u);
  }
});

test('Server retains email identity consistency and rate limits repeated sends',()=>{
  assert.match(migration,/V26_INVITATION_RATE_LIMITED/u);
  assert.match(migration,/interval '3 minutes'/u);
  assert.match(migration,/V26_INVITE_IDENTITY_EMAIL_MISMATCH/u);
  assert.match(migration,/V26_INVITE_IDENTITY_ALREADY_LINKED/u);
  assert.match(edge,/await userClient\.auth\.getUser\(\)/u);
  assert.match(edge,/inviteUserByEmail/u);
  assert.match(adminEdge,/ADMIN_CLIENTE_CREAR/u);
  assert.doesNotMatch(edge,/iberfit_admin_execute_v14/u);
  assert.match(edge,/resetPasswordForEmail/u);
  assert.doesNotMatch(transport,/SUPABASE_SERVICE_ROLE_KEY/u);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY/u);
});


test('Migration only accepts verified QA/PROD baselines and refuses drift',()=>{
  assert.match(migration,/M26_COACH_INVITE_BASELINE_DRIFT/u);
  assert.match(migration,/M26_COACH_INVITE_ENVIRONMENT_DENIED/u);
  assert.match(migration,/6d3465abd99d9a10b95ff06b8c8f495c/u);
  assert.match(migration,/9590d58f17eab222970db25a1f5cc339/u);
  assert.match(edge,/SCOPE_REQUIRED/u);
  assert.match(edge,/rollbackAuth\.auth\.admin\.deleteUser\(createdAuthUserId\)/u);
});


test('Invitations preserve Auth identities when the provider already sent an email',()=>{
  assert.doesNotMatch(edge,/admin\.deleteUser\(/u);
  assert.doesNotMatch(edge,/rollbackAuth/u);
  assert.match(edge,/Never delete an Auth identity/u);
  assert.match(migration,/V26_COACH_INVITE_ACCESS_REVOKED/u);
  assert.match(migration,/V26_COACH_INVITE_CONTACT_DRIFT/u);
  assert.match(workflow,/coach-client-invitation/u);
  assert.match(workflow,/coachInvitationOutcome/u);
});

test('Each multi-RPC step blocks a revoked account even if revoked after prepare',()=>{
  for(const name of ['prepare','bind','finalize']){
    const re=new RegExp('create or replace function public\\.iberfit_admin_client_invitation_'+name+'_v26\\([\\s\\S]*?(?=create or replace function public\\.|COMMIT;)', 'u');
    const block=migration.match(re)?.[0];
    assert.ok(block,name);
    assert.match(block,/V26_COACH_INVITE_ACCESS_REVOKED/u,name);
    assert.match(block,/iberfit_require_privileged_assurance_v65d/u,name);
  }
});
