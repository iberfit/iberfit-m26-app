import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authCss = readFileSync(new URL('../src/m26/design/auth-native.css', import.meta.url), 'utf8');
const accessUi = readFileSync(new URL('../src/m26/app/access-ui.js', import.meta.url), 'utf8');

test('login keeps browser autofill inside the IBERFIT dark premium field treatment', () => {
  assert.match(authCss, /\.m26-auth-card input:-webkit-autofill/);
  assert.match(authCss, /\.m26-auth-card input:autofill/);
  assert.match(authCss, /-webkit-text-fill-color:\s*#fbf7ee/i);
  assert.match(authCss, /box-shadow:\s*inset 0 0 0 1000px #071b12/i);
  assert.match(authCss, /caret-color:\s*#d9bb77/i);
});

test('password visibility control remains a >=44px touch target without changing auth semantics', () => {
  assert.match(authCss, /\.m26-auth-card \.m26-password-toggle[\s\S]*?min-width:\s*2\.75rem[\s\S]*?min-height:\s*2\.75rem/);
  assert.match(accessUi, /setAttribute\('aria-pressed',\s*String\(nextVisible\)\)/);
  assert.match(accessUi, /autocomplete="current-password"/);
});

test('login secondary actions use deterministic balanced layout on narrow screens', () => {
  assert.match(authCss, /LOGIN VISUAL HARDENING V1/);
  assert.match(authCss, /\.m26-auth-options\s*\{[\s\S]*?justify-content:\s*center/);
  assert.match(authCss, /@media \(max-width:\s*580px\)[\s\S]*?\.m26-auth-card \.m26-auth-link\s*\{[\s\S]*?margin-left:\s*0/);
  assert.match(authCss, /\.m26-auth-card \.m26-remember-email\s*\{[\s\S]*?min-height:\s*2\.75rem/);
});
