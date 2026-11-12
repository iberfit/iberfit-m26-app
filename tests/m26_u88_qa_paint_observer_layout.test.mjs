import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');
test('U88 MutationObserver cannot force synchronous layout before the next real frame',()=>{
  assert.match(source,/function routeIsPaintable\(area,\{checkGeometry=true\}=\{\}\)/u);
  assert.match(source,/if\(!checkGeometry\)return true;/u);
  assert.match(source,/function check\(\)\{\s*if\(!pending\|\|paintQueued\|\|!routeIsPaintable\(pending\.area,\{checkGeometry:false\}\)\)return;/u);
  assert.match(source,/requestAnimationFrame\(\(\)=>\{\s*paintQueued=false;\s*if\(!pending\|\|!routeIsPaintable\(pending\.area\)\)return;/u);
  assert.match(source,/const rect=main\.getBoundingClientRect\(\);/u);
  assert.match(source,/getComputedStyle\(main\)\.visibility!=='hidden'/u);
});
test('U88 keeps trusted physical navigation, semantic readiness and strict original 5s SLA',()=>{
  assert.match(source,/if\(event\.isTrusted!==true\)return;/u);
  assert.match(source,/pending=\{area,at:performance\.now\(\)\}/u);
  assert.match(source,/main\.hasAttribute\('inert'\)/u);
  assert.match(source,/main\.querySelector\('\.m26-route-placeholder'\)/u);
  assert.match(source,/last=\{area:pending\.area,elapsedMs:performance\.now\(\)-pending\.at,trusted:true/u);
  assert.match(source,/toBeLessThanOrEqual\(5_000\)/u);
});
test('U88 QA attribution is bounded and contains no URLs, user identifiers or source text',()=>{
  assert.match(source,/const scriptRows=Array\.from\(entry\.scripts\|\|\[\]\)\.slice\(0,6\)/u);
  assert.match(source,/script\.forcedStyleAndLayoutDuration/u);
  assert.match(source,/script\.sourceFunctionName/u);
  assert.match(source,/\^\[A-Za-z_\$\]\[\\w\$\]\{0,55\}\$/u);
  assert.doesNotMatch(source,/trace\.scriptSource|trace\.sourceURL|script\.sourceURL|sourceText/u);
});
