import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Action Outcome transporta la verdad de próxima sesión sin inventarla',()=>{
  const route=fs.readFileSync('src/m26/modules/route-render.js','utf8');
  assert.match(route,/data-action-outcome-next-session-id="\$\{escapeHtml\(prep\?\.session\?\.id\|\|''\)\}"/u);
  assert.match(route,/data-next-session-preparation tabindex="-1"/u);
});

test('handoff con sesión preparada aterriza en preparación exacta y no clona sesión',()=>{
  const engagement=fs.readFileSync('src/m26/engagement/engagement-controller.js','utf8');
  const shell=fs.readFileSync('src/m26/shell/shell-controller.js','utf8');
  assert.match(engagement,/if\(nextSessionId\)\{/u);
  assert.match(engagement,/data-m26-target-area','sesion'/u);
  assert.match(engagement,/data-m26-target-focus','next-session-preparation'/u);
  assert.match(shell,/'next-session-preparation':'\[data-next-session-preparation\]'/u);
  const helper=engagement.slice(
    engagement.indexOf('function ensureCoachDecisionContinuity'),
    engagement.indexOf('function actionOutcomeTargets')
  );
  assert.doesNotMatch(helper,/reuse-session|sourceSession|start-published-session/u);
});

test('cambio de verdad próxima sesión invalida la firma del manager',()=>{
  const engagement=fs.readFileSync('src/m26/engagement/engagement-controller.js','utf8');
  assert.match(engagement,/workspaceNextSessionId=workspaceMode\?String\(mount\.getAttribute\?\.\('data-action-outcome-next-session-id'\)\|\|''\)\.trim\(\):''/u);
  assert.match(engagement,/\$\{workspaceNextSessionId\|\|'no-session'\}/u);
  assert.match(engagement,/manager\.dataset\.nextSessionId=workspaceNextSessionId/u);
});
