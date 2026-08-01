import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../src/m26/modules/route-render.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/m26/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/m26/ui/client-bottom-nav.css', import.meta.url), 'utf8');

test('App Cliente recibe una barra inferior premium y los roles internos no', () => {
  assert.match(route, /M26_CLIENT_BOTTOM_NAV_V2/);
  assert.match(route, /return vm\.role==='client'\?renderClientRouteShell\(vm,content\):content;/);
  assert.match(route, /aria-label="Navegación principal de la aplicación cliente"/);
  assert.match(route, /data-m26-area="expediente"/);
  assert.match(route, /data-m26-area="actividad"/);
  assert.match(route, /data-m26-area="biblioteca"/);
  assert.match(route, /data-m26-area="verificacion"/);
});

test('La navegación conserva las cinco entradas y el contexto activo correcto', () => {
  for (const label of ['Hoy', 'Planificación', 'Sesiones', 'Progreso', 'Más']) {
    assert.match(route, new RegExp(`>${label}<|label:'${label}'`));
  }
  assert.match(route, /activeKinds:\['planificacion','agenda'\]/);
  assert.match(route, /activeKinds:\['progreso','iri','informes'\]/);
  assert.match(route, /aria-current="page"/);
});

test('El CSS se carga una sola vez como recurso estático y no se incrusta en el renderer', () => {
  const links = index.match(/\/src\/m26\/ui\/client-bottom-nav\.css/g) || [];
  assert.equal(links.length, 1);
  assert.doesNotMatch(route, /function clientBottomNavStyles\(/);
  assert.doesNotMatch(route, /data-m26-client-bottom-nav-style/);
  assert.match(css, /\.m26-client-bottom-nav-layer/);
  assert.match(css, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
});

test('La barra respeta móvil, accesibilidad, safe-area, impresión y movimiento reducido', () => {
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height:\s*66px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width:\s*690px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media print/);
  assert.match(css, /\.m26-client-bottom-nav-layer\s*\{\s*display:\s*none\s*!important;/s);
});
