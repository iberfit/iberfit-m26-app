import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CEO_WATCH_MODES,
  CEO_WATCH_RELEASE,
  buildCeoWatchViewModel,
  ceoWatchLaunchGate,
  sanitizeCeoWatchPayload,
} from '../src/m26/wearables/index.js';

test('IBERFIT Watch CEO define exactamente los cuatro modos finales',()=>{
  assert.deepEqual(Object.keys(CEO_WATCH_MODES),['clasico','control','sesion','entreno']);
  assert.equal(CEO_WATCH_MODES.clasico.clock,'analogico');
  assert.equal(CEO_WATCH_MODES.control.clock,'digital');
  assert.equal(CEO_WATCH_MODES.sesion.clock,'digital');
  assert.equal(CEO_WATCH_MODES.entreno.clock,'digital');
});

test('IBERFIT Watch CEO fija marca oficial, producto privado y castellano',()=>{
  assert.equal(CEO_WATCH_RELEASE.product,'IBERFIT Watch · Edición CEO');
  assert.equal(CEO_WATCH_RELEASE.privateProduct,true);
  assert.equal(CEO_WATCH_RELEASE.language,'es');
  assert.equal(CEO_WATCH_RELEASE.brand.officialIsotypeOnly,true);
  assert.equal(CEO_WATCH_RELEASE.brand.inventedMarksAllowed,false);
});

test('IBERFIT Watch CEO no permite PII o información sensible de clientes en la muñeca',()=>{
  const input={
    clientName:'Persona Completa',clientInitials:'PC',phone:'+56911111111',email:'x@example.com',
    diagnosis:'dato sensible',clinicalNotes:'nota',payments:123456,address:'direccion',
    nextSessionAt:'2026-08-31T11:00:00-04:00',sessionsToday:4,pendingFollowups:2,pendingIri:1,
  };
  const safe=sanitizeCeoWatchPayload(input);
  for(const forbidden of ['clientName','clientInitials','phone','email','diagnosis','clinicalNotes','payments','address']){
    assert.equal(Object.hasOwn(safe,forbidden),false,forbidden);
  }
  const vm=buildCeoWatchViewModel({mode:'control',agenda:input,now:'2026-08-31T10:28:00-04:00',batteryPercent:78});
  const serialized=JSON.stringify(vm);
  assert.doesNotMatch(serialized,/Persona Completa|PC|11111111|example\.com|dato sensible|nota|123456|direccion/);
  assert.equal(vm.sesionesHoy,4);
  assert.equal(vm.seguimientosPendientes,2);
  assert.equal(vm.iriPendientes,1);
});

test('CLÁSICO permanece limpio y no recibe métricas deportivas',()=>{
  const vm=buildCeoWatchViewModel({
    mode:'clasico',now:'2026-08-31T10:28:00-04:00',batteryPercent:85,
    telemetry:{heartRateBpm:150,activeEnergyKcal:600},agenda:{sessionsToday:5},
  });
  assert.equal(vm.mode,'clasico');
  assert.equal(vm.bateria,85);
  assert.ok(vm.fecha);
  assert.equal(Object.hasOwn(vm,'fc'),false);
  assert.equal(Object.hasOwn(vm,'kcal'),false);
  assert.equal(Object.hasOwn(vm,'sesionesHoy'),false);
});

test('CONTROL resume jornada sin identidad de cliente',()=>{
  const vm=buildCeoWatchViewModel({
    mode:'control',now:'2026-08-31T09:15:00-04:00',batteryPercent:74,
    agenda:{nextSessionAt:'2026-08-31T11:00:00-04:00',sessionsToday:4,pendingFollowups:0,pendingIri:0,clientName:'No mostrar'},
  });
  assert.equal(vm.proximaSesion,'11:00');
  assert.equal(vm.sesionesHoy,4);
  assert.equal(vm.estado,'AL DÍA');
  assert.doesNotMatch(JSON.stringify(vm),/No mostrar/);
});

test('SESIÓN prioriza ejecución, serie y descanso',()=>{
  const vm=buildCeoWatchViewModel({
    mode:'sesion',batteryPercent:69,
    session:{elapsedSeconds:2058,currentExercise:'Sentadilla goblet',currentSet:3,totalSets:4,restSeconds:48,nextExercise:'Remo TRX',clientName:'No mostrar'},
  });
  assert.equal(vm.tiempoSesion,'34:18');
  assert.equal(vm.ejercicioActual,'Sentadilla goblet');
  assert.equal(vm.serieActual,'3 / 4');
  assert.equal(vm.descanso,'00:48');
  assert.equal(vm.siguienteEjercicio,'Remo TRX');
  assert.doesNotMatch(JSON.stringify(vm),/No mostrar/);
});

test('ENTRENO valida telemetría personal dentro de rangos operativos',()=>{
  const vm=buildCeoWatchViewModel({
    mode:'entreno',batteryPercent:78,
    telemetry:{elapsedSeconds:2538,heartRateBpm:148,averageHeartRateBpm:139,maxHeartRateBpm:171,activeEnergyKcal:386,zoneLabel:'Z3'},
  });
  assert.equal(vm.tiempoEntreno,'42:18');
  assert.equal(vm.fc,148);
  assert.equal(vm.fcMedia,139);
  assert.equal(vm.fcMax,171);
  assert.equal(vm.kcal,386);
  assert.equal(vm.zona,'Z3');
});

test('gate de lanzamiento falla cerrado si falta marca, castellano o un modo',()=>{
  assert.equal(ceoWatchLaunchGate({isotypeOfficial:true,visibleLanguage:'es',modes:['clasico','control','sesion','entreno']}).ok,true);
  const bad=ceoWatchLaunchGate({isotypeOfficial:false,visibleLanguage:'en',modes:['clasico']});
  assert.equal(bad.ok,false);
  assert.match(bad.issues.join('|'),/ISOTIPO_OFICIAL_REQUERIDO/);
  assert.match(bad.issues.join('|'),/INTERFAZ_DEBE_ESTAR_EN_ESPANOL/);
  assert.match(bad.issues.join('|'),/MODO_FALTANTE_CONTROL/);
});
