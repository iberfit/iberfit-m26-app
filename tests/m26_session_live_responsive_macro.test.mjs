import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const premium=()=>fs.readFileSync('src/m26/design/premium-ux.css','utf8');
const adaptive=()=>fs.readFileSync('src/m26/design/adaptive-layout.css','utf8');

test('CTA completar serie reserva la barra inferior solo cuando existe navegación móvil compacta',()=>{
  const css=premium();
  assert.match(
    css,
    /\.m26-session-live \.m26-session-live-entry \[data-session-action="complete-set"\] \{ position: sticky; bottom: calc\(env\(safe-area-inset-bottom\) \+ \.6rem\);/u,
  );
  assert.match(
    css,
    /\[data-m26-layout="compact-touch"\] \.m26-session-live \.m26-session-live-entry \[data-session-action="complete-set"\] \{ bottom: calc\(var\(--iberfit-ux-mobile-nav\) \+ env\(safe-area-inset-bottom\) \+ \.6rem\); \}/u,
  );
});

test('tablet touch mantiene la navegación móvil oculta y no necesita reservar su altura',()=>{
  const css=adaptive();
  assert.match(css,/\[data-m26-layout="medium-touch"\][\s\S]{0,220}\.m26-mobile-nav \{\s*display: none !important;/u);
  assert.match(css,/\[data-m26-layout="expanded-touch"\][\s\S]{0,220}\.m26-mobile-nav \{\s*display: none !important;/u);
});