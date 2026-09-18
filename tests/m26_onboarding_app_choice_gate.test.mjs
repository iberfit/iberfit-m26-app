import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  progressiveOnboardingScopeKey,
  progressiveOnboardingTrack,
} from '../src/m26/onboarding/progressive-onboarding.js';

const application=fs.readFileSync('src/m26/app/application.js','utf8');
const enhancer=fs.readFileSync('src/m26/rc39/shell-enhancer.js','utf8');

test('Genio waits until the authorized app choice is confirmed',()=>{
  assert.match(application,/const applicationAccess=state\.applicationAccess\|\|\{\};/u);
  assert.match(application,/const roleChoiceConfirmed=applicationAccess\.roleChoiceConfirmed===true\|\|!canSwitchApplication\(applicationAccess\);/u);
  assert.doesNotMatch(application,/const roleChoiceConfirmed=identity\.roleChoiceConfirmed!==false/u);
  assert.match(application,/role:roleChoiceConfirmed\?\(activeApplicationRole\|\|identity\.role\|\|''\):''/u);
  assert.match(enhancer,/m26-role-choice/u);
  assert.match(enhancer,/inert aria-hidden="true"/u);
});

test('first onboarding remains independent for Client, Coach and Admin on the same account',()=>{
  const userId='same-multiapp-user';
  const client=progressiveOnboardingScopeKey({userId,role:'client'});
  const coach=progressiveOnboardingScopeKey({userId,role:'coach'});
  const admin=progressiveOnboardingScopeKey({userId,role:'admin'});
  assert.ok(client);
  assert.ok(coach);
  assert.ok(admin);
  assert.equal(new Set([client,coach,admin]).size,3);
  assert.match(client,/progressive-onboarding\.v1:client:/u);
  assert.match(coach,/progressive-onboarding\.v1:coach:/u);
  assert.match(admin,/progressive-onboarding\.v1:admin:/u);
});

test('Client, Coach and Admin each retain their own dynamic Genio track',()=>{
  const client=progressiveOnboardingTrack('client');
  const coach=progressiveOnboardingTrack('coach');
  const admin=progressiveOnboardingTrack('admin');
  assert.equal(client.role,'client');
  assert.equal(coach.role,'coach');
  assert.equal(admin.role,'admin');
  assert.ok(client.steps.length>=4);
  assert.ok(coach.steps.length>=4);
  assert.ok(admin.steps.length>=4);
  assert.notDeepEqual(client.steps.map((step)=>step.area),coach.steps.map((step)=>step.area));
  assert.notDeepEqual(coach.steps.map((step)=>step.area),admin.steps.map((step)=>step.area));
});

test('single-role accounts are not delayed by the app chooser contract',()=>{
  assert.match(application,/const roleChoiceConfirmed=!roleChoiceRequired\|\|Boolean\(requestedRole\)/u);
  assert.match(application,/const roleChoiceRequired=canSwitchApplication/u);
});
