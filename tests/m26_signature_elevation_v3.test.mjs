import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(
  new URL('../src/m26/design/signature-ux-v2.css',import.meta.url),
  'utf8',
);
const v3=css.slice(css.indexOf('IBERFIT · Signature Elevation V3'));

test('Signature Elevation V3 is additive and role-aware',()=>{
  assert.match(v3,/Signature Elevation V3/u);
  assert.match(v3,/data-m26-role="client"/u);
  assert.match(v3,/data-m26-role="coach"/u);
  assert.match(v3,/data-m26-role="admin"/u);
  assert.match(v3,/--iberfit-signature-highlight/u);
});

test('premium hierarchy covers panels metrics controls tables and mobile navigation',()=>{
  assert.match(v3,/m26-route-intro::after/u);
  assert.match(v3,/m26-panel-heading/u);
  assert.match(v3,/iberfit-metric-value/u);
  assert.match(v3,/m26-primary-action/u);
  assert.match(v3,/m26-admin-table/u);
  assert.match(v3,/m26-echart/u);
  assert.match(v3,/m26-mobile-nav/u);
});

test('pointer elevation never becomes a required touch behavior',()=>{
  assert.match(v3,/@media \(hover:hover\) and \(pointer:fine\)/u);
  assert.match(v3,/@media \(max-width:900px\)/u);
  assert.doesNotMatch(
    v3.split('@media (hover:hover) and (pointer:fine)')[0],
    /\.m26-client-card:hover\s*\{[^}]*transform:/u,
  );
});

test('accessibility fallbacks remain first-class',()=>{
  assert.match(v3,/@media \(prefers-reduced-motion:reduce\)/u);
  assert.match(v3,/transform:none !important/u);
  assert.match(v3,/@media \(forced-colors:active\)/u);
  assert.match(v3,/CanvasText/u);
});

test('visual elevation remains presentation-only',()=>{
  assert.doesNotMatch(
    v3,
    /\b(?:fetch|routeTo|navigate)\s*\(|\b(?:localStorage|sessionStorage)\s*\./u,
  );
});
