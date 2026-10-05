import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  TRAINING_OPERATIONAL_TRUTH_VERSION,
  TRAINING_OPERATIONAL_COLLECTIONS,
  TRAINING_OPERATIONAL_DATABASE,
  TRAINING_LEGACY_COMPATIBILITY,
  canonicalTrainingCollection,
  canonicalTrainingRecordsForClient,
  isLegacyTrainingPersistenceName,
} from '../src/m26/domain/training-operational-truth.js';

const read=(path)=>fs.readFileSync(path,'utf8');

test('Entrenamiento Operativo declara una única topología canónica',()=>{
  assert.equal(TRAINING_OPERATIONAL_TRUTH_VERSION,'iberfit.training-operational-truth.v1');
  assert.deepEqual(TRAINING_OPERATIONAL_COLLECTIONS,{
    cycles:'trainingCycles',
    sessions:'sessions',
    executions:'sessionExecutions',
  });
  assert.deepEqual(TRAINING_OPERATIONAL_DATABASE,{
    cycles:'training_cycles',
    sessions:'sessions',
    executions:'session_executions',
    events:'session_events',
    executionLocks:'active_execution_locks_v26',
    drafts:'m26_session_drafts_v431',
  });
  assert.equal(TRAINING_LEGACY_COMPATIBILITY.plans,'m26_training_plans_v43');
  assert.equal(TRAINING_LEGACY_COMPATIBILITY.sessions,'m26_training_sessions_v43');
});

test('las lecturas canónicas ignoran colecciones legacy aunque coexistan',()=>{
  const state={
    collections:{
      trainingCycles:[{id:'cycle-a',clientId:'client-a'}],
      sessions:[{id:'session-a',clientId:'client-a'}],
      sessionExecutions:[{id:'exec-a',clientId:'client-a'}],
      m26TrainingPlansV43:[{id:'legacy-plan',clientId:'client-a'}],
      m26TrainingSessionsV43:[{id:'legacy-session',clientId:'client-a'}],
    },
  };

  assert.deepEqual(canonicalTrainingCollection(state,'cycles').map(x=>x.id),['cycle-a']);
  assert.deepEqual(canonicalTrainingCollection(state,'sessions').map(x=>x.id),['session-a']);
  assert.deepEqual(canonicalTrainingCollection(state,'executions').map(x=>x.id),['exec-a']);
  assert.deepEqual(canonicalTrainingRecordsForClient(state,'sessions','client-a').map(x=>x.id),['session-a']);
  assert.throws(()=>canonicalTrainingCollection(state,'legacy'),/M26_TRAINING_COLLECTION_KIND_INVALID/);
});

test('el transporte moderno ya no expone la escritura directa RC43 de sesiones',()=>{
  const transport=read('src/m26/supabase-transport.js');
  const application=read('src/m26/app/application.js');

  assert.ok(transport.includes("'m26_save_training_session_v43'"),'el RPC legacy debe seguir conocido durante la ventana N-1');
  assert.doesNotMatch(transport,/async function saveTrainingSession\s*\(/u);
  assert.doesNotMatch(transport,/\n\s*saveTrainingSession,\s*\n/u);
  assert.doesNotMatch(application,/\.saveTrainingSession\s*\(/u);
  assert.match(application,/createCommandBus\(/u);
});

test('la compatibilidad legacy queda explícitamente clasificada fuera de la verdad canónica',()=>{
  assert.equal(isLegacyTrainingPersistenceName('m26_training_plans_v43'),true);
  assert.equal(isLegacyTrainingPersistenceName('m26_training_sessions_v43'),true);
  assert.equal(isLegacyTrainingPersistenceName('m26_save_training_session_v43'),true);
  assert.equal(isLegacyTrainingPersistenceName('sessions'),false);
  assert.equal(isLegacyTrainingPersistenceName('session_executions'),false);
});
test('la verdad operativa canónica queda precacheada para uso offline',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/\/src\/m26\/domain\/training-operational-truth\.js/u);
});

