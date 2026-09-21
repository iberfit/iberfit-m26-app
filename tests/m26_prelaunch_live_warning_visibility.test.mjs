import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const gate=fs.readFileSync(path.join(repo,'scripts','prelaunch','check_live_canary_gate.mjs'),'utf8');

test('prelaunch live warning gate evaluates actual visibility and preserves fail-closed semantics',()=>{
  assert.match(gate,/const warningLocator=page\.locator\('\.m26-notice\.is-warning'\);/u);
  assert.match(gate,/visible:await notice\.isVisible\(\)/u);
  assert.match(gate,/const visibleWarnings=warningDiagnostics\.filter\(\(warning\)=>warning\.visible===true\);/u);
  assert.match(gate,/invariant\(visibleWarnings\.length===0,'PRELAUNCH_LIVE_WARNING_VISIBLE'\);/u);
  assert.doesNotMatch(gate,/page\.locator\('\.m26-notice\.is-warning'\)\.count\(\)===0/u);
});

test('prelaunch live warning gate records warning evidence before enforcing the invariant',()=>{
  const evidenceIndex=gate.indexOf('warningNotices:warningDiagnostics');
  const invariantIndex=gate.indexOf("invariant(visibleWarnings.length===0,'PRELAUNCH_LIVE_WARNING_VISIBLE')");
  assert.ok(evidenceIndex>=0,'warning diagnostics must be present in evidence');
  assert.ok(invariantIndex>evidenceIndex,'warning evidence must be written before the visibility invariant can fail');
  assert.match(gate,/PRELAUNCH_LIVE_WARNING_DIAGNOSTICS=/u);
  assert.match(gate,/PRELAUNCH_LIVE_HIDDEN_WARNING_DIAGNOSTICS=/u);
});
