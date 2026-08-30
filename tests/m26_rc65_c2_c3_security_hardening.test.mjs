import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20260830044500_rc65_c2_c3_privileged_server_enforcement.sql';

test('RC65-C2/C3 migration wraps every privileged canonical RPC with session-bound WebAuthn',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  const wrappers=[
    'iberfit_admin_bootstrap_v14',
    'iberfit_admin_execute_v14',
    'iberfit_bootstrap_v26',
    'iberfit_command_preflight_v26',
    'iberfit_execute_command_v26',
    'iberfit_communication_bootstrap_v14',
    'iberfit_communication_execute_v14',
    'iberfit_appointment_change_requests_v13',
    'iberfit_request_appointment_change_v13',
    'iberfit_resolve_appointment_change_v13',
    'iberfit_create_client_draft_v12',
    'iberfit_register_iri_external_report_v12',
    'iberfit_client_onboarding_preflight_v12',
    'iberfit_iri_external_report_preflight_v12',
    'm26_telemetry_delete_own_v59',
    'm26_telemetry_import_v59',
    'm26_telemetry_read_page_v59',
  ];
  for(const name of wrappers){
    assert.ok(sql.includes(`create or replace function public.${name}(`),`wrapper missing: ${name}`);
  }
  const wrapperSection=sql.split('-- SECURITY INVOKER data RPCs must preserve RLS.')[0];
  assert.equal((wrapperSection.match(/perform public\.iberfit_require_privileged_assurance_v65d\(\);/gu)||[]).length,wrappers.length);
});

test('RC65-C2/C3 keeps Client compatibility and protects internal implementations by grants',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  assert.match(sql,/privileged Coach\/Admin reads fail closed/u);
  assert.match(sql,/Client remains unchanged/u);
  assert.match(sql,/revoke all on function public\.iberfit_bootstrap_v26_pre_v65e\(\) from public,anon,authenticated;/u);
  assert.match(sql,/grant execute on function public\.iberfit_bootstrap_v26\(\) to authenticated;/u);
  assert.match(sql,/revoke all on function public\.iberfit_auth_assurance_context_v65c\(\) from public,anon,authenticated;/u);
  assert.match(sql,/revoke all on function public\.iberfit_admin_require_v14\(\) from public,anon,authenticated;/u);
});

test('RC65-C2 Admin BOLA blocks user/role scope escapes and global privileged roles across organizations',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  assert.match(sql,/V65E_ADMIN_TARGET_OUTSIDE_ORG/u);
  assert.match(sql,/V65E_GLOBAL_ROLE_MULTI_ORG_FORBIDDEN/u);
  assert.match(sql,/iberfit_assert_global_role_mutation_scope_v65e/u);
  assert.match(sql,/ADMIN_ROL_OTORGAR/u);
  assert.match(sql,/ADMIN_ROL_REVOCAR/u);
  assert.match(sql,/iberfit_assert_org_user_scope_v65e/u);
  assert.match(sql,/m\.organization_id<>p_organization_id/u);
});

test('RC65-C2 Admin assignment/lifecycle BOLA validates client existence and organization evidence',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  assert.match(sql,/V65E_CLIENT_NOT_FOUND/u);
  assert.match(sql,/V65E_CLIENT_OUTSIDE_ORG/u);
  assert.match(sql,/ADMIN_ASIGNACION_CREAR/u);
  assert.match(sql,/ADMIN_CLIENTE_CAMBIAR_CICLO/u);
  for(const table of ['iberfit_coach_client_assignments','iberfit_conversation_threads','iberfit_client_lifecycle_events','iberfit_operational_tasks']){
    assert.match(sql,new RegExp(table,'u'));
  }
});

test('RC65-C2 command and report paths retain existing identity/assignment guards',()=>{
  const files=fs.readdirSync('supabase/migrations').filter((name)=>name.endsWith('.sql'));
  const source=files.map((name)=>fs.readFileSync(`supabase/migrations/${name}`,'utf8')).join('\n');
  assert.match(source,/iberfit_operation_identity_guard_v26/u);
  assert.match(source,/iberfit_can_access_client_v26/u);
  assert.match(source,/iberfit_can_manage_iri_external_report_v12/u);
  assert.match(source,/V124_COACH_ASSIGNMENT_REQUIRED/u);
});

test('RC65-C2 covers lower-level data RPCs without converting SECURITY INVOKER paths into definer bypasses',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  const invokers=[
    'iberfit_bootstrap','iberfit_bootstrap_core','iberfit_bootstrap_support',
    'iberfit_process_operation','iberfit_reconcile_operations',
    'm26_backend_bootstrap_v43','m26_draft_delete_v431','m26_draft_get_v431',
    'm26_draft_upsert_v431','m26_record_measurement_v43','m26_save_training_session_v43',
    'm26_send_message_v43','m26_wearable_bootstrap_v44',
    'm26_wearable_connection_upsert_v44','m26_wearable_delete_all_v44',
    'm26_wearable_import_v44','m26_wearable_revoke_v44',
  ];
  for(const name of invokers)assert.match(sql,new RegExp(`'${name}'`,'u'));
  assert.match(sql,/p\.prosecdef=false/u);
  assert.match(sql,/execute replace\(v_def,v_source,v_new_source\)/u);
  assert.match(sql,/V65E_POSTCHECK_INVOKER_GUARD_COUNT/u);
});

test('RC65-C3 postcheck is atomic and verifies grants plus BOLA guard presence',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  assert.match(sql,/Atomic postconditions/u);
  assert.match(sql,/V65E_POSTCHECK_ASSURANCE_GUARD_MISSING/u);
  assert.match(sql,/V65E_POSTCHECK_ANON_GRANT_PRESENT/u);
  assert.match(sql,/V65E_POSTCHECK_LEGACY_ASSURANCE_STILL_EXECUTABLE/u);
  assert.match(sql,/V65E_POSTCHECK_ORG_USER_BOLA_GUARD_MISSING/u);
  assert.match(sql,/V65E_POSTCHECK_CLIENT_BOLA_GUARD_MISSING/u);
});

test('RC65-C2/C3 remains FREE and does not reintroduce Supabase Advanced MFA',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  const c1=fs.readFileSync('docs/RC65C1_PRIVILEGED_MFA.md','utf8');
  assert.doesNotMatch(sql,/mfa_web_authn|passkey_enabled|auth_mfa_web_authn/iu);
  assert.match(c1,/no usa el add-on/iu);
  assert.match(c1,/iberfitAssurance = verified/u);
});
