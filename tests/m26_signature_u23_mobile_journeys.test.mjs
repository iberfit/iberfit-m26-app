import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const inventory=JSON.parse(read('qa/visual/signature-360-coverage.json'));

test('U23 traceability: exact U23 PROD is delivered but 43 screen acceptances remain pending',()=>{
  assert.equal(inventory.productionBaseline.sourceSha,'4c58d70e5f7a984e8bd2663633f7cf9abd68b4e6');
  assert.equal(inventory.productionBaseline.workflowRunId,39479637032);
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

test('U23 Client physical dock uses the actual production renderer and Escape recovery',()=>{
  const module=read('src/m26/modules/route-render.js');
  const fixture=read('qa/visual/signature-route-shell.fixture.mjs');
  const controller=read('src/m26/shell/shell-controller.js');
  assert.ok(module.includes('export function renderClientBottomNav(vm){'));
  assert.ok(fixture.includes('renderClientBottomNav({kind:vm.activeArea})'));
  assert.ok(controller.includes('details.m26-client-bottom-nav-more[open]'));
  assert.ok(controller.includes("clientMoreSummary.setAttribute?.('aria-expanded'"));
  assert.ok(controller.includes("if(disclosure.matches?.('details.m26-mobile-more'))"));
});

test('U23 tablet Client dock remains inside the workspace without double rail offset',()=>{
  const css=read('src/m26/ui/client-bottom-nav.css');
  const tablet=css.slice(css.lastIndexOf('SIGNATURE U23 · medium touch in-flow dock'));
  assert.ok(tablet.includes('@media (max-width:900px)'));
  assert.ok(tablet.includes('left:auto;'));
  assert.ok(tablet.includes('right:auto;'));
  assert.ok(tablet.includes('max-width:100%;'));
  assert.ok(css.includes('left:5rem;'),'retain fixed-dock rail clearance at 901px+');
});

test('U23 compact dock does not rely on horizontal scrolling or clipping the Más overlay',()=>{
  const styles=read('src/m26/design/iberfit-premium-v3.css');
  const begin=styles.lastIndexOf('SIGNATURE U23 · compact navigation');
  const end=styles.indexOf('/* SIGNATURE B2:',begin);
  assert.ok(begin>=0&&end>begin,'U23 navigation scope must remain explicitly bounded');
  const block=styles.slice(begin,end);
  assert.match(block,/max-width:420px/u);
  assert.match(block,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/u);
  assert.match(block,/overflow-x:visible/u);
  assert.doesNotMatch(block,/overflow-x:(?:auto|hidden|clip)/u);
});
