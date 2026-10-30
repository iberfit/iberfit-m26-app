import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const route=readFileSync('qa/signature-u26-authenticated-professional-routes.mjs','utf8');
const coach=readFileSync('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs','utf8');

test('U26 enforces real physical pointer + hit test + route confirmation for every professional route',()=>{
 assert.match(route,/document\.elementFromPoint\(x,y\)/u);
 assert.match(route,/expect\(hit\.area/u);
 assert.match(route,/expect\(hit\.disabled/u);
 assert.match(route,/page\.touchscreen\.tap\(x,y\)/u);
 assert.match(route,/page\.mouse\.click\(x,y\)/u);
 assert.match(route,/expect\.poll\(\(\)=>activeArea\(page\)/u);
 assert.match(route,/must not cross role boundary/u);
 assert.match(route,/horizontal document overflow/u);
 assert.doesNotMatch(route,/choice\.click\(\)/u);
 assert.doesNotMatch(route,/dispatchEvent\(|force:true/u);
});

test('U55 Coach title is asserted at input, after modality change, before and after save',()=>{
 assert.match(coach,/Offline Coach title must remain after a genuine input event/u);
 assert.match(coach,/Changing delivery must not discard the Coach draft title/u);
 assert.match(coach,/Adding\/editing exercises must preserve the local Coach title before save/u);
 assert.match(coach,/await expect\(builder\.locator\('\[data-session-draft-field="title"\]'\)\)\.toHaveValue\(title\)/u);
 assert.match(coach,/context\.setOffline\(true\)/u);
 assert.match(coach,/No forbidden write or foreign request even during offline authoring/u);
});

test('U26 browser-anchored navigation evidence is fail-closed at 5s',()=>{
 assert.match(route,/event\.isTrusted!==true/u);
 assert.match(route,/new MutationObserver\(probe\)/u);
 assert.match(route,/requestAnimationFrame\(\(\)=>/u);
 assert.match(route,/elapsedMs=performance\.now\(\)-pending\.at/u);
 assert.match(route,/state\.navPaint\?\.trusted/u);
 assert.match(route,/state\.navPaint\?\.area/u);
 assert.match(route,/state\.navPaint\?\.elapsedMs/u);
 assert.match(route,/\.toBeLessThanOrEqual\(5_000\)/u);
 assert.match(route,/SIGNATURE_U26_BROWSER_PAINT/u);
 assert.doesNotMatch(route,/force:true|dispatchEvent\(/u);
});
test('Coach suite completion budget is separate from the original 5s real route SLA',()=>{
 assert.match(coach,/test\.setTimeout\(600_000\)/u);
 assert.match(route,/\.toBeLessThanOrEqual\(5_000\)/u);
 assert.match(coach,/No forbidden write or foreign request even during offline authoring/u);
 assert.match(coach,/await expect\(builder\.locator\('\[data-session-action="preview"\]'\)\.first\(\)/u);
});
