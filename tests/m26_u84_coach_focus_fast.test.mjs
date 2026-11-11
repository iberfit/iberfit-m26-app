import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
const realQa=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');

test('U84 Coach route focus stays accessible, avoids automatic browser scroll and resets native scroll',()=>{
  const focus=source.slice(source.indexOf('  function focusMain(){'),source.indexOf('  const COACH_ACTION_FOCUS_TARGETS='));
  assert.ok(focus.length>400);
  assert.match(focus,/getNavigationSnapshot\?\.\(\)\?\.identity\?\.role==='coach'/u);
  assert.match(focus,/main\.focus\?\.\(\{preventScroll:true\}\)/u);
  assert.match(focus,/documentScroller\.scrollTop=0/u);
  assert.match(focus,/main\.scrollTop=0/u);
  assert.match(focus,/if\(!coach\)\{main\.focus\?\.\(\{preventScroll:false\}\);return;\}/u);
  assert.doesNotMatch(focus,/\.scrollIntoView\?\.\(/u);
});

test('U84 real QA still requires trusted pointer route to paint within 5000 ms and reports long tasks',()=>{
  assert.match(realQa,/event\.isTrusted!==true/u);
  assert.match(realQa,/toBeLessThanOrEqual\(5_000\)/u);
  assert.match(realQa,/SIGNATURE_U26_SLOW_REAL_PAINT/u);
  assert.match(realQa,/readLongTasks/u);
});
