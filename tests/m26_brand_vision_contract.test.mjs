import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('public/m26/index.html','utf8');
const vision=fs.readFileSync('src/m26/design/brand-vision.css','utf8');
const workflow=fs.readFileSync('.github/workflows/daily-use-visual-evidence.yml','utf8');

test('production loads signature and brand vision after historical design layers',()=>{
  const premium=html.indexOf('/src/m26/design/premium-ux.css');
  const adaptive=html.indexOf('/src/m26/design/adaptive-layout.css');
  const signature=html.indexOf('/src/m26/design/signature-ux-v2.css');
  const auth=html.indexOf('/src/m26/design/auth-native.css');
  const brand=html.indexOf('/src/m26/design/brand-vision.css');
  assert.ok(premium>=0&&adaptive>premium);
  assert.ok(signature>adaptive);
  assert.ok(auth>signature);
  assert.ok(brand>auth);
  assert.match(html,/adaptive-layout\.css[^>]+data-iberfit-adaptive-style="true"/u);
  assert.match(html,/signature-ux-v2\.css[^>]+data-iberfit-signature-v2-style="true"/u);
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
