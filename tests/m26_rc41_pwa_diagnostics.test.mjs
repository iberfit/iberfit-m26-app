import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(
  fs.readFileSync('public/m26/manifest.webmanifest', 'utf8'),
);

const indexHtml = fs.readFileSync(
  'public/m26/index.html',
  'utf8',
);

const serviceWorker = fs.readFileSync(
  'public/m26/sw.js',
  'utf8',
);

const application = fs.readFileSync(
  'src/m26/app/application.js',
  'utf8',
);

test('RC41 limita la PWA al directorio M26', () => {
  assert.equal(manifest.scope, '/m26/');
  assert.equal(manifest.id, '/m26/');
  assert.equal(
    String(manifest.start_url).startsWith('/m26/'),
    true,
  );
});

test('RC41 incluye en APP_SHELL todos los estilos de index.html', () => {
  const styles = [
    ...indexHtml.matchAll(
      /href=["']([^"']+\.css)["']/giu,
    ),
  ].map((match) => match[1]);

  assert.ok(styles.length > 0);

  for (const style of styles) {
    assert.equal(
      serviceWorker.includes(`'${style}'`) ||
        serviceWorker.includes(`"${style}"`),
      true,
      `Falta en APP_SHELL: ${style}`,
    );
  }
});

test('RC41 mantiene fuera de caché autenticación y runtime', () => {
  assert.equal(
    serviceWorker.includes('NEVER_CACHE_PREFIXES'),
    true,
  );

  assert.equal(
    serviceWorker.includes('isRuntimeConfig'),
    true,
  );

  assert.equal(
    serviceWorker.includes("request.method!=='GET'"),
    true,
  );
});

test('RC41 elimina el catch silencioso exacto del login', () => {
  const obsoleteLogin = [
    '    await login(',
    "      data.get('email'),",
    "      data.get('password')",
    '    ).catch(() => {});',
  ].join('\n');

  assert.equal(
    application.includes(obsoleteLogin),
    false,
  );

  assert.equal(
    application.includes(
      "reportDiagnostic('login', error)",
    ),
    true,
  );
});

test('RC41 muestra códigos sanitizados de incidencia', () => {
  assert.equal(
    application.includes('function diagnosticCode('),
    true,
  );

  assert.equal(
    application.includes('Código: ${incident}'),
    true,
  );

  assert.equal(
    application.includes('console.error(error)'),
    false,
  );

  assert.equal(
    application.includes('console.error(error.body'),
    false,
  );
});