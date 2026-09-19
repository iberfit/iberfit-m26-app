import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shellCss = readFileSync(new URL('../src/m26/shell/shell.css', import.meta.url), 'utf8');
const premiumCss = readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css', import.meta.url), 'utf8');
const shellEnhancer = readFileSync(new URL('../src/m26/rc39/shell-enhancer.js', import.meta.url), 'utf8');

test('mobile navigation remains viewport-fixed after premium visual overrides', () => {
  const mobileMedia = shellCss.match(/@media\s*\(max-width:\s*900px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(mobileMedia, 'shell.css must keep the mobile breakpoint');

  const mobileNavRule = mobileMedia[1].match(/\.m26-mobile-nav\s*\{([^}]*)\}/);
  assert.ok(mobileNavRule, 'mobile breakpoint must define .m26-mobile-nav');
  assert.match(mobileNavRule[1], /position:\s*fixed\s*;/, 'mobile nav must stay fixed to the viewport');
  assert.match(mobileNavRule[1], /left:\s*0\s*;/, 'mobile nav must stay anchored left');
  assert.match(mobileNavRule[1], /right:\s*0\s*;/, 'mobile nav must stay anchored right');
  assert.match(mobileNavRule[1], /bottom:\s*0\s*;/, 'mobile nav must stay anchored to the viewport bottom');
  assert.match(mobileNavRule[1], /max-width:\s*100vw\s*;/, 'mobile nav must not exceed the viewport width');

  assert.match(
    premiumCss,
    /\.m26-shell\s+\.m26-workspace>\*:not\(\.m26-mobile-nav\)\s*\{\s*position:\s*relative;\s*z-index:\s*1\s*\}/,
    'premium visual stacking must explicitly exclude the fixed mobile nav',
  );
  assert.doesNotMatch(
    premiumCss,
    /\.m26-shell\s+\.m26-workspace>\*\s*\{\s*position:\s*relative;/,
    'premium visual layers must never reset every workspace child, including mobile nav, to position:relative',
  );
});

test('mobile text entry keeps fixed navigation visible and interactive', () => {
  assert.match(
    shellEnhancer,
    /\.m26-main\s+:is\(input,textarea,select,\[contenteditable="true"\]\)\s*\{\s*scroll-margin-bottom:\s*calc\(6\.5rem\s*\+\s*env\(safe-area-inset-bottom\)\);\s*\}/,
    'mobile text entry must retain safe-area-aware scroll clearance above the navigation',
  );
  assert.doesNotMatch(
    shellEnhancer,
    /:focus\)\s*\.m26-mobile-nav\s*,/,
    'focused form controls must not hide the mobile navigation',
  );
  assert.doesNotMatch(
    shellEnhancer,
    /\[data-m26-text-entry-active="true"\]\s+\.m26-mobile-nav\s*\{/,
    'text-entry state must not disable or move the mobile navigation',
  );
  assert.doesNotMatch(
    shellEnhancer,
    /\.m26-mobile-nav\s*\{[^}]*pointer-events:\s*none\s*;/s,
    'mobile navigation must remain pointer-interactive while editing',
  );
});
