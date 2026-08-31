import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildFinalProductionPromotion,
  SOURCE_MIGRATIONS,
  EXCLUDED_QA_MIGRATIONS,
} from '../scripts/build_final_production_promotion.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const edgePath=path.join(root,'backend','production','edge-functions','iberfit-webauthn-v1','index.ts');
const supabaseConfigPath=path.join(root,'supabase','config.toml');

function normalized(value){return String(value).replace(/\r\n/gu,'\n');}

const forbiddenQaEnvironmentPatterns=[
  /coalesce\(v_env->>'environment',''\)\s*<>\s*'QA'/iu,
  /lower\(coalesce\(v_env->>'environment',''\)\)\s*<>\s*'qa'/iu,
  /coalesce\(\(v_env->>'realDataAllowed'\)::boolean\s*,\s*true\)\s+is\s+not\s+false/iu,
  /coalesce\(\(v_env->>'productionBlocked'\)::boolean\s*,\s*false\)\s+is\s+not\s+true/iu,
  /coalesce\(\(v_env->>'realDataAllowed'\)::boolean\s*,\s*true\)\s*<>\s*false/iu,
  /coalesce\(\(v_env->>'productionBlocked'\)::boolean\s*,\s*false\)\s*<>\s*true/iu,
];

test('final production source manifest excludes QA-only state/fixtures and obsolete assurance',()=>{
  assert.deepEqual(SOURCE_MIGRATIONS,[
    '20260824171100_iberfit_rc74_4_least_privilege_qa.sql',
    '20260825005258_iberfit_rc74_4h_operation_identity_qa.sql',
    '20260825011031_iberfit_rc74_4i_server_conflict_policy_qa.sql',
    '20260825011758_iberfit_rc74_4j_internal_command_rpc_permissions_qa.sql',
    '20260825022525_iberfit_rc74_4m_execution_lock_release_qa.sql',
    '20260825023803_iberfit_rc74_4n_execution_cancel_cascade_qa.sql',
    '20260825024902_iberfit_rc74_4o_active_execution_command_guard_qa.sql',
    '20260825035725_iberfit_rc74_4p_environment_rpc_rls_qa.sql',
    '20260825132326_iberfit_rc74_4k_progress_conflict_qa.sql',
    '20260825162000_iberfit_rc74_4r_reproducibility_qa.sql',
    '20260825202200_iberfit_rc74_4s_wellbeing_context_qa.sql',
  ]);
  for(const required of [
    '20260824171000_iberfit_rc74_4_qa_environment.sql',
    '20260824174500_iberfit_rc74_4_engagement_52.sql',
    '20260825020434_iberfit_rc74_4l_qa_health_environment_truth.sql',
    '20260825043500_iberfit_rc74_4q_v14_qa_membership_fixture.sql',
    '20260828143000_rc65c1_auth_assurance_context.sql',
  ])assert.ok(EXCLUDED_QA_MIGRATIONS.includes(required),`excluded: ${required}`);
});

test('generated production SQL is fail-closed and contains only the production port',()=>{
  const sql=normalized(buildFinalProductionPromotion());

  for(const pattern of forbiddenQaEnvironmentPatterns){
    assert.doesNotMatch(sql,pattern,'active QA environment guard must be productionized');
  }

  for(const forbidden of [
    'qa.rc74.',
    '74040000-0000-4000-8000-000000000001',
    'm26-canary.iberfit.cl',
    'M26_QA_ONLY=true',
  ])assert.ok(!sql.toLowerCase().includes(forbidden.toLowerCase()),`forbidden production content: ${forbidden}`);

  for(const required of [
    "'PRODUCTION'",
    "'https://app.iberfit.cl'",
    "'https://coach.iberfit.cl'",
    'command_operation_identities_v26',
    'iberfit_operation_identity_guard_v26',
    'iberfit_apply_registry_conflict_policy_v26',
    'iberfit_finalize_execution_cancel_v26',
    'iberfit_active_execution_command_guard_v26',
    'iberfit_prepare_command_rc30_v26_pre_rc74_4',
    'client_checkins_v26_fatigue_check',
    'client_checkins_v26_motivation_check',
    'iberfit_privileged_assurance_context_v65d',
    'iberfit_require_privileged_assurance_v65d',
    'iberfit_create_client_draft_v12_pre_v65e',
    'FINAL_PROD_POSTCHECK_CLIENT_CREATE_SURFACE',
  ])assert.ok(sql.includes(required),`required production contract: ${required}`);

  assert.doesNotMatch(sql,/create\s+(?:or\s+replace\s+)?function\s+public\.iberfit_auth_assurance_context_v65c\s*\(/iu,'obsolete assurance helper must not be recreated');
  assert.doesNotMatch(sql,/grant\s+execute\s+on\s+function\s+public\.iberfit_auth_assurance_context_v65c\(\)\s+to\s+(?:public|anon|authenticated|service_role)/iu,'obsolete assurance helper must not be granted');
  assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.iberfit_auth_assurance_context_v65c\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/iu);
  assert.match(sql,/has_function_privilege\('authenticated','public\.iberfit_auth_assurance_context_v65c\(\)','EXECUTE'\)/iu);

  assert.match(sql,/create\s+or\s+replace\s+function\s+private\.iberfit_role\(\)[\s\S]*?from\s+public\.user_profiles[\s\S]*?where\s+p\.user_id\s*=\s*auth\.uid\(\)/iu);
  const roleSection=sql.match(/PORT · RC74\.4T\/T2 FINAL LIVE AUTHORIZATION[\s\S]*?PORT · 20260830033156/iu)?.[0]||'';
  assert.ok(roleSection);
  assert.doesNotMatch(roleSection,/auth\.jwt\s*\(/iu,'effective private role must not trust JWT app_metadata');
  assert.match(roleSection,/revoke\s+all\s+on\s+function\s+private\.iberfit_role\(\)\s+from\s+public,anon,authenticated,service_role/iu);
  assert.match(roleSection,/grant\s+execute\s+on\s+function\s+private\.iberfit_role\(\)\s+to\s+authenticated/iu);

  assert.match(sql,/revoke\s+execute\s+on\s+function\s+public\.iberfit_create_client_draft\(jsonb\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/iu);
  assert.doesNotMatch(sql,/grant\s+execute\s+on\s+function\s+public\.iberfit_create_client_draft\(jsonb\)\s+to\s+(?:public|anon|authenticated)/iu);
});

test('production WebAuthn variant is exact-origin, origin-bound, phishing-resistant, and JWT-gated',()=>{
  const source=normalized(fs.readFileSync(edgePath,'utf8'));
  const config=normalized(fs.readFileSync(supabaseConfigPath,'utf8'));

  assert.match(source,/const\s+RP_ID='iberfit\.cl'/u);
  assert.match(source,/'https:\/\/app\.iberfit\.cl'/u);
  assert.match(source,/'https:\/\/coach\.iberfit\.cl'/u);
  assert.doesNotMatch(source,/m26-canary\.iberfit\.cl/iu);
  assert.doesNotMatch(source,/access-control-allow-origin'\s*:\s*['"]\*['"]/iu);
  assert.match(source,/ALLOWED_ORIGINS\.has\(origin\)/u);
  assert.match(source,/insert\(\{user_id:userId,session_id:sessionId,ceremony,challenge,origin,expires_at:expiresAt\}\)/u);
  assert.match(source,/\.eq\('origin',origin\)/u);
  assert.match(source,/expectedOrigin:origin/u);
  assert.match(source,/expectedRPID:RP_ID/u);
  assert.match(source,/userVerification:'required'/u);
  assert.match(source,/requireUserVerification:true/u);
  assert.match(source,/supportedAlgorithmIDs:\[-7,-257\]/u);
  assert.match(config,/\[functions\.iberfit-webauthn-v1\][\s\S]*?verify_jwt\s*=\s*true/u);
});
