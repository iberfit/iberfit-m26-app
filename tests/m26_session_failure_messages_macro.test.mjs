import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  sessionCommandFailureOutcome,
  sessionCommandFailureReason,
} from '../src/m26/workflows/session-sync-recovery-ui.js';

test('errores corregibles de la serie se traducen a una instrucción útil sin exponer el código',()=>{
  const outcome=sessionCommandFailureOutcome(new Error('M26_EXECUTION_RPE_INVALID'),{
    role:'coach',action:'complete-set',
  });
  assert.equal(outcome.status,'retry');
  assert.equal(outcome.code,'M26_EXECUTION_RPE_INVALID');
  assert.equal(outcome.message,'Registra un RPE válido entre 1 y 10.');
  assert.equal(outcome.focusSelector,'[data-set-field="rpe"]');
  assert.doesNotMatch(outcome.message,/M26_EXECUTION_/u);
});

test('cierre y dolor reciben mensajes accionables',()=>{
  assert.match(
    sessionCommandFailureOutcome({code:'M26_EXECUTION_FEEDBACK_REQUIRED'},{role:'coach',action:'finish'}).message,
    /comentario final/u,
  );
  const pain=sessionCommandFailureOutcome({code:'M26_EXECUTION_PAIN_NOTES_REQUIRED'},{role:'coach',action:'finish'});
  assert.match(pain.message,/molestia o dolor/u);
  assert.equal(pain.focusSelector,'[data-session-feedback-pain-notes]');
});

test('un error técnico no mapeado no se maquilla',()=>{
  assert.equal(
    sessionCommandFailureOutcome({code:'M26_EXECUTION_STEP_MISSING'},{role:'coach',action:'complete-set'}),
    null,
  );
});

test('un rechazo diferido de sincronización mantiene el flujo genérico de recuperación',()=>{
  assert.equal(
    sessionCommandFailureOutcome({lastSyncError:'M26_EXECUTION_RPE_INVALID'},{role:'coach',phase:'sync'}),
    null,
  );
});

test('la regla de servicio de entrenamiento inactivo se conserva',()=>{
  const outcome=sessionCommandFailureOutcome({code:'TRAINING_SERVICE_NOT_ACTIVE'},{role:'coach',action:'start'});
  assert.equal(outcome.status,'error');
  assert.match(outcome.message,/servicio de entrenamiento no está activo/u);
});

test('la extracción del motivo sigue normalizando respuestas anidadas',()=>{
  assert.equal(
    sessionCommandFailureReason({result:{response:{reason:'m26_execution_pain_notes_required'}}}),
    'M26_EXECUTION_PAIN_NOTES_REQUIRED',
  );
});

test('controller reabre el panel y recupera foco después del rerender de error',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(source,/function focusSessionRecoveryField\(selector\)/u);
  assert.match(source,/const details=target\.closest\?\.\('details'\);if\(details\)details\.open=true;/u);
  assert.match(source,/failureFocusSelector=mapped\.focusSelector\|\|null/u);
  const focusCall='if(failureFocusSelector)focusSessionRecoveryField(failureFocusSelector);';
  const focusIndex=source.indexOf(focusCall);
  const renderIndex=source.lastIndexOf('renderSession();',focusIndex);
  assert.ok(focusIndex>=0&&renderIndex>=0&&renderIndex<focusIndex,'el foco de recuperación ocurre después del rerender');
});