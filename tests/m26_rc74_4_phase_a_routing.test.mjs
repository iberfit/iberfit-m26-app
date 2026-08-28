import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const QA_REF='gjztkdwfmunnzhtvxrsu';
const PROD_REF='pjhmrhejsoofmouedavw';

test('all remote QA runners fail closed to the canonical QA project',()=>{
  for(const path of [
    'scripts/remote-gates/run_authenticated_readonly_gate.mjs',
    'scripts/generate_rc74_4_runtime_config.mjs',
    'qa/rc64/build-authenticated-surface.mjs',
  ]){
    const source=read(path);
    assert.match(source,new RegExp(QA_REF),path);
    assert.doesNotMatch(source,new RegExp(PROD_REF),path);
    assert.match(source,/PROJECT_(?:REF|MISMATCH)|PROJECT_REF/u,path);
  }
});

test('remote command registry gate validates the entire semantic contract',()=>{
  const source=read('scripts/remote-gates/run_authenticated_readonly_gate.mjs');
  for(const field of ['snapshot_on_apply','conflict_sensitive','bootstrap_allowed'])assert.match(source,new RegExp(field),field);
  assert.match(source,/validateCommandCatalog\(remoteRegistry,M26_EXTENDED_COMMAND_REGISTRY,\{strict:true\}\)/u);
  assert.match(source,/remoteRegistry\.length!==52/u);
});

test('database ledger H I J K L M N O is represented after Phase B activation',()=>{
  const h=read('supabase/migrations/20260825005258_iberfit_rc74_4h_operation_identity_qa.sql');
  const i=read('supabase/migrations/20260825011031_iberfit_rc74_4i_server_conflict_policy_qa.sql');
  const j=read('supabase/migrations/20260825011758_iberfit_rc74_4j_internal_command_rpc_permissions_qa.sql');
  const l=read('supabase/migrations/20260825020434_iberfit_rc74_4l_qa_health_environment_truth.sql');
  const m=read('supabase/migrations/20260825022525_iberfit_rc74_4m_execution_lock_release_qa.sql');
  const n=read('supabase/migrations/20260825023803_iberfit_rc74_4n_execution_cancel_cascade_qa.sql');
  const o=read('supabase/migrations/20260825024902_iberfit_rc74_4o_active_execution_command_guard_qa.sql');
  const k=fs.readFileSync(new URL('../supabase/migrations/20260825132326_iberfit_rc74_4k_progress_conflict_qa.sql',import.meta.url),'utf8');
  assert.match(h,/OPERATION_ID_COLLISION/u);
  assert.match(h,/command_operation_identities_v26/u);
  assert.match(i,/iberfit_apply_registry_conflict_policy_v26/u);
  assert.match(i,/PROGRESS_POLICY_CHANGED_EARLY/u);
  assert.match(j,/revoke all on function public\.iberfit_execute_command_v26_pre_rc74_4h/u);
  assert.match(j,/revoke all on function public\.iberfit_operation_identity_guard_v26/u);
  assert.match(l,/RC74_4L_QA_ENVIRONMENT_GUARD_FAILED/u);
  assert.match(l,/public\.iberfit_environment\(\)/u);
  assert.match(l,/'productionModified', false/u);
  assert.match(l,/'productionDeployed', false/u);
  assert.match(m,/active_execution_locks_v26/u);
  assert.match(m,/EJECUCION_CANCELAR/u);
  assert.match(n,/iberfit_finalize_execution_cancel_v26/u);
  assert.match(n,/related_applied/u);
  assert.match(o,/ACTIVE_EXECUTION_MUST_CLOSE_FIRST/u);
  assert.match(o,/CITA_REPROGRAMAR/u);
  assert.match(k,/APPLY ONLY AFTER THE CLIENT OFFLINE REBASE PATCH IS VERSIONED/u);
  assert.equal(fs.existsSync(new URL('../supabase/migrations/20260825132326_iberfit_rc74_4k_progress_conflict_qa.sql',import.meta.url)),true);
  assert.equal(fs.existsSync(new URL('../recovery/rc74-4-phase-b/20260825013000_iberfit_rc74_4k_progress_conflict_qa.sql',import.meta.url)),false);
  assert.match(k,/EJECUCION_GUARDAR_PROGRESO/u);
  assert.match(k,/conflict_sensitive=true/u);
});


test('historical canary transport fixtures no longer route QA tests to production',()=>{
  for(const path of [
    'tests/m26_core_recovery.test.mjs',
    'tests/m26_rc33_first_session_iri.test.mjs',
    'tests/m26_v122_client_onboarding_repair.test.mjs',
  ]){
    const source=read(path);
    assert.doesNotMatch(source,new RegExp(PROD_REF),path);
    assert.match(source,new RegExp(QA_REF),path);
  }

  const rc64Builder=read('qa/rc64/build-authenticated-surface.mjs');
  assert.match(rc64Builder,new RegExp(QA_REF));
  assert.doesNotMatch(rc64Builder,new RegExp(PROD_REF));

  const recovery=read('tests/m26_rc58_5c_b_app_integrity.test.mjs');
  const canary=recovery.match(/test\('canary recovery remains QA-only and canary-bound',[\s\S]*?\n\}\);/u)?.[0]||'';
  assert.match(canary,new RegExp(QA_REF));
  assert.doesNotMatch(canary,new RegExp(PROD_REF));
  const production=recovery.match(/test\('production recovery uses app\.iberfit\.cl same-host without QA copy',[\s\S]*?\n\}\);/u)?.[0]||'';
  assert.match(production,new RegExp(PROD_REF));
});

test('legacy resilience registry fixture carries the full strict semantic contract',()=>{
  const source=read('tests/m26_rc17_resilience.test.mjs');
  for(const field of ['snapshot_on_apply','conflict_sensitive','bootstrap_allowed'])assert.match(source,new RegExp(field),field);
});

test('RC74.4 PRs hacia canary usan Phase B y nunca RC29',()=>{
  const ci=read('.github/workflows/ci.yml');

  const rc29=ci.match(/- name: Validar RC29[\s\S]*?run: npm run validate:rc29/u)?.[0]||'';
  assert.match(rc29,/github\.base_ref != 'canary\/rc74-4'/u);

  const rc74=ci.match(/- name: Validar RC74\.4 Phase B[\s\S]*?run: npm run validate:rc74-4/u)?.[0]||'';
  assert.match(rc74,/github\.base_ref == 'canary\/rc74-4'/u);

  const evidence74=ci.match(/- name: Conservar evidencia RC74\.4[\s\S]*?retention-days: 14/u)?.[0]||'';
  assert.match(evidence74,/github\.base_ref == 'canary\/rc74-4'/u);

  const evidence29=ci.match(/- name: Conservar evidencia RC29[\s\S]*?retention-days: 14/u)?.[0]||'';
  assert.match(evidence29,/github\.base_ref != 'canary\/rc74-4'/u);
});
