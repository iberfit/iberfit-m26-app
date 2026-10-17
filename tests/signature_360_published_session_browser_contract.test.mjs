import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fixture=read('qa/live-workout/published-sessions.fixture.mjs');
const html=read('qa/live-workout/published-sessions.fixture.html');
const browser=read('qa/live-workout/live-workout-browser.spec.mjs');
const config=read('playwright.live-workout.config.mjs');
const workflow=read('.github/workflows/session-qa-isolated.yml');

test('SIGNATURE QA published Client exercise uses production policy, projection, route and controller',()=>{
  for(const importName of ['clientSessionProjection','actorCanExecuteSession','sessionReadyToStart',
    'sessionHasExecutableBlocks','sessionIdOf','renderRc39Route','createExecution',
    'createSessionController','renderGuidedExecution']){
    assert.match(fixture,new RegExp('\\b'+importName+'\\b','u'),importName+' must use canonical implementation');
  }
  assert.match(fixture,/item\.visible===true&&item\.visibility==='full'/u);
  assert.match(fixture,/item\.canClientExecute===true&&item\.canClientStart===true/u);
  assert.match(fixture,/sessionIdOf\(item\.session\)===String\(item\.id\|\|''\)/u);
  assert.match(fixture,/if\(ok&&!controller\)launch\(item\)/u,'deny forged DOM starts and duplicate launches');
  assert.match(fixture,/status:scenario==='revoked'\?'borrador'/u);
  assert.match(fixture,/scenario==='paused'\?'en_curso'/u);
  assert.match(fixture,/clientVisibilityLevel:scenario==='summary'\?'summary_only':'full'/u);
  assert.match(fixture,/deliveryOwnership:'coach_led'/u);
  assert.match(fixture,/internalNotes:'QA_PRIVATE_COACH_NOTE_NEVER_CLIENT'/u);
  assert.doesNotMatch(fixture,/fetch\(|supabase|https?:\/\/|localStorage|sessionStorage|signIn|password|authorization:\s*['"]/iu);
});

test('SIGNATURE current-source Playwright matrix covers published and withdrawn sessions on mobile WebKit',()=>{
  assert.match(config,/testMatch:'live-workout-browser\.spec\.mjs'/u);
  assert.match(config,/live-workout-mobile-webkit/u);
  assert.match(config,/live-workout-tablet-chromium/u);
  assert.match(browser,/published-sessions\.fixture\.html\?scenario=mixed/u);
  assert.match(browser,/QA_PRIVATE_COACH_NOTE_NEVER_CLIENT/u);
  assert.match(browser,/data-rc39-session="qa-published-supervised"/u);
  assert.match(browser,/data-session-live-state="active"/u);
  for(const scenario of ['summary','revoked','paused','empty'])assert.match(browser,new RegExp("'"+scenario+"'","u"));
  assert.match(browser,/fake\.click\(\)/u);
  assert.match(browser,/docOverflow/u);
  assert.match(browser,/buttonHeight/u);
  assert.match(browser,/expect\(state\.launchCount\)\.toBe\(1\)/u);
  assert.match(html,/src\/m26\/rc39\/rc39\.css/u);
  assert.match(html,/src\/m26\/design\/dark-iberfit-v2\.css/u);
  assert.match(workflow,/signature-published-sessions-\$\{\{ github\.run_id \}\}/u);
  assert.match(workflow,/npm ci/u);
  assert.doesNotMatch(browser,/test\.skip\(.*SIGNATURE/u);
});
