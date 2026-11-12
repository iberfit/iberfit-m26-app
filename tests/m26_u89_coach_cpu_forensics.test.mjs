import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const qa=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');

test('U89 CPU forensic begins only after a verified 5-second trusted navigation failure',()=>{
  const failure=qa.indexOf("console.log('SIGNATURE_U26_SLOW_REAL_PAINT '");
  const diagnose=qa.indexOf('const cpu=await diagnoseSlowCoachRouteCpu(page);');
  const threshold=qa.indexOf('.toBeLessThanOrEqual(5_000);');
  assert.ok(failure>0&&diagnose>failure&&threshold>diagnose);
  assert.match(qa,/if\(role==='coach'&&area==='clientes'/u);
  assert.match(qa,/Number\(page\.viewportSize\(\)\?\.width\|\|0\)>=1000/u);
  assert.match(qa,/if\(event\.isTrusted!==true\)return;/u);
  assert.match(qa,/toBeLessThanOrEqual\(5_000\)/u);
  assert.doesNotMatch(qa,/force:true|dispatchEvent\(/u);
});

test('U89 CDP profiling repeats only two read-only routed clicks and never logs raw profile or URL',()=>{
  assert.match(qa,/for\(const area of \['hoy','clientes'\]\)/u);
  assert.match(qa,/page\.context\(\)\.newCDPSession\(page\)/u);
  assert.match(qa,/Profiler\.enable/u);
  assert.match(qa,/Profiler\.start/u);
  assert.match(qa,/Profiler\.stop/u);
  assert.match(qa,/await option\.click\(\{noWaitAfter:true,timeout:12000\}\)/u);
  assert.match(qa,/Math\.min\(60_000,samples\.length\)/u);
  assert.match(qa,/\.slice\(0,12\)/u);
  assert.match(qa,/SIGNATURE_U89_COACH_CPU_DIAGNOSTIC/u);
  assert.doesNotMatch(qa,/callFrame\?\.url|console\.log\(profile\)|JSON\.stringify\(profile\)|writeFile|attach\(/u);
});

test('U89 stage checkpoints preserve owner CAS and queued render/focus behaviour',()=>{
  assert.match(shell,/ticket!==touchRouteTicket\|\|version!==generation\|\|!unsubscribe/u);
  assert.ok(shell.includes("String(latest.identity?.id||'')!==ownerId"));
  assert.match(shell,/store\.navigateFast\(decision\.area\)/u);
  assert.match(shell,/markQaShellStage\('route-store-updated',decision\.area\)/u);
  assert.match(shell,/markQaShellStage\('route-reconcile-queued',decision\.area\)/u);
  assert.match(shell,/markQaShellStage\('route-focus-queued',decision\.area\)/u);
  assert.match(shell,/markQaShellStage\('route-microtask-tail',decision\.area\)/u);
  assert.match(shell,/reconcileRouteRender\(decision\.area\)/u);
  assert.match(shell,/focusMain\(\)/u);
});
