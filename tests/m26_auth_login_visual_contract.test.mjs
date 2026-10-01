import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const criticalCss = readFileSync(new URL('../public/m26/preauth-critical.css', import.meta.url), 'utf8');
const accessUi = readFileSync(new URL('../src/m26/app/access-ui.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../public/m26/index.html', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../public/m26/sw.js', import.meta.url), 'utf8');

test('login hardening stays inside the existing strict-CSP preauth shell asset', () => {
  assert.match(indexHtml, /href="\/m26\/preauth-critical\.css"[^>]*data-iberfit-preauth-critical/);
  assert.doesNotMatch(indexHtml, /auth-login-hardening\.css/);
  assert.match(serviceWorker, /"\/m26\/preauth-critical\.css"/);
  assert.doesNotMatch(serviceWorker, /auth-login-hardening\.css/);
  assert.match(criticalCss, /LOGIN VISUAL HARDENING V2/);
});

test('login keeps browser autofill inside the IBERFIT dark premium field treatment', () => {
  assert.match(criticalCss, /\.m26-auth-card input\{[^}]*color-scheme:dark/);
  assert.match(criticalCss, /\.m26-auth-card input:-webkit-autofill/);
  assert.match(criticalCss, /\.m26-auth-card input:autofill/);
  assert.match(criticalCss, /-webkit-text-fill-color:var\(--iberfit-v3-text\)!important/);
  assert.match(criticalCss, /color-scheme:dark!important/);
  assert.match(criticalCss, /-webkit-box-shadow:inset 0 0 0 1000px #0E1A15!important/i);
  assert.match(criticalCss, /box-shadow:inset 0 0 0 1000px #0E1A15!important/i);
  assert.match(criticalCss, /transition:background-color 9999s ease-out 0s!important/);
  assert.match(criticalCss, /caret-color:var\(--iberfit-v3-gold\)!important/);
  assert.match(criticalCss, /input:-webkit-autofill:focus[^}]*-webkit-box-shadow:inset 0 0 0 1000px #0E1A15,0 0 0 3px rgba\(197,160,89,\.16\)!important/);
  assert.match(criticalCss, /input:-webkit-autofill:focus[^}]*box-shadow:inset 0 0 0 1000px #0E1A15,0 0 0 3px rgba\(197,160,89,\.16\)!important/);
});

test('password visibility control remains a >=44px touch target without changing auth semantics', () => {
  assert.match(
    criticalCss,
    /\.m26-password-toggle\{[^}]*min-width:2\.75rem!important;min-height:2\.75rem!important/,
  );
  assert.match(criticalCss, /\.m26-password-field input\{padding-right:6rem!important\}/);
  assert.match(accessUi, /setAttribute\?\.\('aria-pressed',\s*reveal\?'true':'false'\)/);
  assert.match(accessUi, /autocomplete="current-password"/);
  assert.match(indexHtml, /autocomplete="current-password"/);
  assert.match(indexHtml, /data-password-toggle[^>]*aria-pressed="false"/);
});

test('login secondary actions use deterministic centered layout on narrow screens', () => {
  assert.match(
    criticalCss,
    /\.m26-auth-options\{[^}]*align-items:center!important;justify-content:center!important/,
  );
  assert.match(
    criticalCss,
    /\.m26-auth-card \.m26-auth-link\{[^}]*min-height:2\.75rem!important;[^}]*margin-left:0!important/,
  );
  assert.match(
    criticalCss,
    /\.m26-auth-card \.m26-remember-email\{[^}]*min-height:2\.75rem/,
  );
  assert.match(
    criticalCss,
    /@media\(max-width:580px\)\{[\s\S]*?\.m26-auth-options\{align-items:center!important;justify-content:center!important\}[\s\S]*?\.m26-auth-link\{margin-left:0!important\}/,
  );
});
