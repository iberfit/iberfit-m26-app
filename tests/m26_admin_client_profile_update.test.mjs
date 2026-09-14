import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260914130000_admin_client_profile_update_v26.sql','utf8');
const render=fs.readFileSync('src/m26/admin/route-render.js','utf8');
const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
const viewModel=fs.readFileSync('src/m26/admin/view-model.js','utf8');
const css=fs.readFileSync('src/m26/admin/admin.css','utf8');
const catalog=fs.readFileSync('src/m26/admin/command-catalog.js','utf8');
const service=fs.readFileSync('src/m26/admin/service.js','utf8');
const adminAudit=fs.readFileSync('scripts/audit/admin_action_surface_audit.mjs','utf8');

test('client profile update is privileged, scoped, idempotent and concurrency safe',()=>{
  assert.match(migration,/iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.match(migration,/roles','\[\]'::jsonb\)\?'admin'/u);
  assert.match(migration,/iberfit_assert_client_org_scope_v65e\(v_org,v_client::text\)/u);
  assert.match(migration,/v_current_revision<>v_base_revision/u);
  assert.match(migration,/V26_CLIENT_PROFILE_REVISION_CONFLICT/u);
  assert.match(migration,/iberfit_admin_mutation_receipts/u);
  assert.match(migration,/V14_OPERATION_COLLISION/u);
  assert.match(migration,/pg_advisory_xact_lock/u);
});

test('client profile update keeps access email out of general editing and synchronizes canonical profile tables',()=>{
  assert.match(migration,/update public\.clients/u);
  assert.match(migration,/update public\.client_intake_profiles/u);
  assert.match(migration,/update public\.client_app_profiles/u);
  assert.doesNotMatch(migration,/update public\.client_access_v26[\s\S]*set[\s\S]*email\s*=/iu);
  assert.match(render,/Correo de acceso/u);
  assert.match(render,/flujo de seguridad separado/u);
  const editForm=render.match(/data-admin-form="client-profile-update"[\s\S]*?<\/form>/u)?.[0]||'';
  assert.ok(editForm,'client profile update form must be present');
  assert.doesNotMatch(editForm,/name="email"/u);
});

test('confirmed IRI history is immutable while the initial draft stays synchronized',()=>{
  assert.match(migration,/assessment_type='inicial'/u);
  assert.match(migration,/i\.status='borrador'/u);
  assert.match(migration,/jsonb_set\(coalesce\(i\.sections,'\{\}'::jsonb\),'\{personProfile\}'/u);
  assert.doesNotMatch(migration,/status in \('aprobado','publicado','revisión'\)/u);
});

test('internal update helper is not browser callable and public gateway routes the audited command',()=>{
  assert.match(migration,/ADMIN_CLIENTE_ACTUALIZAR_FICHA/u);
  assert.match(migration,/revoke all on function public\.iberfit_admin_update_client_profile_v26\(jsonb,jsonb\)[\s\S]*from public,anon,authenticated/u);
  assert.match(migration,/grant execute on function public\.iberfit_admin_update_client_profile_v26\(jsonb,jsonb\)[\s\S]*to service_role/u);
  assert.match(migration,/return public\.iberfit_admin_update_client_profile_v26\(p_command,v_context\)/u);
});

test('Admin client rows use canonical profile/access email and expose revision for optimistic editing',()=>{
  assert.match(viewModel,/state\.collections\?\.clientProfiles/u);
  assert.match(viewModel,/state\.collections\?\.clientAccess/u);
  assert.match(viewModel,/email:String\(profile\.email\|\|rawProfile\?\.email\|\|access\?\.email/u);
  assert.match(viewModel,/revision:Number\(x\.revision\|\|0\)/u);
  assert.match(viewModel,/profile:Object\.freeze\(profile\)/u);
});

test('Admin exposes one reusable native dialog instead of one full edit form per client',()=>{
  assert.match(render,/data-admin-client-edit-dialog/u);
  assert.match(render,/data-admin-client-edit-data/u);
  assert.match(render,/data-admin-client-edit-open/u);
  assert.match(controller,/openClientEditDialog/u);
  assert.match(controller,/client-profile-update/u);
  assert.match(controller,/ADMIN_CLIENTE_ACTUALIZAR_FICHA/u);
  assert.match(css,/ADMIN_CLIENT_PROFILE_EDITOR_V1_START/u);
  assert.match(css,/::backdrop/u);
  assert.match(css,/safe-area-inset-bottom/u);
});


test('client profile edit is registered in the Admin membrane and privileged reauth set',()=>{
  assert.match(catalog,/ADMIN_CLIENTE_ACTUALIZAR_FICHA/u);
  assert.match(service,/PRIVILEGED_REAUTH_COMMANDS[\s\S]*ADMIN_CLIENTE_ACTUALIZAR_FICHA/u);
  assert.match(adminAudit,/client-profile-update/u);
});

test('Admin client editor data is inert and never injects a script element',()=>{
  assert.match(render,/data-admin-client-edit-data hidden/u);
  assert.doesNotMatch(render,/<script[^>]*data-admin-client-edit-data/iu);
});
