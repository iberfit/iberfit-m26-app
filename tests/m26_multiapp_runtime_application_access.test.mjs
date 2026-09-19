import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Regression captured from the authenticated WebAuthn + multiapp Admin QA gate on 2026-09-18.
const applicationSource=await fs.readFile(new URL('../src/m26/app/application.js',import.meta.url),'utf8');

function between(source,start,end){
  const from=source.indexOf(start);
  assert.notEqual(from,-1,`missing start marker: ${start}`);
  const to=source.indexOf(end,from+start.length);
  assert.notEqual(to,-1,`missing end marker: ${end}`);
  return source.slice(from,to);
}

test('runtime role switch authorizes only from applicationAccess',()=>{
  const handler=between(applicationSource,'async function onSwitchRole(event){','function onInspectOperation');
  assert.match(handler,/const applicationAccess=store\.getState\(\)\.applicationAccess\|\|\{\};/u);
  assert.match(handler,/const allowed=Array\.isArray\(applicationAccess\.authorizedRoles\)\?applicationAccess\.authorizedRoles:\[\];/u);
  assert.match(handler,/canSwitchApplication\(applicationAccess\)\|\|!allowed\.includes\(role\)/u);
  assert.doesNotMatch(handler,/identity\.authorizedRoles|canSwitchApplication\(identity\)|const identity=/u);
});

test('progressive onboarding stays suppressed until a required multiapp choice is confirmed',()=>{
  const provider=between(applicationSource,'identityProvider:()=>{','mediaExperience=createExerciseVideoExperienceController');
  assert.match(provider,/const applicationAccess=state\.applicationAccess\|\|\{\};/u);
  assert.match(provider,/const roleChoiceConfirmed=applicationAccess\.roleChoiceConfirmed===true\|\|!canSwitchApplication\(applicationAccess\);/u);
  assert.doesNotMatch(provider,/roleChoiceConfirmed=identity\.roleChoiceConfirmed!==false/u);
});
