import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const install=fs.readFileSync('supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.sql','utf8');
const rollback=fs.readFileSync('supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.rollback.sql','utf8');
test('U72 production candidate is complete and uses QA-canonical source digests',()=>{
  for(const hash of ['1270cf1db8c9a162ccc5736207a258e1','944aaac897289954a9c589292d8faf87','dd1027122e0843b44529cf87dad746b5','65e675f56c67aa8f9ddc4b36f3a9a73d'])assert.match(install,new RegExp(hash));
  assert.doesNotMatch(install,/M1_U72_MATERIALIZATION_REQUIRED/u);
  assert.match(install,/M1_U72_PROD_MUST_BE_CLOSED_AND_DRAINED/u);
  assert.match(install,/REVOKE ALL ON FUNCTION private\.iberfit_u72_occurrence_pause_resume_v1/u);
  assert.doesNotMatch(install,/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.iberfit_occurrence_api_u60_v1/iu);
  assert.match(install,/M1_U72_PROD_AUTH_ACL_DRIFT/u);
});
test('U72 rollback cannot lose historical dated sessions',()=>{
  assert.match(rollback,/M1_U72_PROD_ROLLBACK_UNSAFE_OR_DRIFT/u);
  assert.match(rollback,/entity_type='session_execution' AND body \? 'occurrenceId'/u);
  assert.match(rollback,/DROP FUNCTION private\.iberfit_u72_occurrence_pause_resume_v1/u);
  assert.match(rollback,/REVOKE ALL ON FUNCTION public\.iberfit_occurrence_api_u60_v1/u);
});

test('U72 SQL installer has one readback and all four delimited QA definitions',()=>{
  assert.equal((install.match(/^\\s*CREATE OR REPLACE FUNCTION /gmu)||[]).length,4);
  assert.equal((install.match(/^\\$function\\$;$/gmu)||[]).length,4);
  assert.equal((install.match(/^DO \\$m1_production_u72_verify\\$$/gmu)||[]).length,1);
  assert.equal((install.match(/^COMMIT;$/gmu)||[]).length,1);
  assert.ok(install.includes("AND (p_payload->>'clientId') ~* '^[0-9a-f-]{36}$'"));
  assert.ok(install.includes("AND (p_payload->>'entityId') ~* '^[0-9a-f-]{36}$'"));
});
