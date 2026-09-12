import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const shell=await readFile(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');
const smoke=await readFile(new URL('../qa/rc64/authenticated-current-contract.spec.mjs',import.meta.url),'utf8');

test('mobile More exposes an active state when the current route lives outside quick navigation',()=>{
  assert.match(shell,/mobileMoreActive=moreMobileItems\.some/u);
  assert.match(shell,/m26-mobile-more\$\{mobileMoreActive\?' is-active'/u);
  assert.match(shell,/data-m26-more-active="true"/u);
  assert.doesNotMatch(shell,/summary[^>]*aria-current="page"/u);
  assert.match(shell,/m26-mobile-more\.is-active\s*>\s*summary/u);
});

test('authenticated smoke clicks the real sidebar or mobile navigation, not arbitrary workspace actions',()=>{
  assert.match(smoke,/\.m26-mobile-nav \[data-m26-area\]/u);
  assert.match(smoke,/\.m26-sidebar \[data-m26-area\]/u);
  assert.doesNotMatch(smoke,/const targetAreaButton=page\.locator\('\[data-m26-area\]:not/u);
});
