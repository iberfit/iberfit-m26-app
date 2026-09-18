import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const applicationSource=await fs.readFile(new URL('../src/m26/app/application.js',import.meta.url),'utf8');

test('runtime role switch authorizes from applicationAccess, never Client identity metadata',()=>{
  assert.match(applicationSource,/const applicationAccess=state\.applicationAccess\|\|\{\};/u);
  assert.match(applicationSource,/canSwitchApplication\(applicationAccess\)\|\|!allowed\.includes\(role\)/u);
  assert.doesNotMatch(applicationSource,/const allowed=identity\.authorizedRoles\|\|\[\];/u);
  assert.doesNotMatch(applicationSource,/canSwitchApplication\(identity\)\|\|!allowed\.includes\(role\)/u);
});

test('progressive onboarding stays suppressed until a required multiapp choice is confirmed',()=>{
  assert.match(applicationSource,/const roleChoiceConfirmed=applicationAccess\.roleChoiceConfirmed===true\|\|!canSwitchApplication\(applicationAccess\);/u);
  assert.doesNotMatch(applicationSource,/roleChoiceConfirmed=identity\.roleChoiceConfirmed!==false/u);
});
