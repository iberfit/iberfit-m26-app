import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261014051500_m43_coach_preflight_client_projection_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261014051500_m43_coach_preflight_client_projection_v1_rollback.sql',import.meta.url),'utf8');

test('M43: initial-cycle and initial-session preflight simulate only server-approved bootstrap paths',()=>{
  assert.match(sql,/v_entity_type='planning' and v_type='PLAN_VALIDAR' and v_def\.bootstrap_allowed/);
  assert.match(sql,/v_entity_type='session' and v_type='SESION_PUBLICAR' and v_def\.requires_preview/);
  assert.match(sql,/v_status := case when v_entity_type='planning' then 'borrador' else 'aprobada'/);
  assert.match(sql,/public\.iberfit_can_access_client_v26\(v_client_id\)/);
  assert.match(sql,/public\.iberfit_canary_enabled_v26\(v_client_id\)/);
  assert.match(sql,/v_def\.allowed_roles/);
  assert.match(sql,/v_def\.requires_preview/);
  assert.match(sql,/PREVIEW_CONFIRMATION_REQUIRED/);
  assert.match(sql,/ENTITY_CLIENT_MISMATCH/);
});

test('M43: Client bootstrap server projection hides unpublished cycles and sessions without hiding Coach data',()=>{
  assert.match(sql,/public\.iberfit_current_role_v26\(\) in \('client','cliente'\)/);
  assert.match(sql,/\{data,trainingCycles\}/);
  assert.match(sql,/\{data,sessions\}/);
  assert.match(sql,/\{data,m26Entities\}/);
  assert.match(sql,/item->>'entityType' not in \('planning','session','report'\)/);
  assert.match(sql,/item->'body'->>'visibleToClient'/);
  assert.match(sql,/\{data,domainEvents\}/);
  assert.match(sql,/\{remoteRevisions\}/);
  assert.doesNotMatch(sql,/\b(?:drop table|drop function|truncate|delete from|grant\s+all|disable row level security)\b/i);
});

test('M43: both original functions are retained in explicit rollback for safe QA recovery',()=>{
  for(const functionName of ['iberfit_bootstrap_v26','iberfit_command_preflight_v26_pre_rc74_4h']){
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.'+functionName+'('));
    assert.ok(rollback.includes('CREATE OR REPLACE FUNCTION public.'+functionName+'('));
  }
  assert.ok(rollback.includes("return jsonb_set(v_payload,'{data,clients}'"));
  assert.doesNotMatch(rollback,/-- M43: the real executor bootstraps/);
});
