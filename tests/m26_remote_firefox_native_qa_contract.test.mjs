import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/remote-gates.yml','utf8');
const config=fs.readFileSync('playwright.authenticated.config.mjs','utf8');
const chunk=(begin,end)=>{
  const i=workflow.indexOf(begin);
  assert.notEqual(i,-1,'missing '+begin);
  const j=workflow.indexOf(end,i+begin.length);
  assert.notEqual(j,-1,'missing '+end);
  return workflow.slice(i,j);
};

test('all seven authenticated browser profiles are required, not removed from QA',()=>{
 const preflight=chunk('  preflight:', '\n  firefox-native-auth-smoke:');
 const firefox=chunk('  firefox-native-auth-smoke:', '\n  exercise-media-broker-probe:');
 const all=[
  'authenticated-readonly-chromium',
  'authenticated-readonly-tablet-chromium',
  'authenticated-readonly-tablet-landscape-chromium',
  'authenticated-readonly-mobile-chromium',
  'authenticated-readonly-webkit',
  'authenticated-readonly-mobile-webkit',
  'authenticated-readonly-firefox'
 ];
 for(const [index,name] of all.entries()){
  assert.ok(config.includes("name:'"+name+"'"),name+' not configured');
  assert.equal((preflight.match(new RegExp('--project='+name+'(?![a-z-])','g'))||[]).length,index===6?0:1,
   name+' must only execute on its designated runner');
 }
 assert.equal((firefox.match(/--project=authenticated-readonly-firefox/g)||[]).length,1);
 assert.doesNotMatch(firefox,/--project=authenticated-readonly-(?:mobile-)?(?:webkit|chromium)/);
});
test('Firefox native keeps QA secrets behind the authorized environment and mutex',()=>{
 const native=chunk('  firefox-native-auth-smoke:', '\n  exercise-media-broker-probe:');
 const containerPreflight=chunk('  preflight:', '\n  firefox-native-auth-smoke:');
 assert.match(native,/needs: preflight/);
 assert.match(native,/runs-on: ubuntu-24\.04/);
 assert.doesNotMatch(native,/^\s+container:/m);
 assert.match(native,/environment: m26-canary-readonly/);
 assert.match(native,/concurrency:\s+group: iberfit-qa-shared-auth-readonly\s+queue: max\s+cancel-in-progress: false/);
 assert.match(native,/M26_QA_COACH_EMAIL:/);
 assert.match(native,/M26_QA_CLIENT_A_EMAIL:/);
 assert.match(native,/M26_QA_CLIENT_B_EMAIL:/);
 assert.match(native,/npx playwright install --with-deps firefox/);
 assert.match(native,/MOZ_DISABLE_CONTENT_SANDBOX/);
 assert.match(native,/IBERFIT_QA_FIREFOX_NATIVE_SANDBOX_AUTHENTICATED_VERIFIED/);
 assert.match(containerPreflight,/container:\s+image: mcr\.microsoft\.com\/playwright/);
 assert.doesNotMatch(workflow,/MOZ_DISABLE_CONTENT_SANDBOX\s*:\s*['"]?(?:1|true)/i);
 assert.doesNotMatch(workflow,/--security-opt\s+seccomp=unconfined|--cap-add=SYS_ADMIN/);
});
test('native Firefox probe stays without QA credentials',()=>{
 const probe=fs.readFileSync('.github/workflows/qa-firefox-native-sandbox-probe.yml','utf8');
 assert.match(probe,/runs-on: ubuntu-24\.04/);
 assert.match(probe,/IBERFIT_FIREFOX_NATIVE_SANDBOX_BROWSER_LAUNCH_VERIFIED/);
 assert.doesNotMatch(probe,/secrets\.|M26_QA_(?:COACH|CLIENT_)/);
});
