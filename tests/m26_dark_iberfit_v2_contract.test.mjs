import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const html=read('public/m26/index.html');
const tokens=JSON.parse(read('src/m26/design/tokens.json'));
const css=read('src/m26/design/dark-iberfit-v2.css');
const docs=read('docs/DARK_IBERFIT_V2.md');

test('Dark IBERFIT V2 is the final authenticated visual layer',()=>{
  const brand=html.indexOf('/src/m26/design/brand-vision.css');
  const dark=html.indexOf('/src/m26/design/dark-iberfit-v2.css');
  assert.ok(brand>=0);
  assert.ok(dark>brand);
  assert.match(html,/data-iberfit-dark-v2-style="true"/u);
});

test('canonical palette uses deep forest warm ivory and restrained gold',()=>{
  assert.equal(tokens.version,'58.2.0');
  assert.equal(tokens.meta.visualDelta,'dark-premium-v2');
  assert.equal(tokens.color.primitive.forest950,'#09130f');
  assert.equal(tokens.color.primitive.forest900,'#121f1b');
  assert.equal(tokens.color.primitive.cream100,'#f4f4f0');
  assert.equal(tokens.color.primitive.gold500,'#b99856');
  assert.equal(tokens.color.semantic.surfaceRaised,'rgba(20,35,30,0.92)');
  assert.equal(tokens.color.semantic.border,'rgba(216,192,138,0.16)');
});

test('authenticated workspace cannot fall back to the historical cream canvas',()=>{
  assert.match(css,/\.m26-shell \.m26-workspace\{[\s\S]*?linear-gradient\(155deg,#0b1712/u);
  assert.match(css,/--iberfit-vision-paper:#121f1b/u);
  assert.match(css,/--iberfit-vision-ink:#f4f4f0/u);
  assert.doesNotMatch(css,/background\s*:\s*#fffdf8/iu);
  assert.doesNotMatch(css,/background\s*:\s*#f3eee3/iu);
});

test('gold remains an accent while primary action is deep green',()=>{
  assert.match(css,/\.m26-shell \.m26-workspace \.m26-primary-action\{[\s\S]*?linear-gradient\(180deg,#285943,#1d4735\)/u);
  assert.match(css,/\.m26-workspace-action-icon\{[\s\S]*?color:var\(--iberfit-color-accent-strong\)/u);
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
