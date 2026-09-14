import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('IBERFIT Premium Digital V3 is the final visual layer',()=>{
  const html=fs.readFileSync('public/m26/index.html','utf8');
  const dark=html.indexOf('/src/m26/design/dark-iberfit-v2.css');
  const v3=html.indexOf('/src/m26/design/iberfit-premium-v3.css');

  assert.ok(dark>=0);
  assert.ok(v3>dark);
  assert.match(html,/data-iberfit-premium-v3-style="true"/u);
  assert.match(html,/<meta name="theme-color" content="#0B1310">/u);
});

test('Premium Digital V3 uses the real IBERFIT mark without decorative forest imagery',()=>{
  const css=fs.readFileSync('src/m26/design/iberfit-premium-v3.css','utf8');

  assert.match(css,/--iberfit-v3-canvas:#0B1310/u);
  assert.match(css,/--iberfit-v3-surface:#13221C/u);
  assert.match(css,/--iberfit-v3-surface-raised:#1A2E26/u);
  assert.match(css,/--iberfit-v3-text:#F5F5F0/u);
  assert.match(css,/--iberfit-v3-text-secondary:#9AA8A1/u);
  assert.match(css,/--iberfit-v3-gold:#C5A059/u);
  assert.match(css,/url\('\/public\/isotipo-iberfit\.png'\)/u);
  assert.match(css,/opacity:\.0(?:22|35)/u);
  assert.doesNotMatch(css,/url\([^)]*(?:forest|bosque|leaf|leaves|foliage|plant)/iu);
  assert.doesNotMatch(css,/background:\s*#fff(?:fff|df8|af0)?\b/iu);
});

test('Premium Digital V3 keeps semantic status colors separate from gold',()=>{
  const tokens=JSON.parse(fs.readFileSync('src/m26/design/tokens.json','utf8'));

  assert.equal(tokens.version,'58.3.0');
  assert.equal(tokens.color.semantic.canvas,'{color.primitive.forest950}');
  assert.equal(tokens.color.primitive.forest950,'#0B1310');
  assert.equal(tokens.color.primitive.forest900,'#13221C');
  assert.equal(tokens.color.primitive.forest800,'#1A2E26');
  assert.equal(tokens.color.primitive.gold500,'#C5A059');
  assert.equal(tokens.color.primitive.cream100,'#F5F5F0');
  assert.equal(tokens.color.primitive.muted,'#9AA8A1');
  assert.equal(tokens.color.primitive.success,'#10B981');
  assert.equal(tokens.color.primitive.danger,'#EF4444');
  assert.equal(tokens.radius.sm,8);
  assert.equal(tokens.radius.md,12);
});

test('preauth first paint is dark and continuous with the authenticated product',()=>{
  const css=fs.readFileSync('public/m26/preauth-critical.css','utf8');
  const html=fs.readFileSync('public/m26/index.html','utf8');
  const manifest=JSON.parse(fs.readFileSync('public/m26/manifest.webmanifest','utf8'));

  assert.match(css,/PREAUTH PREMIUM DIGITAL V3/u);
  assert.match(css,/background:url\("\/public\/isotipo-iberfit\.png"\)/u);
  assert.match(css,/color-scheme:dark/u);
  assert.doesNotMatch(css,/color-scheme:light/u);
  assert.doesNotMatch(css,/#fffdf8|#f8f4eb/iu);
  assert.equal(manifest.background_color,'#0B1310');
  assert.equal(manifest.theme_color,'#0B1310');
  assert.match(html,/data-iberfit-preauth-critical/u);
});
