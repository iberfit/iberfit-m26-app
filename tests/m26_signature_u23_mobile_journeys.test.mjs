import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const inventory=JSON.parse(read('qa/visual/signature-360-coverage.json'));

test('U23 traceability: baseline U22 is delivered but 43 screen acceptances remain pending',()=>{
  assert.equal(inventory.productionBaseline.sourceSha,'86a60536595ba8a1cb773c1453b0c6a9988c1ef1');
  assert.equal(inventory.productionBaseline.workflowRunId,39421889744);
  assert.equal(inventory.status,'WIP_NOT_PRODUCTION');
  assert.equal(inventory.roles.client.length,9);
  assert.equal(inventory.roles.coach.length,17);
  assert.equal(inventory.roles.admin.length,17);
  for(const entry of Object.values(inventory.roles).flat()){
    assert.equal(entry.evidenceStatus,'pending',entry.area);
  }
});

test('U23 interactive browser matrix is attached to the real device gate',()=>{
  const config=read('playwright.device-experience.config.mjs');
  const spec=read('qa/device-experience/signature-u23-interactive-routes.spec.mjs');
  assert.ok(config.includes("'signature-u23-interactive-routes.spec.mjs'"));
  for(const role of ['client','coach','admin'])assert.ok(spec.includes("'"+role+"'"),role);
  for(const width of [320,390,768,1024,1440])assert.ok(spec.includes(String(width)),String(width));
  assert.match(spec,/\.click\(\)/u);
  assert.match(spec,/toBeFocused/u);
  assert.match(spec,/toHaveAttribute\('inert'/u);
  assert.match(spec,/page\.keyboard\.press\('Escape'\)/u);
  assert.match(spec,/synthetic identity/u);
  assert.doesNotMatch(spec,/authenticated acceptance certified/u);
});

test('U23 compact dock does not rely on horizontal scrolling or clipping the Más overlay',()=>{
  const styles=read('src/m26/design/iberfit-premium-v3.css');
  const block=styles.slice(styles.lastIndexOf('SIGNATURE U23 · compact navigation'));
  assert.match(block,/max-width:420px/u);
  assert.match(block,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/u);
  assert.match(block,/overflow-x:visible/u);
  assert.doesNotMatch(block,/overflow-x:(?:auto|hidden|clip)/u);
});
