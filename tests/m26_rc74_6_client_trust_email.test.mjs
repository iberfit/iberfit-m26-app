import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {M26_ADMIN_COMMAND_TYPES} from '../src/m26/admin/command-catalog.js';

const migration=fs.readFileSync('supabase/migrations/20260904164000_admin_client_delete_v26.sql','utf8');
const alignment=fs.readFileSync('supabase/migrations/20260904183000_admin_client_delete_v26_model_alignment.sql','utf8');
const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
const viewModel=fs.readFileSync('src/m26/admin/view-model.js','utf8');
const templatePaths=[
  'supabase/templates/iberfit-invite.html',
  'supabase/templates/iberfit-recovery.html',
  'supabase/templates/iberfit-confirmation.html',
  'supabase/templates/iberfit-magic-link.html',
  'supabase/templates/iberfit-email-change.html',
  'supabase/templates/iberfit-password-changed.html',
  'supabase/templates/iberfit-email-changed.html',
  'supabase/templates/iberfit-phone-changed.html',
  'supabase/templates/iberfit-mfa-enrolled.html',
  'supabase/templates/iberfit-mfa-unenrolled.html',
  'supabase/templates/iberfit-identity-linked.html',
  'supabase/templates/iberfit-identity-unlinked.html',
];

const client={id:'11111111-1111-4111-8111-111111111111',name:'Cliente QA',email:'cliente.qa@example.test',status:'active',lifecycle:{status:'active'},coachNames:['Coach QA']};

test('RC74.6 registra el comando destructivo sólo dentro del command membrane Admin',()=>{
  assert.ok(M26_ADMIN_COMMAND_TYPES.includes('ADMIN_CLIENTE_ELIMINAR'));
  assert.match(controller,/ADMIN_CLIENTE_ELIMINAR/u);
  assert.match(controller,/confirmAcknowledged/u);
  assert.match(controller,/confirmPhrase/u);
  assert.match(controller,/IBERFIT_CLIENT_DELETE_PROTECTED_HISTORY/u);
  assert.match(viewModel,/email:String\(x\.email\|\|''\)\.trim\(\)/u);
});

test('la acción de eliminación aparece sólo con capacidad Admin y exige confirmación fuerte',()=>{
  const enabled=renderAdminRoute({admin:true,kind:'admin-clientes',leads:[],clients:[client],canManage:true});
  assert.match(enabled,/data-admin-form="client-delete"/u);
  assert.match(enabled,/name="confirmAcknowledged"/u);
  assert.match(enabled,/name="confirmValue"/u);
  assert.match(enabled,/name="confirmPhrase"/u);
  assert.match(enabled,/pattern="ELIMINAR"/u);
  assert.match(enabled,/minlength="8"/u);
  assert.match(enabled,/Eliminar definitivamente/u);
  const disabled=renderAdminRoute({admin:true,kind:'admin-clientes',leads:[],clients:[client],canManage:false});
  assert.doesNotMatch(disabled,/data-admin-form="client-delete"/u);
});

test('el backend de borrado permanece fail-closed, auditado e idempotente',()=>{
  for(const contract of [
    'iberfit_require_privileged_assurance_v65d',
    'iberfit_admin_require_v14',
    'iberfit_assert_client_org_scope_v65e',
    'IBERFIT_CLIENT_DELETE_PROTECTED_HISTORY',
    'IBERFIT_CLIENT_DELETE_UNMANAGED_REFERENCE',
    'iberfit_admin_mutation_receipts',
    'iberfit_admin_audit_events',
    'confirmPhrase',
    'ELIMINAR',
  ])assert.match(migration,new RegExp(contract,'u'));
  assert.match(migration,/from public\.client_access_v26 ca/u);
  assert.match(migration,/delete from public\.clients\s+where id=v_client_id/u);
  assert.doesNotMatch(migration,/c\.organization_id/u);
  assert.doesNotMatch(migration,/c\.email/u);
  assert.doesNotMatch(migration,/delete\s+from\s+auth\.users/iu);
  assert.match(alignment,/from public\.client_access_v26 ca/u);
  assert.match(alignment,/iberfit_assert_client_org_scope_v65e/u);
  assert.doesNotMatch(alignment,/c\.organization_id/u);
  assert.doesNotMatch(alignment,/delete\s+from\s+auth\.users/iu);
  assert.match(migration,/revoke all on function public\.iberfit_admin_delete_client_v26\(jsonb,jsonb\) from public, anon, authenticated/u);
});

test('la familia de correos usa la marca real y no expone tokens ni Supabase al cliente',()=>{
  for(const path of templatePaths){
    assert.ok(fs.existsSync(path),`${path} debe existir`);
    const html=fs.readFileSync(path,'utf8');
    assert.match(html,/https:\/\/app\.iberfit\.cl\/isotipo-iberfit\.png/u);
    assert.match(html,/IBERFIT/u);
    assert.doesNotMatch(html,/supabase\.co/iu);
    assert.doesNotMatch(html,/TokenHash/u);
    assert.doesNotMatch(html,/service[_ -]?role/iu);
  }
});

test('activación y recuperación priorizan un CTA real y accesible',()=>{
  const invite=fs.readFileSync('supabase/templates/iberfit-invite.html','utf8');
  const recovery=fs.readFileSync('supabase/templates/iberfit-recovery.html','utf8');
  assert.match(invite,/Tu espacio IBERFIT/u);
  assert.match(invite,/href="\{\{ \.ConfirmationURL \}\}"/u);
  assert.match(invite,/Activar mi acceso/u);
  assert.match(invite,/iberfit-email-access-hero\.jpg/u);
  assert.match(recovery,/href="\{\{ \.ConfirmationURL \}\}"/u);
  assert.match(recovery,/Recuperar mi acceso/u);
  assert.doesNotMatch(invite,/\{\{ \.Token \}\}/u);
  assert.doesNotMatch(recovery,/\{\{ \.Token \}\}/u);
});
