import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFinalProductionPromotionProdCompat} from '../scripts/build_final_production_promotion_prod_compat.mjs';

test('prod compat accepts absent obsolete v65c helper without recreating it',()=>{
  const sql=buildFinalProductionPromotionProdCompat();
  assert.match(sql,/to_regprocedure\('public\.iberfit_auth_assurance_context_v65c\(\)'\) is not null/iu);
  assert.doesNotMatch(sql,/revoke all on function public\.iberfit_auth_assurance_context_v65c\(\) from public,anon,authenticated;\s*revoke all on function public\.iberfit_admin_require_v14\(\)/iu);
  assert.doesNotMatch(sql,/create\s+(?:or\s+replace\s+)?function\s+public\.iberfit_auth_assurance_context_v65c\s*\(/iu);
  assert.match(sql,/and has_function_privilege\('authenticated','public\.iberfit_auth_assurance_context_v65c\(\)','EXECUTE'\)/iu);
});

test('prod compat promotes coach launch self identity wrapper after the production bootstrap scope hotfix',()=>{
  const sql=buildFinalProductionPromotionProdCompat();
  const scopeIndex=sql.indexOf('20260901010500_final_launch_p0_bootstrap_production_scope.sql');
  const identityIndex=sql.indexOf('20260924134500_coach_launch_identity_bootstrap_v1.sql');
  const postcheckIndex=sql.indexOf('-- 99 · FINAL PRODUCTION POSTCHECK');

  assert.ok(scopeIndex>=0,'production bootstrap scope migration must be present');
  assert.ok(identityIndex>scopeIndex,'coach launch identity wrapper must be the later bootstrap override');
  assert.ok(postcheckIndex>identityIndex,'coach launch identity wrapper must be applied before the final postcheck');
  assert.match(sql,/select u\.email,u\.last_sign_in_at/iu);
  assert.match(sql,/from public\.iberfit_organization_memberships m/iu);
  assert.match(sql,/where u\.id=auth\.uid\(\)/iu);
  assert.match(sql,/and m\.user_id=auth\.uid\(\)/iu);
  assert.match(sql,/revoke all on function public\.iberfit_bootstrap_v26\(\) from public/iu);
  assert.match(sql,/revoke all on function public\.iberfit_bootstrap_v26\(\) from anon/iu);
  assert.match(sql,/grant execute on function public\.iberfit_bootstrap_v26\(\) to authenticated/iu);
  assert.match(sql,/FINAL_PROD_POSTCHECK_BOOTSTRAP_SELF_IDENTITY/iu);
  assert.match(sql,/FINAL_PROD_POSTCHECK_BOOTSTRAP_ANON_EXECUTE/iu);
  assert.match(sql,/FINAL_PROD_POSTCHECK_BOOTSTRAP_AUTH_EXECUTE/iu);
});
