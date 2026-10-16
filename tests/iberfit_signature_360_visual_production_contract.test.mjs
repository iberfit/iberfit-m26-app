import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {navigationForRole} from '../src/m26/shell/navigation.js';

const coverage=JSON.parse(fs.readFileSync(new URL('../qa/visual/signature-360-coverage.json',import.meta.url),'utf8'));
const roles=['client','coach','admin'];

test('Signature 360 inventories exactly every navigable surface for each role',()=>{
  for(const role of roles){
    const nav=navigationForRole(role);
    const actual=[...new Set([...nav.primary,...nav.context,...nav.tools].map(({key})=>key))].sort();
    const entries=coverage.roles[role];
    assert.ok(Array.isArray(entries)&&entries.length>0,role);
    const expected=entries.map(({area})=>area).sort();
    assert.deepEqual(expected,actual,`${role}: update Signature360 coverage when navigation changes`);
    assert.equal(new Set(expected).size,expected.length,`${role}: no duplicate areas`);
    for(const entry of entries){
      assert.match(entry.acceptance,/[^\s]{3,}/,`${role}:${entry.area} missing acceptance`);
      assert.ok(['P0','P1','P2'].includes(entry.priority),`${role}:${entry.area} invalid priority`);
      assert.ok(['pending','verified'].includes(entry.evidenceStatus),`${role}:${entry.area} invalid evidence`);
      if(entry.evidenceStatus==='verified')assert.match(entry.proofUrl||'',/^https:\/\//,`${role}:${entry.area} requires public proof link`);
    }
  }
});

test('Signature360 always requires production evidence and broad responsive/states',()=>{
  assert.equal(coverage.target,'https://app.iberfit.cl');
  assert.equal(coverage.status,'WIP_NOT_PRODUCTION');
  for(const width of [320,390,768,1024,1440]) assert.ok(coverage.viewports.includes(width));
  for(const state of ['loading','empty','populated','error','retry','offline','conflict','session-expired'])
    assert.ok(coverage.screenStates.includes(state),state);
  for(const checkpoint of ['canary-exact-sha','production-promotion-workflow','production-exact-sha','postprod-smoke','rollback-ready'])
    assert.ok(coverage.releaseEvidence.includes(checkpoint),checkpoint);
  for(const topic of ['keyboard-and-focus','mobile-more','touch-and-safe-area','pwa-background-reconnect','no-data-loss','reduced-motion','visual-contrast-wcag-aa'])
    assert.ok(coverage.crossCutting.includes(topic),topic);
});

test('Signature360 form focus remains visually stable across Cliente/Coach/Admin',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
  const formStart=css.indexOf('   FORM CONTROLS');
  const formEnd=css.indexOf('   NOTICES / STATES',formStart);
  assert.ok(formStart>0&&formEnd>formStart,'form controls section must exist');
  const form=css.slice(formStart,formEnd);
  assert.ok(!/transform:\s*translateY\(/.test(form),'focus must not physically move form fields');
  assert.match(form,/outline-offset|box-shadow\s*:/,'focus must retain visible focus indication');
});
