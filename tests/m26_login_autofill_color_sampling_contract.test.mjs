import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('login color QA samples actual rendered RGB, not digits from CSS Color 4 decimals',()=>{
  const source=readFileSync('qa/device-experience/login-autofill.spec.mjs','utf8');
  assert.match(source,/canvas\.getContext\('2d',\{willReadFrequently:true\}\)/u);
  assert.match(source,/ctx\.getImageData\(0,0,1,1\)\.data/u);
  assert.match(source,/colorSamplerSanity:rgb\('color\(srgb 0\.2 0\.1 0\.1\)'\)/u);
  assert.match(source,/expect\(focused\.colorSamplerSanity\)\.toEqual\(\[51,26,26\]\)/u);
  assert.doesNotMatch(source,/String\(value\)\.matchAll\(\/\\d\+\/g\)/u);
  assert.match(source,/expect\(Math\.max\(\.\.\.focused\.background\)\)\.toBeLessThan\(64\)/u);
  assert.match(source,/expect\(Math\.min\(\.\.\.focused\.textFill\)\)\.toBeGreaterThan\(180\)/u);
});
