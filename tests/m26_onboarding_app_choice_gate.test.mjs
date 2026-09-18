import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  progressiveOnboardingScopeKey,
  progressiveOnboardingTrack,
} from '../src/m26/onboarding/progressive-onboarding.js';

const application=fs.readFileSync('src/m26/app/application.js','utf8');
const enhancer=fs.readFileSync('src/m26/rc39/shell-enhancer.js','utf8');

test('Genio waits until Admin or Coach app choice is confirmed',()=>{
  assert.match(application,/const roleChoiceConfirmed=identity\.roleChoiceConfirmed!==false/u);
  assert.match(application,/role:roleChoiceConfirmed\?\(activeApplicationRole\|\|identity\.role\|\|''\):''/u);
  assert.match(enhancer,/m26-role-choice/u);
  assert.match(enhancer,/inert aria-hidden="true"/u);
});

test('first onboarding remains independent for Coach and Admin on the same account',()=>{
  const userId='same-operational-user';
  const coach=progressiveOnboardingScopeKey({userId,role:'coach'});
  const admin=progressiveOnboardingScopeKey({userId,role:'admin'});
  assert.ok(coach);
  assert.ok(admin);
  assert.notEqual(coach,admin);
  assert.match(coach,/progressive-onboarding\.v1:coach:/u);
  assert.match(admin,/progressive-onboarding\.v1:admin:/u);
});

test('Coach and Admin each retain their own dynamic Genio track',()=>{
  const coach=progressiveOnboardingTrack('coach');
  const admin=progressiveOnboardingTrack('admin');
  assert.equal(coach.role,'coach');
  assert.equal(admin.role,'admin');
  assert.ok(coach.steps.length>=4);
  assert.ok(admin.steps.length>=4);
  assert.notDeepEqual(
    coach.steps.map((step)=>step.area),
    admin.steps.map((step)=>step.area),
  );
});

test('single-role accounts are not delayed by the app chooser contract',()=>{
  assert.match(application,/const roleChoiceConfirmed=!roleChoiceRequired\|\|Boolean\(requestedRole\)/u);
  assert.match(application,/const roleChoiceRequired=canSwitchApplication/u);
});
