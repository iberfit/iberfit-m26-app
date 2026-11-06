import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const qa=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
test('UNIVERSAL: Coach authenticated navigation keeps trusted pointer and strict 5 s browser paint SLA',()=>{
  assert.match(qa,/choice\.click\(\{noWaitAfter:true,timeout:12000\}\)/u);
  assert.match(qa,/choice\.tap\(\{noWaitAfter:true,timeout:12000\}\)/u);
  assert.match(qa,/page\.waitForFunction/u);
  assert.match(qa,/event\.isTrusted!==true/u);
  assert.match(qa,/new MutationObserver\(check\)/u);
  assert.match(qa,/performance\.now\(\)-pending\.at/u);
  assert.match(qa,/\.toBeLessThanOrEqual\(5_000\)/u);
  assert.doesNotMatch(qa,/expect\.poll\(\(\)=>activeArea\(page\)/u);
  assert.match(qa,/timeout:12000,polling:'raf'/u);
  assert.doesNotMatch(qa,/dispatchEvent\(|force:true/u);
});
test('UNIVERSAL: QA route profiling is opt-in after authenticated Coach, logs no private fields',()=>{
  assert.match(qa,/if\(role==='coach'\)\{/u);
  assert.match(qa,/__IBERFIT_QA_AUTH_INPUT_EVENTS__/u);
  assert.match(qa,/shellRouteTimings:\[\]/u);
  assert.match(shell,/phase:String\(phase\)\.slice\(0,40\)/u);
  assert.match(shell,/area:String\(area\)\.slice\(0,30\)/u);
  assert.match(shell,/elapsedMs:Number\.isFinite\(elapsedMs\)/u);
  assert.match(qa,/throw error;/u);
  assert.doesNotMatch(qa,/JSON\.stringify\(globalThis\.__IBERFIT_QA_AUTH_INPUT_EVENTS__\)/u);
});
