import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderAdminRoute} from '../src/m26/admin/route-render.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n?/gu,'\n');

test('Admin user deletion is a privileged first-class command routed through the server function',()=>{
  const catalog=read('src/m26/admin/command-catalog.js');
  const service=read('src/m26/admin/service.js');
  const transport=read('src/m26/admin/transport.js');
  const controller=read('src/m26/admin/controller.js');

  assert.match(catalog,/ADMIN_USUARIO_ELIMINAR/u);
  assert.match(catalog,/USER_MANAGE_STATUS/u);
  assert.match(service,/PRIVILEGED_REAUTH_COMMANDS[^\n]*ADMIN_USUARIO_ELIMINAR/u);
  assert.match(transport,/iberfit-admin-user-decommission-v1/u);
  assert.match(transport,/type==='ADMIN_USUARIO_ELIMINAR'/u);
  assert.match(controller,/kind==='user-delete'/u);
  assert.match(controller,/confirmUserId/u);
  assert.match(controller,/confirmPhrase/u);
});

test('Admin user deletion UI requires double confirmation and never exposes self-delete',()=>{
  const otherId='22222222-2222-4222-8222-222222222222';
  const currentId='11111111-1111-4111-8111-111111111111';
  const html=renderAdminRoute({
    admin:true,
    kind:'admin-usuarios',
    users:[
      {id:currentId,userId:currentId,name:'Admin actual',email:'admin@iberfit.cl',authEmail:'admin@iberfit.cl',status:'active',revision:3,roles:['admin'],primaryRole:'admin'},
      {id:otherId,userId:otherId,name:'Coach prueba',email:'coach@iberfit.cl',authEmail:'coach@iberfit.cl',status:'active',revision:4,roles:['coach'],primaryRole:'coach',coach:{name:'Coach prueba',activeClientCount:2}},
    ],
    roles:[],
    currentUserId:currentId,
    canManageStatus:true,
    canManageRoles:true,
    user360Summary:{total:2,activeUsers:2,pendingInvitations:0,integrityIssueCount:0},
  });

  assert.match(html,/data-admin-form="user-delete"/u);
  assert.match(html,/name="confirmAcknowledged"/u);
  assert.match(html,/name="confirmValue"/u);
  assert.match(html,/name="confirmPhrase"/u);
  assert.match(html,/pattern="ELIMINAR"/u);
  assert.match(html,/Eliminar cuenta/u);
  assert.match(html,/Cuenta Admin actual protegida/u);
  assert.equal((html.match(/data-admin-form="user-delete"/gu)||[]).length,1);
});

test('Database decommission is fail-closed, idempotent and preserves protected history',()=>{
  const sql=read('supabase/migrations/20260912143000_admin_user_decommission_v1.sql');

  assert.match(sql,/iberfit_require_privileged_assurance_v65d/u);
  assert.match(sql,/iberfit_admin_require_v14/u);
  assert.match(sql,/IBERFIT_ADMIN_USER_DELETE_SELF_FORBIDDEN/u);
  assert.match(sql,/IBERFIT_ADMIN_USER_DELETE_LAST_ADMIN_PROTECTED/u);
  assert.match(sql,/IBERFIT_ADMIN_USER_DELETE_REVISION_CONFLICT/u);
  assert.match(sql,/iberfit_admin_mutation_receipts/u);
  assert.match(sql,/kind','duplicate'/u);
  assert.match(sql,/iberfit_assert_org_user_scope_v65e/u);
  assert.match(sql,/iberfit_assert_global_role_mutation_scope_v65e/u);

  assert.match(sql,/iberfit_coach_client_assignments[\s\S]*status='ended'/u);
  assert.match(sql,/client_assignments[\s\S]*active=false/u);
  assert.match(sql,/iberfit_conversation_threads[\s\S]*status='closed'/u);
  assert.match(sql,/coach_availability_v26[\s\S]*active=false/u);
  assert.match(sql,/client_access_v26[\s\S]*status='revocado'/u);
  assert.match(sql,/client_intake_profiles[\s\S]*auth_user_id=null/u);
  assert.match(sql,/user_application_roles[\s\S]*active=false/u);
  assert.match(sql,/delete from public\.user_profiles/u);
  assert.match(sql,/iberfit_organization_memberships[\s\S]*status='inactive'/u);

  assert.match(sql,/iberfit_webauthn_credentials_v1[\s\S]*revoked_at/u);
  assert.match(sql,/iberfit_privileged_assurance_v1[\s\S]*revoked_at/u);
  assert.match(sql,/iberfit_email_privileged_assurance_v1[\s\S]*revoked_at/u);
  assert.match(sql,/iberfit_admin_audit_events/u);
  assert.doesNotMatch(sql,/delete\s+from\s+auth\.users/iu);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.(consent_acceptances_v17|data_subject_requests_v17|iberfit_admin_audit_events)/iu);
});

test('Auth identity is soft-deleted only by the service-role Edge Function after the DB receipt',()=>{
  const edge=read('supabase/functions/iberfit-admin-user-decommission-v1/index.ts');

  assert.match(edge,/ALLOWED_ORIGINS/u);
  assert.match(edge,/https:\/\/app\.iberfit\.cl/u);
  assert.match(edge,/https:\/\/m26-canary\.iberfit\.cl/u);
  assert.match(edge,/authorization/u);
  assert.match(edge,/userClient\.rpc\('iberfit_admin_execute_v14'/u);
  assert.match(edge,/service\.auth\.admin\.deleteUser\(targetUserId,true\)/u);
  assert.match(edge,/authIdentitySoftDeleted:true/u);
  assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/u);
  assert.doesNotMatch(edge,/access-control-allow-origin'\s*:\s*['"]\*['"]/u);

  const rpcAt=edge.indexOf("userClient.rpc('iberfit_admin_execute_v14'");
  const deleteAt=edge.indexOf('service.auth.admin.deleteUser(targetUserId,true)');
  assert.ok(rpcAt>=0&&deleteAt>rpcAt,'transactional access revocation must commit before Auth soft-delete');
});
