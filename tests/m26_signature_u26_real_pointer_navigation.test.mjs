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
