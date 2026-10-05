import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const primitives=read('src/m26/design/primitives.css');
const auth=read('src/m26/design/auth-native.css');
const shellEnhancer=read('src/m26/rc39/shell-enhancer.js');

test('authenticated controls preserve the dark IBERFIT surface under browser autofill',()=>{
  assert.match(primitives,/\.m26-shell :is\([\s\S]*?input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),[\s\S]*?select,[\s\S]*?textarea[\s\S]*?\) \{[\s\S]*?color-scheme: dark;/u);
  assert.match(primitives,/\.m26-shell input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):-webkit-autofill/u);
  assert.match(primitives,/\.m26-shell input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):autofill/u);
  assert.match(primitives,/-webkit-text-fill-color: var\(--iberfit-color-text-primary\) !important/u);
  assert.match(primitives,/caret-color: var\(--iberfit-color-accent-strong\) !important/u);
  assert.match(primitives,/inset 0 0 0 1000px var\(--iberfit-color-surface-base\)/u);
  assert.match(primitives,/background-color: var\(--iberfit-color-surface-base\) !important/u);
});

test('autofill focus keeps an explicit visible focus treatment instead of browser light paint',()=>{
  assert.match(primitives,/-webkit-autofill:focus-visible[\s\S]*?border-color: var\(--iberfit-color-focus\) !important/u);
  assert.match(primitives,/:autofill:focus-visible[\s\S]*?0 0 0 3px color-mix\(in srgb, var\(--iberfit-color-focus\) 16%, transparent\)/u);
});

test('native date and select controls request a dark browser palette',()=>{
  for(const type of ['date','datetime-local','time','month']){
    assert.ok(primitives.includes(`input[type="${type}"]`),type);
  }
  assert.match(primitives,/\.m26-shell select,[\s\S]*?\.m26-shell select option \{[\s\S]*?background-color: var\(--iberfit-color-surface-base\)/u);
});

test('focused controls keep safe scroll margins around top chrome keyboard and bottom navigation',()=>{
  assert.match(primitives,/scroll-margin-block-start: 6rem/u);
  assert.match(primitives,/scroll-margin-block-end: calc\(7rem \+ env\(safe-area-inset-bottom\)\)/u);
  assert.match(shellEnhancer,/scroll-margin-bottom: calc\(6\.5rem \+ env\(safe-area-inset-bottom\)\)/u);
});

test('scrollable overlays contain overscroll and keep touch momentum',()=>{
  for(const selector of [
    '[role="dialog"]',
    '.m26-coach-command-dialog',
    '.m26-mobile-more-menu',
    '.m26-library-details-panel',
  ])assert.ok(primitives.includes(selector),selector);
  assert.match(primitives,/overscroll-behavior: contain/u);
  assert.match(primitives,/scrollbar-gutter: stable/u);
  assert.match(primitives,/-webkit-overflow-scrolling: touch/u);
});

test('auth login retains its stricter dedicated autofill and password-manager contract',()=>{
  assert.match(auth,/\.m26-auth-card input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\):-webkit-autofill/u);
  assert.match(auth,/-webkit-text-fill-color: #fbf7ee !important/u);
  assert.match(auth,/caret-color: #d9bb77 !important/u);
  assert.match(auth,/\.m26-password-field input \{[\s\S]*?padding-right: 5\.7rem;/u);
  assert.match(auth,/\.m26-password-toggle \{[\s\S]*?min-width: 4\.9rem;/u);
});
