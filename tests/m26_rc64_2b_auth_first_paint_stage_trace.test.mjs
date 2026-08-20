import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC64.2B first-paint trace is bounded static QA metadata and not persisted evidence',()=>{
  const app=read('src/m26/app/application.js');
  const state=read('src/m26/production-state.js');
  const route=read('src/m26/modules/route-view-model.js');
  const smoke=read('qa/rc64/authenticated-smoke.spec.mjs');

  for(const marker of [
    'rc64-login-token-ready',
    'rc64-setup-start',
    'rc64-hydrate-start',
    'rc64-hydrate-primary-ready',
    'rc64-hydrate-secondary-ready',
    'rc64-hydrate-store-start',
    'rc64-hydrate-store-ready',
    'rc64-catalog-start',
    'rc64-catalog-ready',
    'rc64-setup-repositories-ready',
    'rc64-setup-services-ready',
    'rc64-setup-controllers-ready',
    'rc64-shell-mount-start',
    'rc64-shell-mount-ready',
    'rc64-controller-mounts-ready',
    'rc64-final-render-ready',
    'rc64-setup-ready',
    'rc64-route-vm-start',
    'rc64-route-vm-ready',
    'rc64-route-html-ready',
  ]){
    assert.ok(app.includes(marker),`missing application stage ${marker}`);
  }

  const finalRenderIndex=app.indexOf("qaStage('rc64-final-render-ready')");
  const setupReadyIndex=app.indexOf("qaStage('rc64-setup-ready')");
  const postLoginReconciliationIndex=app.indexOf(
    "qaStage('rc64-post-login-local-reconciliation-start')"
  );
  assert.ok(finalRenderIndex>=0,'missing final-render first-paint boundary');
  assert.ok(setupReadyIndex>finalRenderIndex,'setup-ready must follow final render');
  assert.ok(
    postLoginReconciliationIndex>setupReadyIndex,
    'local reconciliation must remain outside the login critical path',
  );
  assert.doesNotMatch(
    app,
    /rc64-verification-ready|rc64-recovery-ready/u,
    'legacy blocking-local stages must not return to authenticated first paint',
  );

  for(const marker of [
    'rc64-state-start',
    'rc64-state-assert-ready',
    'rc64-state-collections-ready',
    'rc64-state-identity-ready',
    'rc64-state-role-projection-ready',
    'rc64-state-ready',
  ]){
    assert.ok(state.includes(marker),`missing state stage ${marker}`);
  }

  for(const marker of [
    'rc64-hoy-start',
    'rc64-hoy-overview-ready',
    'rc64-hoy-clients-start',
    'rc64-hoy-clients-ready',
    'rc64-hoy-cockpit-start',
    'rc64-hoy-cockpit-ready',
    'rc64-hoy-ready',
  ]){
    assert.ok(route.includes(marker),`missing route stage ${marker}`);
  }

  assert.match(smoke,/exposeBinding\('__rc64RecordStage'/u);
  assert.match(smoke,/\^rc64-\[a-z0-9-\]\{1,64\}\$/u);
  assert.match(smoke,/qaStages\.length>=96/u);
  assert.match(smoke,/Math\.min\(Date\.now\(\)-qaStageEpoch,60_000\)/u);
  assert.match(smoke,/stages=\$\{stageSummary\}/u);

  // Trace carries only a static stage string and elapsed milliseconds.
  const bindingStart=smoke.indexOf("exposeBinding('__rc64RecordStage'");
  const initStart=smoke.indexOf("await context.addInitScript",bindingStart);
  const bindingBlock=smoke.slice(bindingStart,initStart);
  assert.doesNotMatch(bindingBlock,/email|password|token|authorization|apikey|clientId|userId|payload|body/iu);

  const evidenceStart=smoke.indexOf('const evidence=Object.freeze({');
  assert.ok(evidenceStart>=0);
  const evidenceBlock=smoke.slice(evidenceStart);
  assert.doesNotMatch(evidenceBlock,/qaStages|qaStageEpoch|stageSummary|__rc64RecordStage|__IBERFIT_M26_QA_STAGE__/u);

  // No stage call may contain dynamic interpolation or identity material.
  // Ignore only the helper declaration `function qaStage(stage)`.
  for(const source of [app,state,route]){
    const expressions=[...source.matchAll(/qaStage\(([^)]+)\)/gu)]
      .map((match)=>match[1].trim());
    const calls=expressions.filter((expression)=>expression!=='stage');
    assert.ok(calls.length>0);
    assert.equal(
      expressions.filter((expression)=>expression==='stage').length,
      1,
      'qaStage helper declaration must exist exactly once per instrumented source',
    );
    for(const expression of calls){
      assert.match(expression,/^'rc64-[a-z0-9-]+'$/u);
    }
  }
});
