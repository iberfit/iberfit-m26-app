import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderRouteView } from '../src/m26/modules/route-render.js';
import { areaAllowedForRole } from '../src/m26/shell/navigation.js';

const route = await readFile(new URL('../src/m26/modules/route-render.js', import.meta.url), 'utf8');
const shell = await readFile(new URL('../src/m26/shell/shell-render.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/m26/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/m26/ui/client-bottom-nav.css', import.meta.url), 'utf8');

test('App Cliente renderiza realmente la barra inferior y los roles internos no la reciben por este wrapper', () => {
  assert.match(route, /M26_CLIENT_BOTTOM_NAV_V2/);
  assert.match(route, /renderClientBottomNav\(vm\)/);
  assert.match(route, /return vm\.role==='client'\?renderClientRouteShell\(vm,content\):content;/);
  const html = renderRouteView({kind:'placeholder', role:'client', title:'Prueba'});
  assert.match(html, /aria-label="Navegación principal de la aplicación cliente"/);
  assert.match(html, /m26-client-bottom-nav-layer/);
});

test('cada destino de la barra Cliente pertenece al contrato de rutas permitido', () => {
  const html = renderRouteView({kind:'placeholder', role:'client', title:'Prueba'});
  const areas = [...html.matchAll(/data-m26-area="([^"]+)"/g)].map((match)=>match[1]);
  assert.ok(areas.length >= 9, 'la barra debe exponer navegación primaria y Más');
  for (const area of areas) {
    assert.equal(areaAllowedForRole(area, 'client'), true, `área Cliente no permitida: ${area}`);
  }
  for (const forbidden of ['expediente','biblioteca','verificacion']) {
    assert.doesNotMatch(html, new RegExp(`data-m26-area="${forbidden}"`));
  }
  for (const expected of ['hoy','planificacion','sesion','progreso','informes','actividad','mensajes','retos','ajustes']) {
    assert.match(html, new RegExp(`data-m26-area="${expected}"`));
  }
});

test('Retos y Ajustes pasan por el mismo shell Cliente antes de retornar', () => {
  assert.match(route, /if \(vm\.kind === 'retos'\) content=renderChallengesRoute\(vm\);/);
  assert.match(route, /else if \(vm\.kind === 'ajustes'\) content=renderSettingsRoute\(vm\);/);
  assert.doesNotMatch(route, /if \(vm\.kind === 'retos'\) return renderChallengesRoute\(vm\);/);
  assert.doesNotMatch(route, /if \(vm\.kind === 'ajustes'\) return renderSettingsRoute\(vm\);/);
});

test('La navegación conserva cinco entradas principales y estados activos coherentes', () => {
  for (const label of ['Hoy', 'Planificación', 'Sesiones', 'Progreso', 'Más']) {
    assert.match(route, new RegExp(`>${label}<|label:'${label}'`));
  }
  assert.match(route, /activeKinds:\['planificacion'\]/);
  assert.match(route, /activeKinds:\['progreso'\]/);
  assert.match(route, /aria-current="page"/);
});

test('estado operativo limpio no comunica una falsa incidencia y no quedan typos visibles conocidos', () => {
  assert.match(shell, /Sin cambios locales pendientes/);
  assert.doesNotMatch(shell, /Todo sincronizado/);
  assert.doesNotMatch(shell, /Estado local pendiente de revisión/);
  assert.doesNotMatch(shell, /Ej\. clietnes/);
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
