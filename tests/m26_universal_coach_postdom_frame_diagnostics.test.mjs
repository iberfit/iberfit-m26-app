import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('U360: route event dispatch is timed separately from DOM and enhancements',()=>{
 const s=source('src/m26/shell/shell-controller.js');
 assert.match(s,/markQaShellStage\('enhancements-complete',area/u);
 assert.match(s,/root\.dispatchEvent\(new CustomEvent\('m26:shell-rendered'/u);
 assert.match(s,/markQaShellStage\('shell-event-dispatched',area/u);
 assert.ok(s.indexOf("markQaShellStage('shell-event-dispatched',area") >
   s.indexOf("root.dispatchEvent(new CustomEvent('m26:shell-rendered'"),
   'post-event stage must follow all synchronous event listeners');
});
test('U360: Coach onboarding never synchronizes the secondary tour before route paint',()=>{
 const s=source('src/m26/onboarding/progressive-onboarding.js');
 const section=s.slice(s.indexOf('function onShellRendered(){'),
   s.indexOf('function removeOwned(){'));
 assert.match(section,/scheduleAfterPaint\(\)/u);
 assert.doesNotMatch(section,/scheduleTourOpenStateSync\(\)/u);
 assert.match(s,/function render\(\)[\s\S]*?scheduleTourOpenStateSync\(\)/u);
 assert.match(s,/postPaintFrame=raf\(\(\)=>\{/u);
 assert.match(s,/postPaintTimer=later\(\(\)=>\{/u);
 assert.match(s,/onDocumentTourClick\(event\)[\s\S]*?scheduleTourOpenStateSync\(\)/u);
});
test('U360: QA records real paint eligibility, never weakens trusted touch ≤5 seconds',()=>{
 const p=source('qa/signature-u26-authenticated-professional-routes.mjs');
 assert.match(p,/event\.isTrusted!==true/u);
 assert.match(p,/firstEligibleMs=performance\.now\(\)/u);
 assert.match(p,/frameWaitMs:paintedAt-firstEligibleMs/u);
 assert.match(p,/eligibleElapsedMs:firstEligibleMs-pending\.at/u);
 assert.match(p,/SIGNATURE_U26_SLOW_REAL_PAINT/u);
 assert.match(p,/\.toBeLessThanOrEqual\(5_000\)/u);
 assert.doesNotMatch(p,/dispatchEvent\(|force:true/u);
});
