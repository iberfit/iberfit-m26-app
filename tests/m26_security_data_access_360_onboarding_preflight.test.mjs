import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(
  'supabase/migrations/20261005215000_security_data_access_360_onboarding_preflight.sql',
  'utf8',
);

test('Canary onboarding preflight is ready only for the synthetic QA boundary',()=>{
  assert.match(migration,/v_environment='QA'/u);
  assert.match(migration,/v_real_data_allowed=false/u);
  assert.match(migration,/v_production_blocked=true/u);
  assert.match(migration,/v_origin='https:\/\/m26-canary\.iberfit\.cl'/u);
  assert.match(migration,/'qaSyntheticOnly',true/u);
  assert.match(migration,/'ready',v_qa_ready/u);
});

test('preflight keeps privileged assurance and least-privilege execute ACL',()=>{
  assert.match(migration,/security definer[\s\S]*set search_path=''/u);
  assert.match(migration,/iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.match(migration,/revoke all on function public\.iberfit_client_onboarding_preflight_v12\(\) from public, anon, service_role/u);
  assert.match(migration,/grant execute on function public\.iberfit_client_onboarding_preflight_v12\(\) to authenticated/u);
});

test('QA readiness still requires the real backend contract while PROD result is preserved',()=>{
  assert.match(migration,/client_app_profiles/u);
  assert.match(migration,/to_regclass\('public\.iri_assessments'\)/u);
  assert.match(migration,/to_regclass\('public\.domain_entities_v26'\)/u);
  assert.match(migration,/to_regprocedure\('public\.iberfit_bootstrap_v26\(\)'\)/u);
  assert.match(migration,/to_regprocedure\('public\.iberfit_create_client_draft\(jsonb\)'\)/u);
  assert.match(migration,/if v_environment='QA' then[\s\S]*return coalesce\(v_result/u);
  assert.match(migration,/return coalesce\(v_result,'\{\}'::jsonb\)\|\|jsonb_build_object\([\s\S]*'qaSyntheticOnly',false/u);
});
