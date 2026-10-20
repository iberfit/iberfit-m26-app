import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const coverage=JSON.parse(read('qa/visual/signature-360-coverage.json'));
const visual=read('qa/rc64/authenticated-visual-evidence.spec.mjs');
const audit=read('qa/rc64/signature-u24-client-route-audit.mjs');

test('U24 uses the existing authenticated QA pipeline with real route bodies and read-only network',()=>{
  const config=read('playwright.authenticated-visual.config.mjs');
  assert.match(config,/authenticated-visual-evidence\.spec\.mjs/u);
  assert.match(visual,/installCurrentSourceQaNetworkPolicy/u);
  assert.match(visual,/certifyClientSignatureRoute/u);
  assert.match(visual,/signatureU24:/u);
  assert.match(visual,/fullFunctionalAcceptance:false/u);
  for(const width of [320,390,1024,1366,1440]){
    assert.ok(config.includes('width:'+width),String(width));
  }
});

test('U24 nine Client route audit contracts are explicit and per-role, without claiming full acceptance',()=>{
  for(const area of ['hoy','planificacion','sesion','progreso','informes','actividad','mensajes','retos','ajustes']){
    assert.ok(audit.includes("'"+area+"'"),area);
    assert.ok(visual.includes("certifyClientSignatureRoute(page,'"+area+"')")||
      visual.includes('certifyClientSignatureRoute(page,area)'),area);
  }
  for(const token of [
    'data-client-bottom-nav-route','data-m26-interactive','communication-unavailable',
    'data-m45-communication-retry','data-iri-diagnosis','data-client-progress-stage',
    'data-client-session-state','data-m26-ui-language','data-m26-ui-locale',
    'data-engagement-form','m26-challenges-route','horizontalOverflow',
    'issue-client-iri-report','fullFunctionalAcceptance:false',
  ])assert.ok(audit.includes(token),token);
  assert.doesNotMatch(audit,/\.click\(|\.fill\(|\.submit\(/u);
});

test('U24 never upgrades 43 routes or unsupported error/offline/write states by inference',()=>{
  assert.equal(coverage.productionBaseline.sourceSha,'4c58d70e5f7a984e8bd2663633f7cf9abd68b4e6');
  assert.equal(coverage.productionBaseline.workflowRunId,39479637032);
  assert.equal(coverage.status,'WIP_NOT_PRODUCTION');
  assert.equal(coverage.activeDelivery,'SIGNATURE-U26-authenticated-professional-route-smoke-WIP');
  assert.equal(coverage.roles.client.length,9);
  assert.equal(coverage.roles.coach.length,17);
  assert.equal(coverage.roles.admin.length,17);
  assert.equal(coverage.qaEvidence.clientRouteReadOnlySmoke.routeCount,9);
  for(const value of ['offline','session-expired','multi-device-conflict','write-success','write-error']){
    assert.ok(coverage.qaEvidence.clientRouteReadOnlySmoke.notVerifiedStates.includes(value),value);
    assert.ok(visual.includes("'"+value+"'"),value);
  }
  for(const entry of Object.values(coverage.roles).flat()){
    assert.equal(entry.evidenceStatus,'pending',entry.area);
    assert.equal(entry.proofUrl,undefined);
  }
});
