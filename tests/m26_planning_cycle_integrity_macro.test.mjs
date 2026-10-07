import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCycleDraft,buildCycleCommand} from '../src/m26/workflows/planning-workflow.js';

const draft=(extra={})=>({
 clientId:'client-cycle-integrity',name:'Fuerza · bloque base',
 startDate:'2026-10-08',endDate:'2026-11-08',goal:'Mejorar fuerza',
 ...extra,
});

const errors=(extra)=>validateCycleDraft(draft(extra)).errors;

test('la validación del ciclo conserva el formato mínimo histórico',()=>{
 const result=validateCycleDraft(draft());
 assert.deepEqual(result,{ok:true,errors:[]});
 assert.equal(buildCycleCommand(draft()).type,'PLAN_VALIDAR');
});

test('fecha final anterior a la inicial continúa rechazada',()=>{
 assert.ok(errors({endDate:'2026-10-01'}).includes('endDate'));
});

test('fechas imposibles e incompletas nunca se validan silenciosamente',()=>{
 assert.ok(errors({startDate:'2026-02-30'}).includes('startDate'));
 assert.ok(errors({endDate:'2026-13-01'}).includes('endDate'));
 assert.ok(errors({startDate:'un día'}).includes('startDate'));
 assert.ok(errors({endDate:'2026-10-07Txx:xx:xxZ'}).includes('endDate'));
});

test('un 29 de febrero válido permanece admitido',()=>{
 assert.deepEqual(errors({startDate:'2028-02-29',endDate:'2028-03-02'}),[]);
 assert.ok(errors({startDate:'2026-02-29'}).includes('startDate'));
});

test('no degrada entradas Date/ISO timestamp válidas anteriores',()=>{
 assert.deepEqual(errors({startDate:new Date('2026-10-08T00:00:00Z')}),[]);
 assert.deepEqual(errors({startDate:'2026-10-08T00:00:00.000Z'}),[]);
});

test('los textos requeridos no aceptan únicamente espacios',()=>{
 assert.ok(errors({name:'   '}).includes('name'));
 assert.ok(errors({goal:'  '}).includes('goal'));
 assert.ok(errors({clientId:''}).includes('clientId'));
});

test('los máximos del contrato del formulario se cumplen al validar en dominio',()=>{
 assert.ok(errors({name:'X'.repeat(121)}).includes('name'));
 assert.ok(errors({goal:'Y'.repeat(501)}).includes('goal'));
 assert.deepEqual(errors({name:'X'.repeat(120),goal:'Y'.repeat(500)}),[]);
});

test('frecuencia y duración opcionales históricas siguen compatibles; aportadas deben ser válidas',()=>{
 assert.deepEqual(errors({}),[]);
 assert.deepEqual(errors({weeklyFrequency:'2',sessionDurationMinutes:'75'}),[]);
 assert.ok(errors({weeklyFrequency:0}).includes('weeklyFrequency'));
 assert.ok(errors({weeklyFrequency:15}).includes('weeklyFrequency'));
 assert.ok(errors({weeklyFrequency:true}).includes('weeklyFrequency'));
 assert.ok(errors({sessionDurationMinutes:15}).includes('sessionDurationMinutes'));
 assert.ok(errors({sessionDurationMinutes:241}).includes('sessionDurationMinutes'));
});

test('modalidades válidas, incluidas tildes, permanecen permitidas; desconocidas se bloquean',()=>{
 for(const modality of ['presencial','online','hibrido','híbrido','Híbrido'])
   assert.deepEqual(errors({modality}),[],modality);
 assert.ok(errors({modality:'teletransporte'}).includes('modality'));
});

test('un ciclo inválido no genera comando ni muta el borrador',()=>{
 const input=draft({name:' ',startDate:'2026-02-30'});
 const before=structuredClone(input);
 assert.throws(()=>buildCycleCommand(input),/M26_CYCLE_INVALID/);
 assert.deepEqual(input,before);
});