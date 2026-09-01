import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFinalProductionPromotionProdCompat} from '../scripts/build_final_production_promotion_prod_compat.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceName='20260901010500_final_launch_p0_bootstrap_production_scope.sql';
const source=fs.readFileSync(path.join(root,'supabase','migrations',sourceName),'utf8');

test('productive bootstrap no longer depends on rollout allowlist',()=>{
  assert.equal(source.includes('M26_CANARY_NOT_ENABLED'),false);
  assert.equal(source.includes('m26_canary_clients_v26'),false);
  assert.match(source,/create or replace function public\.iberfit_bootstrap_v26_rc29\(\)/u);
  assert.match(source,/create or replace function public\.iberfit_bootstrap_v26_pre_v65e\(\)/u);
  assert.match(source,/iberfit_can_access_client_v26\(/u);
  assert.doesNotMatch(source,/create or replace function public\.iberfit_bootstrap_v26\(\)/u);
});

test('final production bundle applies scope hotfix before fail-closed postcheck',()=>{
  const sql=buildFinalProductionPromotionProdCompat();
  const hotfixIndex=sql.indexOf(`POST-LAUNCH P0 · ${sourceName}`);
  const postcheckIndex=sql.indexOf('99 · FINAL PRODUCTION POSTCHECK');
  assert.ok(hotfixIndex>=0,'bootstrap scope hotfix must be included');
  assert.ok(postcheckIndex>hotfixIndex,'bootstrap scope hotfix must run before final postcheck');
  assert.match(sql,/FINAL_PROD_POSTCHECK_BOOTSTRAP_SCOPE_RC29/u);
  assert.match(sql,/FINAL_PROD_POSTCHECK_BOOTSTRAP_SCOPE_V65E/u);
  assert.match(sql,/FINAL_PROD_POSTCHECK_BOOTSTRAP_ASSURANCE/u);
  assert.ok(sql.lastIndexOf('create or replace function public.iberfit_bootstrap_v26_rc29()')>hotfixIndex);
});
