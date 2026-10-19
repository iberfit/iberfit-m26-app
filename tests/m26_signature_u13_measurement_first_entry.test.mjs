import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecution,startExecution,recordSet} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {exerciseMeasurementProfile} from '../src/m26/exercises/measurement-profiles.js';

function surface(name,role='coach',profile=null){
  const ex={id:'measurement-first-exercise',name_es:name,pattern:'fuerza',...(profile?{measurementProfile:profile}:{})};
  const catalog={get:(id)=>id===ex.id?ex:null,search:()=>[]};
  const session={id:'u13-session',clientId:'u13-client',title:'Entrenamiento',blocks:[{id:'u13-block',type:'exercise',exerciseId:ex.id,sets:2,reps:name.includes('Plancha')?'30 s':'10',restSeconds:60,targetRpe:7,measurementProfile:profile||exerciseMeasurementProfile(ex).kind}]};
  const execution=createExecution({session,clientId:session.clientId,executionId:'u13-execution'});
  startExecution(execution,{actor:{role:'coach',userId:'u13-coach'}});
  return {markup:renderGuidedExecution({execution,session,catalog,role}),execution,session};
}
const metricPos=(html,key)=>html.indexOf('data-session-observed-metric="'+key+'"');

test('U13: plank and timed strength lead with observed seconds, never drop repetitions',()=>{
  for(const role of ['coach','client']){
    const {markup}=surface('Plancha frontal',role);
    assert.ok(metricPos(markup,'seconds')>=0);
    assert.ok(metricPos(markup,'seconds')<metricPos(markup,'reps'));
    assert.match(markup,/data-session-field-priority="primary" data-session-observed-metric="seconds"/u);
    assert.match(markup,/data-session-field-priority="secondary" data-session-observed-metric="reps"/u);
    assert.match(markup,/data-set-field="seconds"/u);
    assert.match(markup,/data-set-field="reps"/u);
    assert.match(markup,/data-set-field="rpe"[^>]*required/u);
  }
});

test('U13: dynamic strength leads with repetitions and retains optional elapsed seconds',()=>{
  for(const role of ['coach','client']){
    const {markup}=surface('Sentadilla con mancuernas',role);
    assert.ok(metricPos(markup,'reps')>=0);
    assert.ok(metricPos(markup,'reps')<metricPos(markup,'seconds'));
    assert.match(markup,/data-session-field-priority="primary" data-session-observed-metric="reps"/u);
    assert.match(markup,/data-session-field-priority="secondary" data-session-observed-metric="seconds"/u);
  }
});

test('U13: explicit metric profile overrides name, without changing the stored observation keys',()=>{
  const {markup,execution,session}=surface('Sostén en pared','coach','isometric');
  assert.ok(metricPos(markup,'seconds')<metricPos(markup,'reps'));
  recordSet(execution,session,{seconds:30,rpe:7,actor:{role:'coach',userId:'u13-coach'}});
  assert.equal(execution.status,'active');
  assert.ok(Object.keys(execution.results||{}).length>0);
});

test('U13: carry/cardio and fast live actions keep their separate measurement paths',()=>{
  const carry=surface('Farmer carry','coach').markup;
  assert.match(carry,/data-session-carry-entry/u);
  assert.doesNotMatch(carry,/data-session-observed-metric="reps"/u);
  const cardio=surface('Carrera continua','coach').markup;
  assert.match(cardio,/data-session-cardio-entry/u);
  assert.doesNotMatch(cardio,/data-session-observed-metric="reps"/u);
  assert.match(cardio,/data-session-action="pause"/u);
});
