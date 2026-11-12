
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const role=readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
const premium=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
const visual=readFileSync(new URL('../qa/device-experience/signature-u96-retina4k.spec.mjs',import.meta.url),'utf8');

test('physical 4K at 1920 CSS pixels DPR2 enters authentic UHD editorial breakpoint',()=>{
  for(const src of [role,premium]){
    assert.match(src,/@media \(min-width:2560px\), \(min-width:1900px\) and \(min-resolution:2dppx\)/u);
  }
  assert.match(premium,/max-inline-size:min\(1640px,100%\)/u);
  assert.match(premium,/max-inline-size:min\(1920px,100%\)/u);
  assert.match(visual,/width:1920,height:1080,dpr:2/u);
  assert.match(visual,/routeMaxInlineSize/u);
  assert.match(visual,/routeWidthCssPx/u);
  assert.match(visual,/real DPR2 UHD CSS cap/u);
  assert.match(visual,/route must fit its role-specific cap/u);
});

test('UHD rule does not accidentally expand normal 1920 CSS DPR1 or 1728 CSS DPR2 laptop',()=>{
  const good='@media (min-width:2560px), (min-width:1900px) and (min-resolution:2dppx)';
  for(const css of [role,premium]){
    assert.ok(css.includes(good));
    assert.doesNotMatch(css,/\/\* SIGNATURE EXCELLENCE UHD[\s\S]*?@media \(min-width:1920px\)\s*\{/u);
  }
  assert.match(visual,/expect\(status\.overflow/u,'4K responsive must still reject horizontal overflow');
  assert.match(visual,/authenticated:false/u,'synthetic 4K test is never mistaken for real production acceptance');
});
