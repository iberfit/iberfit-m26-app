import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(
  'supabase/migrations/20261005110000_training_service_command_guard_v1.sql',
  'utf8',
);

test('training-service guard protects only commands that create or reactivate training work',()=>{
  for(const command of [
    'PLAN_VALIDAR',
    'PLAN_APROBAR',
    'PLAN_PUBLICAR',
    'PLAN_REABRIR',
    'SESION_APROBAR',
    'SESION_PUBLICAR',
    'SESION_HABILITAR',
    'SESION_INICIAR',
    'EJECUCION_INICIAR',
    'INTELIGENCIA_APLICAR_A_BORRADOR',
  ])assert.match(sql,new RegExp(`'${command}'`,'u'));

  for(const command of [
    'PLAN_ARCHIVAR',
    'SESION_CANCELAR',
    'SESION_COMPLETAR',
    'EJECUCION_GUARDAR_PROGRESO',
    'EJECUCION_PAUSAR',
    'EJECUCION_REANUDAR',
    'EJECUCION_COMPLETAR',
    'EJECUCION_CANCELAR',
  ])assert.doesNotMatch(
    sql.match(/v_requires_active := v_type in \([\s\S]*?\);/u)?.[0]||'',
    new RegExp(`'${command}'`,'u'),
  );
});

test('guard delegates unauthorized people before reading their training-service state',()=>{
  const guard=sql.slice(
    sql.indexOf('create or replace function private.iberfit_training_command_guard_v1'),
    sql.indexOf('alter function public.iberfit_command_preflight_v26(jsonb)'),
  );
  const access=guard.indexOf('iberfit_can_access_client_v26');
  const context=guard.indexOf('iberfit_application_context_v14');
  const status=guard.indexOf('iberfit_training_service_status_at_v1');
  assert.ok(access>=0&&context>access&&status>context);
  assert.match(guard,/delegate_client_access/u);
});

test('offline session start uses server-side appointment evidence and the 30-day recovery horizon',()=>{
  assert.match(sql,/a\.status = 'confirmada'/u);
  assert.match(sql,/a\.session_id = v_session_id/u);
  assert.match(sql,/a\.client_id = v_client_id/u);
  assert.match(sql,/v_appointment\.start_at - interval '6 hours'/u);
  assert.match(sql,/v_appointment\.end_at \+ interval '30 days'/u);
  assert.match(sql,/v_appointment\.start_at[\s\S]*service_status_at_v1/u);
  assert.match(sql,/service_not_active_at_appointment/u);
  assert.match(sql,/confirmed_appointment_offline_recovery/u);
});

test('already-applied operations preserve idempotent acknowledgement after a service status change',()=>{
  const executeWrapper=sql.slice(sql.indexOf('create or replace function public.iberfit_execute_command_v26(p_command jsonb)'));
  const receipt=executeWrapper.indexOf('from public.command_receipts_v26');
  const guard=executeWrapper.indexOf('private.iberfit_training_command_guard_v1');
  assert.ok(receipt>=0&&guard>receipt);
  assert.match(executeWrapper,/return public\.iberfit_execute_command_v26_pre_training_service_guard_v1\(p_command\)/u);
});

test('preflight and execute expose only the guarded canonical endpoint to authenticated',()=>{
  for(const pre of [
    'iberfit_command_preflight_v26_pre_training_service_guard_v1',
    'iberfit_execute_command_v26_pre_training_service_guard_v1',
  ]){
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${pre}\\(jsonb\\)[\\s\\S]*?from public, anon, authenticated;[\\s\\S]*?grant execute on function public\\.${pre}\\(jsonb\\)[\\s\\S]*?to service_role;`,'u'),
    );
  }
  for(const endpoint of ['iberfit_command_preflight_v26','iberfit_execute_command_v26']){
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${endpoint}\\(jsonb\\)[\\s\\S]*?from public, anon;[\\s\\S]*?grant execute on function public\\.${endpoint}\\(jsonb\\)[\\s\\S]*?to authenticated, service_role;`,'u'),
    );
  }
});

test('guard migration is additive to training data and does not relax Persona/IRI/Servicio separation',()=>{
  assert.doesNotMatch(sql,/\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\b/iu);
  assert.doesNotMatch(sql,/\bupdate\s+public\.iberfit_training_service_events_v1\b/iu);
  assert.match(sql,/from public\.iberfit_training_service_events_v1/u);
  assert.match(sql,/TRAINING_SERVICE_NOT_ACTIVE/u);
});
