import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const html=read('public/m26/index.html');
const tokens=JSON.parse(read('src/m26/design/tokens.json'));
const css=read('src/m26/design/dark-iberfit-v2.css');
const v3=read('src/m26/design/iberfit-premium-v3.css');
const docs=read('docs/DARK_IBERFIT_V2.md');

test('Dark IBERFIT V2 remains the base and Premium Digital V3 is the final authenticated visual layer',()=>{
  const brand=html.indexOf('/src/m26/design/brand-vision.css');
  const dark=html.indexOf('/src/m26/design/dark-iberfit-v2.css');
  const premium=html.indexOf('/src/m26/design/iberfit-premium-v3.css');
  assert.ok(brand>=0);
  assert.ok(dark>brand);
  assert.ok(premium>dark);
  assert.match(html,/data-iberfit-dark-v2-style="true"/u);
  assert.match(html,/data-iberfit-premium-v3-style="true"/u);
});

test('canonical palette advances to Premium Digital V3',()=>{
  assert.equal(tokens.version,'58.3.0');
  assert.equal(tokens.meta.visualDelta,'premium-digital-v3');
  assert.equal(tokens.color.primitive.forest950,'#0B1310');
  assert.equal(tokens.color.primitive.forest900,'#13221C');
  assert.equal(tokens.color.primitive.forest800,'#1A2E26');
  assert.equal(tokens.color.primitive.cream100,'#F5F5F0');
  assert.equal(tokens.color.primitive.muted,'#9AA8A1');
  assert.equal(tokens.color.primitive.gold500,'#C5A059');
  assert.equal(tokens.color.semantic.surfaceRaised,'rgba(26,46,38,0.94)');
  assert.equal(tokens.color.semantic.border,'rgba(197,160,89,0.15)');
});

test('authenticated workspace cannot fall back to the historical cream canvas',()=>{
  assert.match(css,/\.m26-shell \.m26-workspace\{[\s\S]*?linear-gradient\(155deg,#0b1712/u);
  assert.match(css,/--iberfit-vision-paper:#121f1b/u);
  assert.match(css,/--iberfit-vision-ink:#f4f4f0/u);
  assert.doesNotMatch(css,/background\s*:\s*#fffdf8/iu);
  assert.doesNotMatch(css,/background\s*:\s*#f3eee3/iu);
});

test('gold is reserved for priority and primary action while status colors remain semantic',()=>{
  assert.match(v3,/\.m26-shell \.m26-workspace :is\(\.m26-primary-action,[\s\S]*?linear-gradient\(180deg,#D1AE65,#B98F44\)/u);
  assert.match(v3,/--iberfit-v3-success:#10B981/u);
  assert.match(v3,/--iberfit-v3-danger:#EF4444/u);
  assert.match(v3,/\.m26-workspace-action-icon|--iberfit-v3-gold:#C5A059/u);
});

test('role and device intent is documented explicitly',()=>{
  for(const phrase of [
    'Cliente más respirado',
    'Coach operativo',
    'Admin compacto',
    'desktop construye/analiza',
    'tablet entrena/opera',
    'móvil actúa',
  ])assert.ok(docs.includes(phrase),phrase);
});
