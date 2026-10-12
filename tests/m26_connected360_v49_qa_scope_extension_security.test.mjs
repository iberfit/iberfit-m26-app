import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('supabase/qa-migrations/20261012101000_connected360_v46_scope_extension_coalesce_fix_qa.sql');
const transport=read('src/m26/supabase-transport.js');
const remote=read('src/m26/wearables/remote-sync.js');
const importer=read('src/m26/wearables/v46-qa-import.js');
const build=read('scripts/build_rc29_prepublication_candidate.mjs');

test('V46 QA scope extension is owner-locked, cursor-fenced and does not revoke existing grants',()=>{
  assert.match(migration,/SECURITY DEFINER/u);
  assert.match(migration,/SET search_path TO ''/u);
  assert.match(migration,/auth\.uid\(\)/u);
  assert.match(migration,/iberfit_client_id\(\)/u);
  assert.match(migration,/iberfit_require_privileged_assurance_v65d/u);
  assert.match(migration,/pg_advisory_xact_lock/u);
  assert.match(migration,/v_grant\.grant_id IS DISTINCT FROM p_expected_grant/u);
  assert.match(migration,/v_grant\.revocation_cursor < v_cursor/u);
  assert.match(migration,/v_requested <@ v_grant\.scopes/u);
  assert.match(migration,/v_grant\.scopes\|\|v_requested/u);
  assert.match(migration,/M26_V46_QA_SCOPE_GRANT_STALE/u);
  assert.match(migration,/INSERT INTO public\.m26_wearable_consents_v44/u);
  assert.match(migration,/'v44-zero-cost'/u);
  assert.match(migration,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon/u);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/u);
  assert.doesNotMatch(migration,/pg_catalog\.coalesce/u);
  assert.doesNotMatch(migration,/\bdelete\s+from\b|\bdrop\s+table\b/iu);
});

test('Only Canary QA can extend general-heart-rate or exercise scopes',()=>{
  assert.match(transport,/extendConnected360QaV46Grant/u);
  assert.match(transport,/runtime\.qaOnly!==true\|\|runtime\.canary!==true/u);
  assert.match(transport,/runtime\.projectRef!==M26_QA_PROJECT_REF/u);
  assert.match(transport,/provider!=='health_connect'/u);
  assert.match(transport,/M26_HEALTH_V46_PRODUCTION_DENIED/u);
  assert.match(remote,/allowQaV46ScopeExtension=false/u);
  assert.match(remote,/allowQaV46ScopeExtension!==true/u);
  assert.match(remote,/missing\.some\(metric=>!\['generalHeartRate','exerciseSessions'\]/u);
  assert.match(remote,/function reauthorizeV46/u);
  assert.match(importer,/remoteSync\.reauthorizeV46\(\{scopes\}\)/u);
  assert.doesNotMatch(importer,/setInterval\(|addEventListener\('online'/u);
});

test('Legacy RC29 build enforces fixed, small budgets above already certified modern Canary V48',()=>{
  assert.match(build,/CERTIFIED_V48_SIZE_BASELINE/u);
  const numbers={
    javascript:7_533_109,
    css:947_587,
    core:9_598_022,
    jsGrowth:50_000,
    cssGrowth:10_000,
    coreGrowth:100_000,
  };
  assert.ok(numbers.jsGrowth/numbers.javascript<0.02);
  assert.ok(numbers.cssGrowth/numbers.css<0.02);
  assert.ok(numbers.coreGrowth/numbers.core<0.02);
  assert.match(build,/const budgetOk =/u);
  assert.match(build,/javascriptBytes <= JAVASCRIPT_LIMIT/u);
  assert.match(build,/coreBytes <= CORE_TOTAL_LIMIT/u);
});
