import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {M26_COMMAND_REGISTRY,M26_EXTENDED_COMMAND_REGISTRY,validateCommandCatalog} from '../src/m26/command-catalog.js';

const sql=readFileSync(new URL('../supabase/migrations/20260824174500_iberfit_rc74_4_engagement_52.sql',import.meta.url),'utf8');
const remoteGate=readFileSync(new URL('../scripts/remote-gates/run_authenticated_readonly_gate.mjs',import.meta.url),'utf8');

test('runtime conserva base 44 y extiende el catálogo canónico a 53',()=>{
  assert.equal(M26_COMMAND_REGISTRY.length,44);
  assert.equal(M26_EXTENDED_COMMAND_REGISTRY.length,53);
  const check=validateCommandCatalog(M26_EXTENDED_COMMAND_REGISTRY,M26_EXTENDED_COMMAND_REGISTRY,{strict:true});
  assert.equal(check.ok,true);
  assert.equal(check.required,53);
  assert.equal(check.installed,53);
});

test('gate remoto deriva el conteo del catálogo canónico sin hardcode histórico',()=>{
  assert.match(remoteGate,/const expectedCommands=M26_EXTENDED_COMMAND_REGISTRY\.length;/u);
  assert.match(remoteGate,/remoteRegistry\.length!==expectedCommands/u);
  assert.match(remoteGate,/expectedCommands,remoteCommands:remoteRegistry\.length/u);
  assert.doesNotMatch(remoteGate,/remoteRegistry\.length!==52/u);
  assert.doesNotMatch(remoteGate,/expectedCommands:52/u);
});

test('RC74.4E least privilege sigue vigente',()=>{
  const map=new Map(M26_COMMAND_REGISTRY.map(x=>[x.type,x]));
  assert.deepEqual(map.get('SESION_INICIAR').allowedRoles,['coach','cliente']);
  assert.deepEqual(map.get('SESION_COMPLETAR').allowedRoles,['coach','sistema']);
  assert.deepEqual(map.get('SESION_CANCELAR').allowedRoles,['coach']);
  for(const type of ['EJECUCION_INICIAR','EJECUCION_GUARDAR_PROGRESO','EJECUCION_PAUSAR','EJECUCION_REANUDAR','EJECUCION_COMPLETAR','EJECUCION_CANCELAR']){
    assert.deepEqual(map.get(type).allowedRoles,['coach','cliente'],type);
  }
});

test('RC74.4E migration QA guards',()=>{
  assert.match(sql,/M26_RC74_4E_QA_ENVIRONMENT_GUARD_FAILED/u);
  assert.match(sql,/v_count <> 44/u);
  assert.match(sql,/M26_RC74_4E_EXTENSION_ALREADY_PRESENT/u);
  assert.match(sql,/v_count <> 52/u);
  assert.match(sql,/M26_RC74_4E_BUSINESS_DATA_MUST_REMAIN_EMPTY/u);
});

test('RC74.4E exact 8 engagement commands',()=>{
  for(const type of ['CHECKIN_REGISTRAR','CHECKIN_ANULAR','HABITO_DEFINIR','HABITO_REGISTRAR','HABITO_ARCHIVAR','NOTA_PRIVADA_CREAR','NOTA_PRIVADA_ACTUALIZAR','NOTA_PRIVADA_ARCHIVAR']){
    assert.ok(sql.includes(`'${type}'`),type);
  }
});

test('RC74.4E canonical transitions',()=>{
  for(const row of [
    "('checkin','borrador','REGISTRAR','confirmado')",
    "('checkin','confirmado','ANULAR','anulado')",
    "('habit','borrador','DEFINIR','activo')",
    "('habit','activo','ARCHIVAR','archivado')",
    "('habit_log','borrador','REGISTRAR','confirmado')",
    "('private_note','borrador','CREAR','activo')",
    "('private_note','activo','ACTUALIZAR','activo')",
    "('private_note','activo','ARCHIVAR','archivado')"
  ]) assert.ok(sql.includes(row),row);
});
