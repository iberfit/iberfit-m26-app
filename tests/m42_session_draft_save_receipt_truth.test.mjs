import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionDraftSaveOutcome} from '../src/m26/workflows/session-controller.js';

test('M42 fully persisted Coach draft confirms both durable destinations',()=>{
 const result=sessionDraftSaveOutcome({local:true,remote:true});
 assert.equal(result.status,'success');
 assert.match(result.message,/dispositivo y sincronizado/);
});

test('M42 local-only offline draft never claims successful remote sync',()=>{
 const result=sessionDraftSaveOutcome({local:true,remote:false});
 assert.equal(result.status,'pending');
 assert.match(result.message,/La sincronización remota no está confirmada/);
 assert.doesNotMatch(result.message,/sincronizado correctamente/);
});

test('M42 remote-only draft truthfully warns about missing local recovery copy',()=>{
 const result=sessionDraftSaveOutcome({local:false,remote:true});
 assert.equal(result.status,'retry');
 assert.match(result.message,/no se pudo confirmar una copia local/);
});

test('M42 missing or malformed persistence receipts fail closed',()=>{
 for(const persistence of [null,undefined,{}, {local:false,remote:false}, {local:'true',remote:'true'}]){
  const result=sessionDraftSaveOutcome(persistence);
  assert.equal(result.status,'error');
  assert.match(result.message,/No se ha confirmado el guardado/);
 }
});
