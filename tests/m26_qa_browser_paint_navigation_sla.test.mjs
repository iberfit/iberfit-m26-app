import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const spec=readFileSync('qa/rc64/authenticated-current-contract.spec.mjs','utf8');
const nav=spec.slice(spec.indexOf('const visibleNavigationTarget'),spec.indexOf('const settingsSummary'));
test('Authenticated navigation SLA measures trusted pointer-to-visible browser paint, not Playwright host scheduling',()=>{
 assert.match(spec,/event\.isTrusted!==true/u);
 assert.match(spec,/pointerAt=performance\.now\(\)/u);
 assert.match(spec,/paintedAt=performance\.now\(\)/u);
 assert.match(spec,/requestAnimationFrame/u);
 assert.match(spec,/new MutationObserver\(capturePaint\)/u);
 assert.match(spec,/toBeLessThanOrEqual\(5_000\)/u);
 assert.match(spec,/expect\(visual\?\.trustedPointer/u);
 assert.match(spec,/expect\(visual\?\.visiblePaint/u);
 assert.match(spec,/await expect\(activeNavigation/u);
 assert.match(spec,/pointerdown/u);
 assert.doesNotMatch(nav,/dispatchEvent\(|\.click\(\)|force:true|toBeLessThanOrEqual\(6_000\)/u);
});
