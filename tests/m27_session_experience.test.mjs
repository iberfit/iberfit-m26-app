import test from 'node:test';
import assert from 'node:assert/strict';
import {M27_SESSION_EXPERIENCE_VERSION,resolveSessionExperience} from '../src/m26/domain/modality.js';

const base={role:'client',isPublished:true,hasFullContent:true};

test('M27 session experience exposes a versioned contract',()=>{
  assert.equal(M27_SESSION_EXPERIENCE_VERSION,'m27-session-experience-v1');
});

test('presencial coach-led remains non-autonomous for the client',()=>{
  const vm=resolveSessionExperience({...base,contractModality:'presencial',deliveryModality:'presencial',ownership:'coach_led',clientCanExecute:false});
  assert.equal(vm.kind,'presencial_coach_led');
  assert.equal(vm.clientLiveWorkout,false);
  assert.equal(vm.coachLed,true);
  assert.equal(vm.attendance,true);
  assert.equal(vm.primaryEnabled,false);
  assert.equal(vm.offlineEligible,false);
});

test('hybrid presencial session stays coach-led',()=>{
  const vm=resolveSessionExperience({...base,contractModality:'Híbrido',deliveryModality:'presencial',ownership:'coach_led',clientCanExecute:false});
  assert.equal(vm.kind,'hybrid_coach_led');
  assert.equal(vm.clientLiveWorkout,false);
  assert.match(vm.eyebrow,/Híbrido/);
});

test('hybrid guided session enables autonomous Live Workout without duplicating the plan',()=>{
  const vm=resolveSessionExperience({...base,contractModality:'hibrido',deliveryModality:'guiada_en_app',ownership:'client_autonomous',clientCanExecute:true});
  assert.equal(vm.kind,'hybrid_autonomous');
  assert.equal(vm.clientLiveWorkout,true);
  assert.equal(vm.selfLog,true);
  assert.equal(vm.rirCapture,true);
  assert.equal(vm.restTimer,true);
  assert.equal(vm.offlineEligible,true);
  assert.equal(vm.requiresConnection,false);
});

test('online autonomous session exposes the full self-guided toolset',()=>{
  const vm=resolveSessionExperience({...base,contractModality:'online',deliveryModality:'guiada_en_app',ownership:'guided_in_app',clientCanExecute:true});
  assert.equal(vm.kind,'online_autonomous');
  assert.equal(vm.clientLiveWorkout,true);
  assert.equal(vm.asyncFeedback,true);
  assert.ok(vm.capabilities.includes('Feedback'));
});

test('ownership/visibility policy wins over modality labels',()=>{
  const vm=resolveSessionExperience({...base,contractModality:'hibrido',deliveryModality:'guiada_en_app',ownership:'coach_led',clientCanExecute:false});
  assert.equal(vm.clientLiveWorkout,false);
  assert.equal(vm.coachLed,true);
  assert.equal(vm.primaryEnabled,false);
});

test('unpublished or incomplete autonomous content cannot become Live Workout',()=>{
  const unpublished=resolveSessionExperience({...base,isPublished:false,contractModality:'online',deliveryModality:'guiada_en_app',ownership:'client_autonomous',clientCanExecute:true});
  const incomplete=resolveSessionExperience({...base,hasFullContent:false,contractModality:'online',deliveryModality:'guiada_en_app',ownership:'client_autonomous',clientCanExecute:true});
  assert.equal(unpublished.clientLiveWorkout,false);
  assert.equal(incomplete.clientLiveWorkout,false);
});

test('live online explicitly requires connectivity and is not offline eligible',()=>{
  const vm=resolveSessionExperience({...base,contractModality:'online',deliveryModality:'online',ownership:'live_online',clientCanExecute:false});
  assert.equal(vm.kind,'online_live_coach');
  assert.equal(vm.requiresConnection,true);
  assert.equal(vm.offlineEligible,false);
  assert.equal(vm.attendance,true);
});

test('coach gets control context without making client-only sessions executable',()=>{
  const vm=resolveSessionExperience({...base,role:'coach',contractModality:'hibrido',deliveryModality:'presencial',ownership:'coach_led',clientCanExecute:false});
  assert.equal(vm.kind,'hybrid_coach_led');
  assert.equal(vm.coachControl,true);
  assert.equal(vm.clientLiveWorkout,false);
});
