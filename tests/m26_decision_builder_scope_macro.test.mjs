import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('sin próxima sesión el CTA abre el constructor canónico del cliente exacto',()=>{
  const engagement=fs.readFileSync('src/m26/engagement/engagement-controller.js','utf8');
  const workflow=fs.readFileSync('src/m26/app/workflow-controller.js','utf8');
  assert.match(engagement,/data-workflow-action','open-session-builder'/u);
  assert.match(engagement,/data-client-id',clientId/u);
  assert.match(engagement,/Preparar próxima sesión/u);
  assert.match(workflow,/function openBuilder\(button\)/u);
  assert.match(workflow,/button\?\.dataset\?\.clientId\|\|activeClientId/u);
  assert.match(workflow,/const clientId=requireVisibleClient\(requested\)/u);
  assert.match(workflow,/action==='open-session-builder'\)openBuilder\(button\)/u);
});

test('constructor preciso no publica, inicia ni reutiliza automáticamente',()=>{
  const workflow=fs.readFileSync('src/m26/app/workflow-controller.js','utf8');
  const start=workflow.indexOf('function openBuilder(button)');
  const end=workflow.indexOf('function startSession',start);
  const block=workflow.slice(start,end);
  assert.match(block,/m26:open-session-builder/u);
  assert.doesNotMatch(block,/reuseSession|startSession|managePublication|sourceSession/u);
});

test('handoff mantiene foco visible, touch e i18n',()=>{
  const css=fs.readFileSync('src/m26/design/premium-ux.css','utf8');
  const i18n=fs.readFileSync('src/m26/ui/i18n-surface.js','utf8');
  assert.match(css,/\.m26-next-session-prep:focus\{[\s\S]*?outline:2px solid/u);
  assert.match(css,/\.m26-action-outcome-continuity button\{[^}]*min-height:44px/u);
  assert.match(i18n,/\['Preparar próxima sesión','Prepare next session'/u);
  assert.match(i18n,/\['Siguiente paso: prepara la próxima sesión con el criterio que acabas de registrar\.'/u);
});
