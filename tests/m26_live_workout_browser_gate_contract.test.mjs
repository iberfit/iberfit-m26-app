import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/session-qa-isolated.yml','utf8');
const config=fs.readFileSync('playwright.live-workout.config.mjs','utf8');
const spec=fs.readFileSync('qa/live-workout/live-workout-browser.spec.mjs','utf8');
const fixture=fs.readFileSync('qa/live-workout/fixture.mjs','utf8');

test('Session QA permanently runs the dedicated Live Workout browser gate',()=>{
  assert.match(workflow,/qa\/live-workout\/\*\*/u);
  assert.match(workflow,/playwright\.live-workout\.config\.mjs/u);
  assert.match(workflow,/browser-live-workout:/u);
  assert.match(workflow,/npm ci/u);
  assert.match(workflow,/actions\/cache@v4/u);
  assert.match(workflow,/playwright install-deps chromium webkit/u);
  assert.match(workflow,/cache-hit != 'true'/u);
  assert.match(workflow,/playwright install chromium webkit/u);
  assert.match(workflow,/npx playwright test --config=playwright\.live-workout\.config\.mjs/u);
});

test('Live Workout browser matrix covers desktop tablet mobile and iOS-class WebKit',()=>{
  for(const project of [
    'live-workout-desktop-chromium',
    'live-workout-tablet-chromium',
    'live-workout-mobile-chromium',
    'live-workout-mobile-webkit',
  ])assert.ok(config.includes(project),project);
  assert.match(config,/workers:1/u);
  assert.match(config,/retries:0/u);
  assert.match(config,/trace:'retain-on-failure'/u);
});

test('Live Workout browser E2E drives the real controller and critical session actions',()=>{
  assert.match(fixture,/createSessionController/u);
  assert.match(fixture,/renderGuidedExecution/u);
  assert.match(fixture,/createExecution/u);
  assert.doesNotMatch(fixture,/commandBus\s*:/u);
  for(const action of [
    'start',
    'pause',
    'resume',
    'complete-set',
    'rest-plus',
    'rest-minus',
    'correct-set',
    'extra-set-now',
    'substitute',
    'skip-set',
    'skip-exercise',
    'finish',
  ])assert.ok(spec.includes(`data-session-action="${action}"`)||spec.includes(`action="\${action}"`),action);
});

test('Live Workout browser E2E protects recovery and horizontal/touch ergonomics',()=>{
  assert.match(spec,/visibilitychange/u);
  assert.match(spec,/activeSetDraft/u);
  assert.match(spec,/scrollWidth/u);
  assert.match(spec,/clientWidth/u);
  assert.match(spec,/pauseWidth/u);
  assert.match(spec,/pauseHeight/u);
});
