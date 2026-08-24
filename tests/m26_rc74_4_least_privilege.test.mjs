import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  getCommandDefinition,
  validateCommandAgainstRegistry,
} from '../src/m26/command-catalog.js';
import {
  M26_ACTION_REGISTRY,
  assertActionAllowed,
} from '../src/m26/ui/interactive-audit.js';

const read=(rel)=>readFileSync(new URL(`../${rel}`,import.meta.url),'utf8');

const EXPECTED=new Map([
  ['SESION_INICIAR',['coach','cliente']],
  ['SESION_COMPLETAR',['coach','sistema']],
  ['SESION_CANCELAR',['coach']],
  ['EJECUCION_INICIAR',['coach','cliente']],
  ['EJECUCION_GUARDAR_PROGRESO',['coach','cliente']],
  ['EJECUCION_PAUSAR',['coach','cliente']],
  ['EJECUCION_REANUDAR',['coach','cliente']],
  ['EJECUCION_COMPLETAR',['coach','cliente']],
  ['EJECUCION_CANCELAR',['coach','cliente']],
]);

function command(type){
  const def=getCommandDefinition(type);
  return {
    type,
    entityType:def.entityType,
    entityId:'00000000-0000-4000-8000-000000000001',
    clientId:'00000000-0000-4000-8000-000000000002',
    operationId:'00000000-0000-4000-8000-000000000003',
    reason:def.requiresReason?'QA least privilege':'',
    previewAccepted:def.requiresPreview,
    payload:{},
  };
}

test('RC74.4B-P0 Admin no hereda ejecución Coach en el catálogo canónico',()=>{
  for(const [type,roles] of EXPECTED){
    const def=getCommandDefinition(type);
    assert.ok(def,type);
    assert.deepEqual([...def.allowedRoles].sort(),[...roles].sort(),type);
    assert.equal(
      validateCommandAgainstRegistry(command(type),'admin').ok,
      false,
      `${type}: admin debe quedar bloqueado`,
    );
  }
});

test('RC74.4B-P0 Coach conserva todos los comandos de sesión y ejecución operativa',()=>{
  for(const type of EXPECTED.keys()){
    assert.equal(
      validateCommandAgainstRegistry(command(type),'coach').ok,
      true,
      `${type}: Coach debe permanecer operativo`,
    );
  }
});

test('RC74.4B-P0 Cliente conserva su ejecución autónoma y no obtiene gobierno de sesión',()=>{
  const allowed=[
    'SESION_INICIAR',
    'EJECUCION_INICIAR',
    'EJECUCION_GUARDAR_PROGRESO',
    'EJECUCION_PAUSAR',
    'EJECUCION_REANUDAR',
    'EJECUCION_COMPLETAR',
    'EJECUCION_CANCELAR',
  ];
  for(const type of allowed){
    assert.equal(validateCommandAgainstRegistry(command(type),'client').ok,true,type);
  }
  for(const type of ['SESION_COMPLETAR','SESION_CANCELAR']){
    assert.equal(validateCommandAgainstRegistry(command(type),'client').ok,false,type);
  }
});

test('RC74.4B-P0 UI y Command Bus coinciden para cancelar ejecución autónoma',()=>{
  assert.deepEqual([...M26_ACTION_REGISTRY.cancel.roles].sort(),['client','coach']);
  assert.equal(assertActionAllowed('cancel','client'),true);
  assert.equal(assertActionAllowed('cancel','coach'),true);
  assert.equal(assertActionAllowed('cancel','admin'),false);
  assert.deepEqual([...getCommandDefinition('EJECUCION_CANCELAR').allowedRoles].sort(),['cliente','coach']);
});

test('RC74.4B-P0 migración queda fuera de auto-migrations y exige guard QA',()=>{
  const sql=read('backend/RC74_4_LEAST_PRIVILEGE_MIGRATION_GUARDED.sql');
  assert.match(sql,/allow_rc74_4_least_privilege/u);
  assert.match(sql,/qa-only/u);
  assert.match(sql,/M26_RC74_4_QA_CANARIES_REQUIRED/u);
  assert.match(sql,/EJECUCION_CANCELAR' then array\['coach','cliente'\]/u);
  assert.match(sql,/SESION_INICIAR' then array\['coach','cliente'\]/u);
  assert.match(sql,/SESION_COMPLETAR' then array\['coach','sistema'\]/u);
  assert.match(sql,/SESION_CANCELAR' then array\['coach'\]/u);
  assert.match(sql,/public\.iberfit_operation_allowed/u);
  assert.match(sql,/p_type not in/u);
  assert.doesNotMatch(import.meta.url,/supabase[\\/]migrations/u);
});

test('RC74.4B-P0 preflight es estrictamente solo lectura',()=>{
  const sql=read('backend/RC74_4_LEAST_PRIVILEGE_PREFLIGHT_READONLY.sql');
  assert.match(sql,/begin transaction read only;/iu);
  assert.doesNotMatch(sql,/\b(?:insert|update|delete|alter|create|drop|truncate)\b\s+(?:table|policy|function|into|public\.)/iu);
  assert.match(sql,/iberfit_operation_allowed/u);
  assert.match(sql,/domain_command_registry_v26/u);
});

test('RC74.4B-P0 rollback requiere autorización QA independiente',()=>{
  const sql=read('backend/RC74_4_LEAST_PRIVILEGE_ROLLBACK.sql');
  assert.match(sql,/allow_rc74_4_least_privilege_rollback/u);
  assert.match(sql,/qa-only/u);
  assert.match(sql,/EJECUCION_CANCELAR' then array\['admin','coach'\]/u);
});
