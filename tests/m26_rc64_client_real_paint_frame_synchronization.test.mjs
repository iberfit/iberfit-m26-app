import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../qa/rc64/authenticated-current-contract.spec.mjs',import.meta.url),'utf8');
const start=source.indexOf('    const readVisual=()=>page.evaluate');
const end=source.indexOf("    console.log('RC64_CLIENT_NAV_BROWSER_PAINT_LATENCY:",start);

test('Client navigation waits for real painted frame on every browser engine',()=>{
  assert.ok(start>=0&&end>start,'Live navigation and visual proof must exist');
  const route=source.slice(start,end);
  assert.ok(route.includes('await expect.poll(async()=>Boolean((await readVisual())?.visiblePaint)'),'The actual next painted frame must be awaited');
  assert.ok(!route.includes("if(browserName==='webkit')"),'Do not restrict the paint wait to one engine');
  assert.ok(route.includes('timeout:5_000,intervals:[16,32,64,100,200]'),'Do not relax the 5s SLA');
  assert.ok(route.includes('visual?.trustedPointer'),'Require native trusted pointer receipt');
  assert.ok(route.includes('visual?.visiblePaint'),'Require visible route paint');
  assert.ok(route.includes('toBeLessThanOrEqual(5_000)'),'Retain strict measured browser latency');
  assert.ok(source.includes('if(hasTouch)await page.touchscreen.tap(x,y)'),'Real touch input required');
  assert.ok(source.includes('else await page.mouse.click(x,y)'),'Real mouse input required');
});

test('WebAuthn source gates also run when the real Client paint contract changes',()=>{
  for(const filename of ['coach-webauthn-recurring.yml','admin-webauthn-recurring.yml']){
    const text=readFileSync(new URL('../.github/workflows/'+filename,import.meta.url),'utf8');
    const exact="      - 'qa/rc64/authenticated-current-contract.spec.mjs'";
    assert.equal(text.split(exact).length-1,2,filename+' must watch the exact source in PR and protected Canary push');
    assert.ok(text.includes('  pull_request:'),filename+' must keep its PR gate');
    assert.ok(text.includes('  push:'),filename+' must keep its real postmerge gate');
  }
});
