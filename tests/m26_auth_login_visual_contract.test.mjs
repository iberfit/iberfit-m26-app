import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hardeningCss = readFileSync(
  new URL('../src/m26/design/auth-login-hardening.css', import.meta.url),
  'utf8',
);
const accessUi = readFileSync(new URL('../src/m26/app/access-ui.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../public/m26/index.html', import.meta.url), 'utf8');

test('login hardening is loaded after the global visual layers', () => {
  const hardening = indexHtml.indexOf('/src/m26/design/auth-login-hardening.css');
  const guidedTour = indexHtml.indexOf('/src/m26/design/guided-tour-responsive.css');
  const premiumV3 = indexHtml.indexOf('/src/m26/design/iberfit-premium-v3.css');

  assert.ok(hardening > 0, 'login hardening stylesheet must be linked');
  assert.ok(hardening > guidedTour, 'login hardening must load after guided tour responsive styles');
  assert.ok(hardening > premiumV3, 'login hardening must load after premium v3 styles');
  assert.match(indexHtml, /data-iberfit-auth-login-hardening/);
});

test('login keeps browser autofill inside the IBERFIT dark premium field treatment', () => {
  assert.match(hardeningCss, /\.m26-auth-card input:-webkit-autofill/);
  assert.match(hardeningCss, /\.m26-auth-card input:autofill/);
  assert.match(hardeningCss, /-webkit-text-fill-color:\s*#fbf7ee/i);
  assert.match(hardeningCss, /inset 0 0 0 1000px #071b12/i);
  assert.match(hardeningCss, /caret-color:\s*#d9bb77/i);
  assert.match(hardeningCss, /input:-webkit-autofill:focus[\s\S]*?0 0 0 3px rgba\(210, 174, 91, \.12\)/);
});

test('password visibility control remains a >=44px touch target without changing auth semantics', () => {
  assert.match(
    hardeningCss,
    /\.m26-auth-card \.m26-password-toggle[\s\S]*?min-width:\s*2\.75rem[\s\S]*?min-height:\s*2\.75rem/,
  );
  assert.match(accessUi, /setAttribute\('aria-pressed',\s*String\(nextVisible\)\)/);
  assert.match(accessUi, /autocomplete="current-password"/);
  assert.match(indexHtml, /autocomplete="current-password"/);
  assert.match(indexHtml, /data-password-toggle[^>]*aria-pressed="false"/);
});

test('login secondary actions use deterministic centered layout on narrow screens', () => {
  assert.match(hardeningCss, /LOGIN VISUAL HARDENING V1/);
  assert.match(
    hardeningCss,
    /\.m26-auth-options\s*\{[\s\S]*?justify-content:\s*center/,
  );
  assert.match(
    hardeningCss,
    /\.m26-auth-card \.m26-auth-link\s*\{[\s\S]*?min-height:\s*2\.75rem[\s\S]*?margin-left:\s*0/,
  );
  assert.match(
    hardeningCss,
    /\.m26-auth-card \.m26-remember-email\s*\{[\s\S]*?min-height:\s*2\.75rem/,
  );
  assert.match(
    hardeningCss,
    /@media \(max-width:\s*580px\)[\s\S]*?\.m26-auth-options\s*\{[\s\S]*?justify-content:\s*center/,
  );
});
