import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminEdge=fs.readFileSync('supabase/functions/iberfit-admin-client-invite-v1/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql','utf8');
const transport=fs.readFileSync('src/m26/supabase-transport.js','utf8');
const workflow=fs.readFileSync('src/m26/app/workflow-controller.js','utf8');
const app=fs.readFileSync('src/m26/app/application.js','utf8');
const ui=fs.readFileSync('src/m26/modules/route-render.js','utf8');
const registry=fs.readFileSync('src/m26/ui/interactive-audit.js','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

test('Coach invites explicitly using canonical Admin Edge with independent SQL authorization',()=>{
  assert.match(ui,/data-workflow-action="coach-send-client-invite"/u);
  assert.match(registry,/'coach-send-client-invite':\{roles:\['coach'\],domain:'client-access'\}/u);
  assert.match(config,/\[functions\.iberfit-admin-client-invite-v1\]\s*verify_jwt\s*=\s*false/u);
  assert.doesNotMatch(config,/iberfit-coach-client-invite-v1/u);
  assert.match(transport,/\/functions\/v1\/iberfit-admin-client-invite-v1/u);
  assert.match(transport,/ADMIN_CLIENTE_REENVIAR_INVITACION/u);
  assert.match(adminEdge,/ADMIN_CLIENTE_REENVIAR_INVITACION/u);
  assert.match(adminEdge,/await userClient\.auth\.getUser\(\)/u);
  assert.match(adminEdge,/inviteUserByEmail/u);
  assert.match(adminEdge,/resetPasswordForEmail/u);
  assert.match(workflow,/sendCoachClientInvitation/u);
  assert.match(app,/ensurePrivilegedActionAssurance[^;]+confirmar invitación a cliente/u);
  assert.match(fs.readFileSync('src/m26/workflows/client-onboarding.js','utf8'),/inviteClient:false/u);
  assert.doesNotMatch(transport,/SUPABASE_SERVICE_ROLE_KEY/u);
});

test('Prepare, bind and finalize guard real Coach, membership, client and WebAuthn',()=>{
  const functions=sql.split(/create or replace function public\.iberfit_admin_client_invitation_/u).slice(1);
  assert.equal(functions.length,3);
  for(const fn of functions){
    assert.match(fn,/iberfit_require_privileged_assurance_v65d/u);
    assert.match(fn,/iberfit_organization_memberships/u);
    assert.match(fn,/client_assignments/u);
    assert.match(fn,/iberfit_coach_client_assignments/u);
    assert.match(fn,/V26_INVITE_ROLE_OR_CLIENT_SCOPE_FORBIDDEN/u);
    assert.match(fn,/iberfit_assert_client_org_scope_v65e/u);
    assert.match(fn,/auth\.uid\(\)/u);
    assert.match(fn,/V26_COACH_INVITE_ACCESS_REVOKED/u);
  }
});

test('The existing Edge maps SQL forbidden to 403 and does not bypass bearer checks',()=>{
  assert.match(adminEdge,/ADMIN_REQUIRED\|AUTH_REQUIRED\|WEBAUTHN\|ASSURANCE\|FORBIDDEN/u);
  assert.match(sql,/V26_INVITE_ROLE_OR_CLIENT_SCOPE_FORBIDDEN/u);
  assert.match(sql,/V26_INVITE_IDENTITY_EMAIL_MISMATCH/u);
  assert.match(sql,/V26_INVITE_IDENTITY_ALREADY_LINKED/u);
  assert.match(sql,/V26_INVITATION_RATE_LIMITED/u);
  assert.match(sql,/V26_COACH_INVITE_CONTACT_DRIFT/u);
});

test('SQL staging rejects drift, while frontend dedupes and tracks provider receipts',()=>{
  assert.match(sql,/M26_COACH_INVITE_BASELINE_DRIFT/u);
  assert.match(sql,/6d3465abd99d9a10b95ff06b8c8f495c/u);
  assert.match(sql,/9590d58f17eab222970db25a1f5cc339/u);
  assert.match(workflow,/coach-client-invitation/u);
  assert.match(workflow,/coachInvitationOutcome/u);
  assert.match(workflow,/M26_COACH_INVITE_DELIVERY_UNCONFIRMED/u);
});

test('Hosted Auth acceptance cannot delete the user and retains a recoverable pending state',()=>{
  assert.doesNotMatch(adminEdge,/auth\.admin\.deleteUser/u);
  assert.match(adminEdge,/providerAccepted=true/u);
  assert.match(adminEdge,/if\(providerAccepted&&clientId&&UUID\.test\(clientId\)\)/u);
  assert.match(adminEdge,/V26_INVITATION_RECONCILIATION_REQUIRED/u);
  assert.match(adminEdge,/provider_accepted_reconciliation_pending/u);
});

test('Coach/Admin finalize is operation-scoped, terminal-idempotent and serialized',()=>{
  const qa=fs.readFileSync('supabase/qa-migrations/20261117224500_coach_invitation_finalize_cas_v2.sql','utf8');
  const revert=fs.readFileSync('supabase/qa-rollbacks/20261117224500_coach_invitation_finalize_cas_v2_rollback.sql','utf8');
  for(const src of [sql,qa]){
    assert.match(src,/V26_INVITATION_OPERATION_STALE/u);
    assert.match(src,/V26_INVITATION_DELIVERY_TRANSITION_DENIED/u);
    assert.match(src,/last_invitation_operation_id is distinct from v_op/u);
    assert.match(src,/invitation_delivery_status is distinct from 'pending'/u);
    assert.match(src,/and last_invitation_operation_id=v_op/u);
    assert.match(src,/and invitation_delivery_status='pending'/u);
    assert.match(src,/for update/u);
  }
  assert.match(qa,/M26_QA_FINALIZER_BASELINE_OR_ENV_DRIFT/u);
  assert.match(qa,/M26_QA_FINALIZER_READBACK_FAILED/u);
  assert.match(revert,/M26_QA_FINALIZER_ROLLBACK_DRIFT/u);
  assert.match(revert,/a4cc1e25bba797774ec3b7e1c4536947/u);
  assert.doesNotMatch(qa,/GRANT\s+EXECUTE/iu);
});
