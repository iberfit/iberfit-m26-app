import test from 'node:test';
import assert from 'node:assert/strict';
import {coachLaunchReadiness} from '../src/m26/onboarding/coach-launch-readiness.js';
import {deriveCoachLaunchJourney} from '../src/m26/onboarding/coach-launch-journey.js';
import {progressiveOnboardingProgress,renderProgressiveOnboardingPanel} from '../src/m26/onboarding/progressive-onboarding.js';

const completeTour=()=>progressiveOnboardingProgress({role:'coach',visited:['coach-today','coach-clients','coach-agenda','coach-library','coach-verification']});
const incompleteTour=()=>progressiveOnboardingProgress({role:'coach',visited:[]});
const user={id:'coach-1',userId:'coach-1',status:'active',lastAccessAt:'2026-09-24T10:00:00Z'};
const coach={id:'coach-1',userId:'coach-1',name:'Coach',email:'coach@iberfit.cl',status:'active'};
const assignments=[{coachUserId:'coach-1',clientId:'client-1',status:'active'}];
const planning=[{id:'session-1',clientId:'client-1',status:'publicado'}];
const execution=[{id:'exec-1',client_id:'client-1',started_by:'coach-1',execution_status:'cerrada_confirmada'}];
const readyJourney=()=>deriveCoachLaunchJourney({user,coach,assignments,planningSessions:planning,sessionExecutions:execution});

test('tour is guidance only and cannot block an operationally ready Coach',()=>{
  const result=coachLaunchReadiness({role:'coach',progress:incompleteTour(),journey:readyJourney()});
  assert.equal(result.tourCompleted,false);
  assert.equal(result.ready,true);
  assert.equal(result.nextRequirement,null);
});

test('tour completion cannot manufacture operational readiness',()=>{
  const journey=deriveCoachLaunchJourney({user,coach,assignments,planningSessions:planning,sessionExecutions:[]});
  const result=coachLaunchReadiness({role:'coach',progress:completeTour(),journey});
  assert.equal(result.tourCompleted,true);
  assert.equal(result.ready,false);
  assert.equal(result.sessionReady,false);
  assert.equal(result.nextRequirement,'session');
});

test('missing canonical journey fails closed',()=>{
  const result=coachLaunchReadiness({role:'coach',progress:completeTour(),journey:null});
  assert.equal(result.ready,false);
  assert.equal(result.nextRequirement,'data');
});

test('Client and Admin do not acquire Coach readiness semantics',()=>{
  for(const role of ['client','admin']){
    const result=coachLaunchReadiness({role,progress:{completed:true},journey:readyJourney()});
    assert.equal(result.applicable,false);
    assert.equal(result.ready,null);
  }
});

test('Coach onboarding UI reflects canonical readiness after the tour without redefining it',()=>{
  const state={visited:['coach-today','coach-clients','coach-agenda','coach-library','coach-verification']};
  const readiness=coachLaunchReadiness({role:'coach',progress:completeTour(),journey:readyJourney()});
  const html=renderProgressiveOnboardingPanel({role:'coach',state,readiness});
  assert.match(html,/Coach listo para trabajar/);
  assert.doesNotMatch(html,/puesta en marcha pendiente/i);
});

test('Coach onboarding UI stays pending when canonical first session is missing',()=>{
  const state={visited:['coach-today','coach-clients','coach-agenda','coach-library','coach-verification']};
  const journey=deriveCoachLaunchJourney({user,coach,assignments,planningSessions:planning,sessionExecutions:[]});
  const readiness=coachLaunchReadiness({role:'coach',progress:completeTour(),journey});
  const html=renderProgressiveOnboardingPanel({role:'coach',state,readiness});
  assert.match(html,/puesta en marcha pendiente/i);
  assert.doesNotMatch(html,/Coach listo para trabajar/);
});
