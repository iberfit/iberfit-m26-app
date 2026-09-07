import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  advanceExecution,
  createExecution,
  previousSetDraftValues,
  recordSet,
  startExecution,
} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const exercise={
  id:'exercise-1',
  name_es:'Sentadilla de prueba',
  pattern:'squat',
  cues:[],
};
const catalog={
  get(id){return id===exercise.id?exercise:null;},
  search(){return [];},
};

function makeSession(){
  return {
    id:'session-1',
    clientId:'client-1',
    title:'Sesión de prueba',
    durationMinutes:45,
    status:'published',
    blocks:[{
      type:'exercise',
      id:'block-1',
      exerciseId:exercise.id,
      sets:2,
      reps:'10',
      restSeconds:60,
      tempo:'3-1-1',
      targetRpe:7,
      targetRir:3,
    }],
  };
}

function executionOnSecondSet(){
  const session=makeSession();
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-1'});
  startExecution(execution);
  recordSet(execution,session,{
    reps:10,
    load:'80 kg',
    rpe:8,
    rir:2,
    notes:'Nota específica que no debe copiarse',
  });
  advanceExecution(execution);
  return {session,execution};
}

test('previousSetDraftValues exposes reusable metrics without copying notes',()=>{
  const {execution}=executionOnSecondSet();
  assert.deepEqual(previousSetDraftValues(execution),{
    reps:'10',
    seconds:'',
    load:'80 kg',
    rpe:'8',
    rir:'2',
  });
  assert.equal(Object.hasOwn(previousSetDraftValues(execution),'notes'),false);
});

test('previousSetDraftValues is unavailable on the first set',()=>{
  const session=makeSession();
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-first'});
  startExecution(execution);
  assert.equal(previousSetDraftValues(execution),null);
});

test('Session Live offers explicit previous-set reuse only when a previous set exists',()=>{
  const {session,execution}=executionOnSecondSet();
  const html=renderGuidedExecution({execution,session,catalog,mediaMap:null,role:'client'});
  assert.match(html,/data-session-previous-set/);
  assert.match(html,/type="button" data-session-action="reuse-previous-set"/);
  assert.match(html,/aria-label="Usar los datos de la serie anterior"/);
  assert.match(html,/10 reps/);
  assert.match(html,/80 kg/);
  assert.match(html,/RPE 8/);
  assert.match(html,/RIR 2/);
  assert.doesNotMatch(html,/Nota específica que no debe copiarse/);

  const firstExecution=createExecution({session,clientId:session.clientId,executionId:'execution-first-ui'});
  startExecution(firstExecution);
  const firstHtml=renderGuidedExecution({execution:firstExecution,session,catalog,mediaMap:null,role:'client'});
  assert.doesNotMatch(firstHtml,/data-session-action="reuse-previous-set"/);
});

test('controller copies locally, preserves current notes, persists the active draft and never dispatches reuse as a command',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/workflows/session-controller.js',import.meta.url),
    'utf8',
  );
  const start=source.indexOf("if(action==='reuse-previous-set')");
  const end=source.indexOf("if(action==='exit-session')",start);
  assert.ok(start>=0&&end>start);
  const branch=source.slice(start,end);
  assert.match(branch,/previousSetDraftValues/);
  assert.match(branch,/field==='notes'/);
  assert.match(branch,/updateActiveSetDraft/);
  assert.match(branch,/queueExecutionDraftPersist/);
  assert.match(branch,/Revísalos antes de confirmar/);
  assert.doesNotMatch(branch,/dispatchSessionAction/);
  assert.doesNotMatch(source,/case 'reuse-previous-set'/);
});
