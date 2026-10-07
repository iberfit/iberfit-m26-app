import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const controller=()=>fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
const css=()=>fs.readFileSync('src/m26/design/premium-ux.css','utf8');

test('acciones rápidas usan un offset dinámico de la topbar en lugar de una altura hardcodeada',()=>{
  assert.match(css(),/\.m26-session-live-v3\s+\.m26-session-live-quick-actions\{\s*position:sticky;\s*top:var\(--m26-session-sticky-top,\.4rem\);\s*z-index:20;/u);
});

test('el controlador mide, observa y revalida la topbar real',()=>{
  const source=controller();
  assert.match(source,/currentSessionTopbar\(\)/u);
  assert.match(source,/getComputedStyle\(topbar\)/u);
  assert.match(source,/ResizeObserver/u);
  assert.match(source,/sessionStickyResizeObserver\.observe\(topbar\)/u);
  assert.match(source,/addEventListener\('resize',bindSessionStickyTop/u);
  assert.match(source,/async function onShellRendered\(\)\{\s*bindSessionStickyTop\(\);/u);
});

test('landscape o topbar no sticky vuelven al offset mínimo y el destroy limpia observer/listener/variable',()=>{
  const source=controller();
  assert.match(source,/position==='sticky'\|\|position==='fixed'/u);
  assert.match(source,/anchored&&height>0\?String\(height\+6\)\+'px':'.4rem'/u);
  assert.match(source,/sessionStickyResizeObserver\?\.disconnect\?\.\(\)/u);
  assert.match(source,/removeEventListener\?\.\('resize',bindSessionStickyTop\)/u);
  assert.match(source,/removeProperty\?\.\('--m26-session-sticky-top'\)/u);
  assert.match(source,/mounted=false;unmountSessionStickyTop\(\);stopSessionClockTicker\(\);/u);
});