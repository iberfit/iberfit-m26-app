import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync('qa/rc64/authenticated-current-contract.spec.mjs','utf8');
test('WebKit observer waits for actual paint without inventing DOM events',()=>{
 assert.ok(src.includes("expect.poll(async()=>Boolean((await readVisual())?.visiblePaint)"));
 assert.ok(src.includes("timeout:5_000,intervals:[16,32,64,100,200]"));
 assert.ok(src.includes("event.isTrusted!==true"));
 assert.ok(src.includes("requestAnimationFrame"));
 assert.ok(src.includes("page.touchscreen.tap(x,y)"));
 assert.ok(src.includes("page.mouse.click(x,y)"));
});
test('the REAL pointer-to-painted-route latency SLA stays at 5000ms',()=>{
 assert.ok(src.includes("expect(visual?.elapsedMs,'Actual pointer-to-painted-route latency remains <=5s')"));
 assert.ok(src.includes(".toBeLessThanOrEqual(5_000)"));
 assert.ok(src.includes("expect(pointer?.trustedPointer,'A genuine trusted pointerdown on the target must be observed')"));
 assert.ok(!src.includes("dispatchEvent(new PointerEvent"));
});
