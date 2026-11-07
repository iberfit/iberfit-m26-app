import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');
const route=source.slice(source.indexOf('async function navigateViaActualControl('),
                         source.indexOf('async function auditAuthenticatedProfessionalRoutes('));
assert.ok(route.length>2000,'U26 current-source route audit not found');

test('U26 verifies a live physical locator, not a stale elementFromPoint snapshot',()=>{
  assert.doesNotMatch(route,/document\.elementFromPoint\(/u);
  assert.match(route,/await choice\.scrollIntoViewIfNeeded\(\{timeout:12000\}\)/u);
  assert.match(route,/expect\(rect\.width\)\.toBeGreaterThan\(0\)/u);
  assert.match(route,/expect\(rect\.height\)\.toBeGreaterThan\(0\)/u);
  assert.match(route,/if\(coarse\)await choice\.tap\(\{noWaitAfter:true,timeout:12000\}\)/u);
  assert.match(route,/else await choice\.click\(\{noWaitAfter:true,timeout:12000\}\)/u);
  assert.doesNotMatch(route,/force:\s*true|dispatchEvent\(/u);
});

test('U26 still fails closed without a genuine trusted target and painted route',()=>{
  assert.match(source,/if\(event\.isTrusted!==true\)return/u);
  assert.match(source,/event\.target\?\.closest\?\.\('\[data-m26-area\]'\)/u);
  assert.match(source,/pending=\{area,at:performance\.now\(\)\}/u);
  assert.match(route,/proof\?\.trusted===true&&proof\.area===area/u);
  assert.match(route,/state\?\.activeArea\|\|''\)===area/u);
  assert.match(route,/aria-current="page"/u);
  assert.match(route,/\{timeout:12000,polling:'raf'\}/u);
});
