import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {navigationForRole} from '../src/m26/shell/navigation.js';

const shell=await readFile(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');
const smoke=await readFile(new URL('../qa/rc64/authenticated-current-contract.spec.mjs',import.meta.url),'utf8');

test('mobile More exposes an active state when the current route lives outside quick navigation',()=>{
  assert.match(shell,/mobileMoreActive=moreMobileItems\.some/u);
  assert.match(shell,/m26-mobile-more\$\{mobileMoreActive\?' is-active'/u);
  assert.match(shell,/data-m26-more-active="true"/u);
  assert.doesNotMatch(shell,/summary[^>]*aria-current="page"/u);
});

test('authenticated smoke clicks the real sidebar or mobile navigation, not arbitrary workspace actions',()=>{
  assert.match(smoke,/\.m26-client-bottom-nav \[data-m26-area\]/u);
  assert.match(smoke,/\.m26-mobile-nav \[data-m26-area\]/u);
  assert.match(smoke,/\.m26-sidebar \[data-m26-area\]/u);
  assert.doesNotMatch(smoke,/const targetAreaButton=page\.locator\('\[data-m26-area\]:not/u);
});


test('Admin mobile More exposes global tools only; person routes require an explicit person',()=>{
  const nav=navigationForRole('admin');
  const globalKeys=[...nav.primary,...nav.context,...nav.tools].map((item)=>item.key);
  for(const area of ['admin-expediente','admin-iri','admin-informes','admin-notas']){
    assert.equal(globalKeys.includes(area),false,area);
  }
  assert.equal(globalKeys.includes('admin-clientes'),true);
  assert.equal(globalKeys.includes('biblioteca'),true);
});
