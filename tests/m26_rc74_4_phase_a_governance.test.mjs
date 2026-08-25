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

test('CI routes canary rc74-4 exclusively to the RC74.4 Phase B validator',()=>{
  const ci=read('.github/workflows/ci.yml');
  assert.match(ci,/name: Validar RC74\.4 Phase B[\s\S]*canary\/rc74-4[\s\S]*npm run validate:rc74-4/u);
  const rc29=ci.match(/- name: Validar RC29[\s\S]*?run: npm run validate:rc29/u)?.[0]||'';
  assert.match(rc29,/github\.ref != 'refs\/heads\/canary\/rc74-4'/u);
  assert.match(rc29,/github\.head_ref != 'canary\/rc74-4'/u);
  assert.match(ci,/name: Conservar evidencia RC74\.4[\s\S]*recovery\/RC74_4_\*\.json/u);
  assert.doesNotMatch(ci,/name: Validar RC74\.4 Phase B[\s\S]*?(?:wrangler|pages deploy|deploy)/iu);
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

test('Phase B K is active as an ordered QA-only migration after Q',()=>{
  const activePath='supabase/migrations/20260825132326_iberfit_rc74_4k_progress_conflict_qa.sql';
  assert.equal(fs.existsSync(new URL(`../${activePath}`,import.meta.url)),true);
  assert.equal(fs.existsSync(new URL('../recovery/rc74-4-phase-b/20260825013000_iberfit_rc74_4k_progress_conflict_qa.sql',import.meta.url)),false);
  const active=read(activePath);
  assert.match(active,/EJECUCION_GUARDAR_PROGRESO/u);
  assert.match(active,/APPLY ONLY AFTER THE CLIENT OFFLINE REBASE PATCH IS VERSIONED/u);
  for(const guard of ['RC74_4K_QA_ENVIRONMENT_REQUIRED','RC74_4K_ACTIVE_EXECUTION_LOCKS','RC74_4K_ACTIVE_EXECUTIONS','RC74_4K_LEGACY_PROGRESS_IDENTITIES','iberfit_finalize_execution_cancel_v26','iberfit_active_execution_command_guard_v26']) assert.ok(active.includes(guard),guard);
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

test('RC74.4 Q versions the minimal V14 QA membership fixture',()=>{
  const q=read('supabase/migrations/20260825043500_iberfit_rc74_4q_v14_qa_membership_fixture.sql');
  assert.match(q,/RC74_4Q_QA_ENVIRONMENT_REQUIRED/u);
  assert.match(q,/00000000-0000-4000-8000-000000000140/u);
  assert.match(q,/iberfit-qa-rc74/u);
  for(const email of [
    'qa.rc74.admin@iberfit.cl',
    'qa.rc74.coach@iberfit.cl',
    'qa.rc74.client-a@iberfit.cl',
    'qa.rc74.client-b@iberfit.cl',
  ]) assert.ok(q.includes(email),email);
  assert.match(q,/on conflict \(organization_id,user_id\) do nothing/u);
  assert.doesNotMatch(q,new RegExp(PROD_REF));
});

test('RC74.4 synthetic guard recognizes canonical QA only behind active allowlist',()=>{
  const source=read('src/m26/production-state.js');
  assert.match(source,/mode==='SYNTHETIC_ONLY'\|\|mode==='QA'/u);
  assert.match(source,/canary\?\.active===true/u);
  assert.match(source,/toLowerCase\(\)==='allowlist'/u);
});

test('RC74.4 IRI report backend follows the strict QA runtime boundary',()=>{
  const source=read('src/m26/workflows/iri-external-report-controller.js');
  assert.match(source,/M26_QA_PROJECT_REF/u);
  assert.match(source,/M26_QA_SUPABASE_ORIGIN/u);
  assert.match(source,/runtime\.qaOnly === true/u);
  assert.match(source,/M26_IRI_EXTERNAL_REPORT_PROJECT_MISMATCH/u);
  assert.match(source,/M26_IRI_EXTERNAL_REPORT_ORIGIN_MISMATCH/u);
});
