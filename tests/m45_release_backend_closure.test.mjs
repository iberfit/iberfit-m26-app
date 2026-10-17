import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {findDestructiveSql} from '../scripts/data-safety/check_migration_safety.mjs';

const appointment=fs.readFileSync(
  new URL('../supabase/migrations/20261017004420_m45_appointment_create_preflight_parity_v1.sql',import.meta.url),
  'utf8',
);
const communication=fs.readFileSync(
  new URL('../supabase/migrations/20261017005625_m45_communication_execute_direct_client_scope_v1.sql',import.meta.url),
  'utf8',
);
const appointmentRollback=fs.readFileSync(
  new URL('../supabase/rollbacks/m45_appointment_create_preflight_parity_v1.rollback.sql',import.meta.url),
  'utf8',
);
const communicationRollback=fs.readFileSync(
  new URL('../supabase/rollbacks/m45_communication_execute_direct_client_scope_v1.rollback.sql',import.meta.url),
  'utf8',
);

test('M45 appointment preflight parity migration is append-only and fail-closed',()=>{
  assert.deepEqual(findDestructiveSql(appointment),[]);
  assert.doesNotMatch(appointment,/\bDO\s+(?:\$|LANGUAGE)/i);
  assert.match(appointment,/6b8f44e7122d01e81a5b819677b4b5af/);
  assert.match(appointment,/dd8a9d3cfb35812e2a51c24bd06b4580/);
  assert.match(appointment,/v_entity_type='appointment' and v_type='CITA_CREAR' and v_def\.bootstrap_allowed/);
  assert.match(appointment,/when v_entity_type='appointment' then 'propuesta'/);
  assert.match(appointment,/from_status='propuesta'/);
  assert.match(appointment,/event_name='CREAR'/);
  assert.match(appointment,/to_status='propuesta'/);
  assert.match(appointment,/SECURITY DEFINER/);
  assert.match(appointment,/SET search_path TO ''/);
  assert.match(appointment,/REVOKE ALL ON FUNCTION public\.iberfit_command_preflight_v26_pre_rc74_4h\(jsonb\)/);
});

test('M45 communication mutation resolves only client scope and preserves boundaries',()=>{
  assert.deepEqual(findDestructiveSql(communication),[]);
  assert.doesNotMatch(communication,/\bDO\s+(?:\$|LANGUAGE)/i);
  assert.match(communication,/6707a3dad0ea2694bed9276fe4055ed0/);
  assert.match(communication,/d9ef7c578fa958886a0e937d93e9a013/);
  assert.match(communication,/v_client:=coalesce\(public\.iberfit_client_id\(\)::text,''\)/);
  assert.doesNotMatch(communication,/iberfit_bootstrap_v26\(\)/);
  for(const command of ['MESSAGE_THREAD_OPEN','MESSAGE_SEND','MESSAGE_MARK_READ','NOTIFICATION_MARK_READ']){
    assert.ok(communication.includes(command),command);
  }
  assert.match(communication,/actor_user_id=v_user/);
  assert.match(communication,/V14_THREAD_NOT_VISIBLE/);
  assert.match(communication,/SECURITY DEFINER/);
  assert.match(communication,/SET search_path TO ''/);
  assert.match(communication,/REVOKE ALL ON FUNCTION public\.iberfit_communication_execute_v14_pre_v65e\(text,jsonb\)/);
});

test('M45 rollbacks restore only exact certified baselines',()=>{
  assert.match(appointmentRollback,/dd8a9d3cfb35812e2a51c24bd06b4580/);
  assert.match(appointmentRollback,/6b8f44e7122d01e81a5b819677b4b5af/);
  assert.doesNotMatch(appointmentRollback,/v_entity_type='appointment' and v_type='CITA_CREAR'/);

  assert.match(communicationRollback,/d9ef7c578fa958886a0e937d93e9a013/);
  assert.match(communicationRollback,/6707a3dad0ea2694bed9276fe4055ed0/);
  assert.match(communicationRollback,/iberfit_bootstrap_v26\(\)/);
  assert.match(communicationRollback,/v_snapshot/);
});
