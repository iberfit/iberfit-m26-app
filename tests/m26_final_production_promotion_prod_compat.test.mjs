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
