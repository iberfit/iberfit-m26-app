import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOccurrenceScopedCommand as build} from '../src/m26/domain/occurrence-commands.js';
const c='10000000-0000-4000-8000-000000000101';
const o='10000000-0000-4000-8000-000000000102';
const a='10000000-0000-4000-8000-000000000103';
const b='10000000-0000-4000-8000-000000000104';
const e='10000000-0000-4000-8000-000000000105';
const make=(type,extra={})=>build({
  type,operationId:a,clientId:c,occurrenceId:o,baseRevision:1,...extra,
});

test('U39 exact immutable U31 confirm/start commands never omit occurrence identity',()=>{
 const confirm=make('OCURRENCIA_CONFIRMAR');
 assert.deepEqual(confirm,{type:'OCURRENCIA_CONFIRMAR',operationId:a,
   clientId:c,entityId:o,baseRevision:1,payload:{}});
 assert.ok(Object.isFrozen(confirm)&&Object.isFrozen(confirm.payload));
 assert.deepEqual(make('OCURRENCIA_INICIAR',{executionId:e}).payload,{executionId:e});
 assert.throws(()=>make('SESION_INICIAR',{executionId:e}),/U39_TYPE_NOT_SUPPORTED/);
 assert.throws(()=>make('OCURRENCIA_INICIAR'),/U39_INVALID_UUID/);
 assert.throws(()=>make('OCURRENCIA_CONFIRMAR',{baseRevision:-1}),/U39_INVALID_REVISION/);
});

test('U39 progress/completion retain independent execution revision and immutable snapshots',()=>{
 const results={sets:[{reps:8,load:40}]};
 const progress=make('OCURRENCIA_GUARDAR_PROGRESO',{
   executionId:e,executionBaseRevision:3,results,
 });
 results.sets[0].load=60;
 assert.equal(progress.payload.results.sets[0].load,40);
 assert.equal(progress.payload.executionBaseRevision,3);
 assert.equal(progress.baseRevision,1);
 assert.ok(Object.isFrozen(progress.payload.results.sets[0]));
 assert.throws(()=>make('OCURRENCIA_GUARDAR_PROGRESO',{
   executionId:e,results:{},
 }),/U39_INVALID_REVISION/);
 const finished=make('OCURRENCIA_COMPLETAR',{
   executionId:e,executionBaseRevision:4,results:{squat:[8,8]},
   feedback:{rpe:7},skippedSets:{},
 });
 assert.deepEqual(finished.payload.feedback,{rpe:7});
 assert.throws(()=>make('OCURRENCIA_COMPLETAR',{
   executionId:e,executionBaseRevision:4,results:{},
 }),/U39_INVALID_OBJECT/);
});

test('U39 cancel requires no fields; rescheduling validates separate stable batch ID',()=>{
 assert.deepEqual(make('OCURRENCIA_CANCELAR').payload,{});
 const next=make('OCURRENCIA_REPROGRAMAR',{
   newOperationId:b,replacement:{localDate:'2026-11-10',localTime:'10:00'},
 });
 assert.deepEqual(next.payload,{
   newOperationId:b,replacement:{localDate:'2026-11-10',localTime:'10:00'},
 });
 assert.throws(()=>make('OCURRENCIA_REPROGRAMAR',{
   newOperationId:a,replacement:{localDate:'2026-11-10'}
 }),/U39_REPLACEMENT_OPERATION_MUST_DIFFER/);
 assert.throws(()=>make('OCURRENCIA_REPROGRAMAR',{
   newOperationId:b,replacement:{localDate:'2026-02-31'}
 }),/U39_INVALID_LOCAL_DATE/);
 assert.throws(()=>make('OCURRENCIA_REPROGRAMAR',{
   newOperationId:b,replacement:{localDate:'2026-11-10',role:'admin'}
 }),/U39_UNTRUSTED_REPLACEMENT_FIELD/);
 assert.throws(()=>make('OCURRENCIA_REPROGRAMAR',{
   newOperationId:b,replacement:{localDate:'2026-11-10',appointmentId:e}
 }),/U39_TIME_REQUIRED_FOR_LINK/);
});

test('U39 Santiago DST gap/fold fails safely instead of shifting timestamps',()=>{
 assert.throws(()=>make('OCURRENCIA_REPROGRAMAR',{
  newOperationId:b,replacement:{localDate:'2026-09-06',localTime:'00:30'}
 }),/DST_NONEXISTENT_LOCAL_TIME/);
 assert.throws(()=>make('OCURRENCIA_REPROGRAMAR',{
  newOperationId:b,replacement:{localDate:'2027-04-04',localTime:'00:30'}
 }),/DST_AMBIGUOUS_LOCAL_TIME/);
 const folded=make('OCURRENCIA_REPROGRAMAR',{
  newOperationId:b,replacement:{
   localDate:'2027-04-04',localTime:'00:30',dstDisambiguation:'later'
  }
 });
 assert.equal(folded.payload.replacement.dstDisambiguation,'later');
});
