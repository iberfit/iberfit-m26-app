import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const indexHtml = read('public/m26/index.html');
const serviceWorker = read('public/m26/sw.js');
const css = read('src/m26/rc42/rc42.css');
const manifest = JSON.parse(
  read('public/m26/manifest.webmanifest'),
);
const packageJson = JSON.parse(
  read('package.json'),
);

test('RC42 conserva contrato PWA y viewport seguro', () => {
  assert.equal(manifest.id, '/m26/');
  assert.equal(manifest.scope, '/m26/');
  assert.equal(manifest.display, 'standalone');
  assert.match(indexHtml, /viewport-fit=cover/u);
});

test('RC42 carga estilos despues de modulos funcionales', () => {
  const adminIndex = indexHtml.indexOf(
    '/src/m26/admin/admin.css',
  );
  const rc42Index = indexHtml.indexOf(
    '/src/m26/rc42/rc42.css',
  );

  assert.ok(adminIndex >= 0);
  assert.ok(rc42Index > adminIndex);
});

test('RC42 precachea la capa responsive', () => {
  const responsivePath = '/src/m26/rc42/rc42.css';

  assert.ok(
    serviceWorker.includes(`'${responsivePath}'`) ||
      serviceWorker.includes(`"${responsivePath}"`),
    'La capa responsive RC42 debe formar parte del APP_SHELL',
  );
});

test('RC42 cubre safe areas, standalone y tactil', () => {
  assert.match(css, /safe-area-inset-top/u);
  assert.match(css, /safe-area-inset-bottom/u);
  assert.match(
    css,
    /@media \(display-mode: standalone\)/u,
  );
  assert.match(
    css,
    /@media \(pointer: coarse\)/u,
  );
});

test('RC42 fija navegacion movil sin tapar contenido', () => {
  assert.match(
    css,
    /\.m26-mobile-nav\s*\{[\s\S]*?position:\s*fixed;/u,
  );
  assert.match(
    css,
    /\.m26-workspace\s*\{[\s\S]*?padding-bottom:/u,
  );
  assert.match(
    css,
    /--m26-mobile-nav-height/u,
  );
});

test('RC42 cubre tablet, movil, landscape e impresion', () => {
  assert.match(
    css,
    /min-width: 901px\) and \(max-width: 1180px/u,
  );
  assert.match(css, /max-width: 900px/u);
  assert.match(css, /orientation: landscape/u);
  assert.match(css, /@media print/u);
});

test('RC42 registra test y build reproducible', () => {
  assert.equal(
    packageJson.scripts['test:m26:rc42'],
    'node --test tests/m26_rc42_native_responsive.test.mjs',
  );

  const build =
    packageJson.scripts['build:rc42:canary'];

  assert.ok(
    build.includes(
      'patch_rc42_canary_runtime_source.mjs',
    ),
  );
  assert.ok(
    build.includes(
      'generate_rc42_runtime_config.mjs',
    ),
  );
  assert.ok(
    build.includes(
      'verify_rc42_canary_candidate.mjs',
    ),
  );
});
