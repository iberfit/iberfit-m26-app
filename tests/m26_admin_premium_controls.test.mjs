import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../src/m26/admin/route-render.js',import.meta.url),'utf8');

test('Admin abandona el control gris genérico y usa jerarquía premium IBERFIT',()=>{
  assert.match(css,/ADMIN_PREMIUM_CONTROL_HIERARCHY_BEGIN/u);
  assert.match(css,/border-radius:var\(--m26-admin-pill\)/u);
  assert.match(css,/color-mix\(in srgb,var\(--m26-admin-surface-interactive\) 84%,var\(--m26-admin-accent\) 16%\)/u);
  assert.match(css,/\.m26-admin-form > button\[type="submit"\]/u);
  assert.match(css,/var\(--m26-admin-accent\) 48%/u);
});

test('Las decisiones prioritarias tienen CTA de marca y estados táctiles claros',()=>{
  assert.match(css,/\.m26-admin-priority > button/u);
  assert.match(css,/\.m26-primary-action/u);
  assert.match(css,/color:#102418/u);
  assert.match(css,/transform:translateY\(-1px\)/u);
  assert.match(css,/button:active/u);
  assert.match(css,/button:disabled/u);
  assert.match(css,/button\[aria-disabled="true"\]/u);
});

test('La mejora visual no neutraliza la zona destructiva',()=>{
  assert.match(renderer,/m26-admin-danger-body button\[type=submit\]\{background:#9f2d2d!important;border-color:#9f2d2d!important;color:#fff!important\}/u);
  assert.match(css,/\.m26-admin-danger-body button\[type="submit"\]/u);
  assert.doesNotMatch(css,/\.m26-admin-danger-body button\[type="submit"\][^{]*\{[^}]*background:\s*linear-gradient/usu);
});
