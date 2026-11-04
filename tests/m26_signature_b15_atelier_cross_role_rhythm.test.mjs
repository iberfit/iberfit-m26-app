import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
const rc=readFileSync(new URL('../src/m26/rc39/route-render.js',import.meta.url),'utf8');
const start=css.indexOf('/* SIGNATURE B15 · Atelier Performance: calendar and role interaction rhythm.');
const part=css.slice(start);
test('B15 global Atelier additions live in existing design source without CSS specificity debt',()=>{
 assert.ok(start>0);
 assert.doesNotMatch(part,/!important/u);
 assert.doesNotMatch(part,/position:\s*fixed|position:\s*sticky|backdrop-filter|transform:\s*translate|linear-gradient|radial-gradient/u);
 assert.match(part,/@media\(forced-colors:active\)/u);
 assert.match(part,/@media\(prefers-reduced-motion:reduce\)/u);
 assert.match(part,/@media\(max-width:390px\)/u);
});
test('B15 dates are actual native disclosures, keyboard links, and safe mobile scroll',()=>{
 assert.match(rc,/class="m26-rc39-day-group"/u);
 assert.match(rc,/class="m26-rc39-day-heading"/u);
 assert.match(rc,/data-rc39-date-target=/u);
 assert.match(part,/\.m26-rc39-date-links\{\s*display:flex;/u);
 assert.match(part,/overflow-x:auto/u);
 assert.match(part,/scroll-margin-block-start/u);
 assert.match(part,/\.m26-rc39-day-group:not\(\[open\]\)>.m26-rc39-week\{\s*display:none;/u);
 assert.match(part,/aria-current="date"/u);
 assert.match(part,/focus-visible/u);
});
test('B15 keeps three distinct products and responsive live session controls',()=>{
 assert.match(part,/data-m26-role="client"/u);
 assert.match(part,/data-m26-role="coach"/u);
 assert.match(part,/data-m26-role="admin"/u);
 assert.match(part,/\.m26-session-live-v3/u);
 assert.match(part,/data-session-action="complete-set"/u);
 assert.match(part,/min-block-size:56px/u);
 assert.match(part,/overscroll-behavior-inline:contain/u);
 assert.match(part,/font-variant-numeric:tabular-nums/u);
});
