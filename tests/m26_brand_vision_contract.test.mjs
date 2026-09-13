import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('public/m26/index.html','utf8');
const vision=fs.readFileSync('src/m26/design/brand-vision.css','utf8');
const workflow=fs.readFileSync('.github/workflows/daily-use-visual-evidence.yml','utf8');
const bootstrap=fs.readFileSync('public/m26/app.js','utf8');

test('production loads signature and brand vision after historical design layers',()=>{
  const premium=html.indexOf('/src/m26/design/premium-ux.css');
  const signature=html.indexOf('/src/m26/design/signature-ux-v2.css');
  const auth=html.indexOf('/src/m26/design/auth-native.css');
  const brand=html.indexOf('/src/m26/design/brand-vision.css');
  assert.ok(premium>=0&&signature>premium);
  assert.ok(auth>signature);
  assert.ok(brand>auth);
  assert.doesNotMatch(html,/data-href="\/src\/m26\/design\/adaptive-layout\.css"/u);
  assert.match(html,/signature-ux-v2\.css[^>]+data-iberfit-signature-v2-style="true"/u);
  assert.match(bootstrap,/const anchor=signature\|\|brand;/u);
  assert.match(bootstrap,/anchor\.parentNode\.insertBefore\(link,anchor\)/u);
});

test('brand vision keeps navigation dark and workspace light without changing behavior',()=>{
  assert.match(vision,/\.m26-shell \.m26-sidebar\{/u);
  assert.match(vision,/linear-gradient\(180deg,#0e3022/u);
  assert.match(vision,/\.m26-shell\[data-m26-role\] > \.m26-workspace\{/u);
  assert.match(vision,/--iberfit-vision-cream:#f3eee3/u);
  assert.match(vision,/--iberfit-color-text-primary:var\(--iberfit-vision-ink\)/u);
  assert.match(vision,/color-scheme:light/u);
  assert.match(vision,/\.m26-shell \.m26-workspace \.m26-mobile-nav\{/u);
  assert.match(vision,/color-scheme:dark/u);
});

test('touch controls remain comfortable in the new visual layer',()=>{
  assert.match(vision,/min-height:max\(48px,var\(--iberfit-role-control-min,44px\)\)/u);
  assert.match(vision,/@media \(max-width:719px\)[\s\S]*?font-size:16px/u);
});

test('visual evidence runs when design shell or production entry changes',()=>{
  for(const expected of [
    "src/m26/design/**",
    "src/m26/shell/**",
    "src/m26/rc39/**",
    "public/m26/index.html",
  ])assert.ok(workflow.includes(expected),expected);
});


test('Client Hierarchy V3 makes daily decision dominant without hiding onboarding or actions',()=>{
  const start=vision.indexOf('/* CLIENT HIERARCHY V3');
  assert.ok(start>=0,'Client Hierarchy V3 section missing');
  const hierarchy=vision.slice(start);

  assert.match(hierarchy,/\.m26-progressive-onboarding\{/u);
  assert.match(hierarchy,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u);
  assert.match(hierarchy,/\.m26-progressive-onboarding \.m26-primary-action/u);
  assert.match(hierarchy,/background:rgba\(29,96,67,\.045\)/u);

  assert.match(hierarchy,/\.m26-hoy-route \.m26-today-loop\{/u);
  assert.match(hierarchy,/linear-gradient\(180deg,#c69d50,#1d6043\)/u);
  assert.match(hierarchy,/\.m26-today-action\.is-primary\{/u);
  assert.match(hierarchy,/min-height:7\.4rem/u);

  assert.match(hierarchy,/button:disabled/u);
  assert.match(hierarchy,/opacity:\.7/u);
  assert.match(hierarchy,/@media\(max-width:719px\)/u);
  assert.doesNotMatch(hierarchy,/display\s*:\s*none|visibility\s*:\s*hidden/iu);
});
