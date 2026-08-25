import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8').replace(/\r\n/gu,'\n');
const QA_REF='gjztkdwfmunnzhtvxrsu';
const PROD_REF='pjhmrhejsoofmouedavw';

test('RC74.4 has a dedicated current gate without replacing historical RC29',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.gate,'npm run validate:rc29');
  assert.equal(pkg.scripts['validate:rc74-4'],'node scripts/run_rc74_4_validation.mjs');
  assert.equal(pkg.scripts['configure:rc74-4:canary'],'node scripts/generate_rc74_4_runtime_config.mjs');
  assert.ok(pkg.scripts['validate:rc29']);
});

test('CI routes canary rc74-4 exclusively to the RC74.4 Phase A validator',()=>{
  const ci=read('.github/workflows/ci.yml');
  assert.match(ci,/name: Validar RC74\.4 Phase A[\s\S]*canary\/rc74-4[\s\S]*npm run validate:rc74-4/u);
  const rc29=ci.match(/- name: Validar RC29[\s\S]*?run: npm run validate:rc29/u)?.[0]||'';
  assert.match(rc29,/github\.ref != 'refs\/heads\/canary\/rc74-4'/u);
  assert.match(rc29,/github\.head_ref != 'canary\/rc74-4'/u);
  assert.match(ci,/name: Conservar evidencia RC74\.4[\s\S]*recovery\/RC74_4_\*\.json/u);
  assert.doesNotMatch(ci,/name: Validar RC74\.4 Phase A[\s\S]*?(?:wrangler|pages deploy|deploy)/iu);
});

test('RC74.4 runtime generator is QA-only and cannot target production',()=>{
  const generator=read('scripts/generate_rc74_4_runtime_config.mjs');
  assert.match(generator,new RegExp(QA_REF));
  assert.doesNotMatch(generator,new RegExp(PROD_REF));
  assert.match(generator,/RC74_4_RUNTIME_QA_ONLY_REQUIRED/u);
  assert.match(generator,/RC74_4_RUNTIME_SERVICE_ROLE_FORBIDDEN/u);
  assert.match(generator,/productionModified:false/u);
  assert.match(generator,/productionDeployed:false/u);
});

test('Phase B K is staged but impossible to auto-apply from the migration directory',()=>{
  assert.equal(fs.existsSync(new URL('../supabase/migrations/20260825013000_iberfit_rc74_4k_progress_conflict_qa.sql',import.meta.url)),false);
  const staged=read('recovery/rc74-4-phase-b/20260825013000_iberfit_rc74_4k_progress_conflict_qa.sql');
  assert.match(staged,/EJECUCION_GUARDAR_PROGRESO/u);
  assert.match(staged,/APPLY ONLY AFTER THE CLIENT OFFLINE REBASE PATCH IS VERSIONED/u);
  for(const guard of ['RC74_4K_ACTIVE_EXECUTION_LOCKS','RC74_4K_ACTIVE_EXECUTIONS','RC74_4K_LEGACY_PROGRESS_IDENTITIES','iberfit_finalize_execution_cancel_v26','iberfit_active_execution_command_guard_v26']) assert.ok(staged.includes(guard),guard);
});


test('RC74.4 ledger includes QA migrations M N and O',()=>{
  for(const file of [
    '20260825022525_iberfit_rc74_4m_execution_lock_release_qa.sql',
    '20260825023803_iberfit_rc74_4n_execution_cancel_cascade_qa.sql',
    '20260825024902_iberfit_rc74_4o_active_execution_command_guard_qa.sql',
  ]) assert.equal(fs.existsSync(new URL(`../supabase/migrations/${file}`,import.meta.url)),true,file);
  const n=read('supabase/migrations/20260825023803_iberfit_rc74_4n_execution_cancel_cascade_qa.sql');
  assert.match(n,/iberfit_finalize_execution_cancel_v26/u);
  assert.match(n,/related_applied/u);
  assert.match(n,/activeExecutionId/u);
  assert.match(n,/revoke execute on function private\.iberfit_finalize_execution_cancel_v26\(jsonb\) from public,anon,authenticated,service_role/u);
  const o=read('supabase/migrations/20260825024902_iberfit_rc74_4o_active_execution_command_guard_qa.sql');
  assert.match(o,/ACTIVE_EXECUTION_MUST_CLOSE_FIRST/u);
  assert.match(o,/iberfit_active_execution_command_guard_v26/u);
  assert.match(o,/CITA_REPROGRAMAR/u);
});


test('RC74.4 validator launches npm portably without direct npm.cmd spawn on Windows',()=>{
  const validator=read('scripts/run_rc74_4_validation.mjs');
  assert.match(validator,/process\.env\.npm_execpath/u);
  assert.match(validator,/runNpm\('full-node-regression',\['test'\]\)/u);
  assert.doesNotMatch(validator,/process\.platform===['"]win32['"]\?['"]npm\.cmd/u);
  assert.match(validator,/RC74_4_PROCESS_START_FAILED/u);
});

test('RC74.4 P keeps environment truth available through RLS without opening settings',()=>{
  const p=read('supabase/migrations/20260825035725_iberfit_rc74_4p_environment_rpc_rls_qa.sql');
  assert.match(p,/create or replace function public\.iberfit_environment\(\)[\s\S]*security definer/u);
  assert.match(p,/revoke execute on function public\.iberfit_environment\(\) from public, anon/u);
  assert.match(p,/grant execute on function public\.iberfit_environment\(\) to authenticated, service_role/u);
  for(const key of ['environment','real_data_allowed','production_blocked']) assert.ok(p.includes("key='"+key+"'"),key);
  assert.doesNotMatch(p,/grant\s+select[\s\S]*iberfit_system_settings[\s\S]*authenticated/iu);
});


test('RC64 authenticated smoke pins the current RC74 synthetic identities exactly',()=>{
  const smoke=read('qa/rc64/authenticated-smoke.spec.mjs');
  assert.match(smoke,/qa\.rc74\.coach@iberfit\.cl/u);
  assert.match(smoke,/qa\.rc74\.client-a@iberfit\.cl/u);
  assert.doesNotMatch(smoke,/\^iberfit\\\.cl\\\+qa/u);
});
