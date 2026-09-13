import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync('src/m26/shell/shell-controller.js','utf8');
const wizard=fs.readFileSync('src/m26/admin/client-create-wizard.js','utf8');
const matrix=fs.readFileSync('playwright.admin-interaction.config.mjs','utf8');
const shellEnhancer=fs.readFileSync('src/m26/rc39/shell-enhancer.js','utf8');

test('shell protects native selects and form buttons from deferred replacement',()=>{
  assert.match(shell,/SHELL_INTERACTIVE_SELECTOR='input,textarea,select,\[contenteditable="true"\],form button'/u);
  assert.match(shell,/tag!=='select'&&focusedInteractiveControl\(\)===control/u);
  assert.match(shell,/interactionPointerTarget===control&&String\(control\?\.tagName\|\|''\)\.toLowerCase\(\)!=='select'/u);
  assert.match(shell,/!committedControl\.closest\?\.\('form'\)/u);
});

test('client-create wizard restores its draft after legitimate shell rerenders',()=>{
  assert.match(wizard,/function onShellRendered\(\)/u);
  assert.match(wizard,/flushScheduledSave\(\);\s*sync\(\);/u);
  assert.match(wizard,/addEventListener\('m26:shell-rendered',onShellRendered\)/u);
  assert.match(wizard,/removeEventListener\('m26:shell-rendered',onShellRendered\)/u);
});

test('browser matrix includes full-shell client form continuity regression',()=>{
  assert.match(matrix,/client-form-continuity\.spec\.mjs/u);
});


test('touch text entry is focused inside the user gesture and mobile navigation yields',()=>{
  assert.match(shell,/SHELL_TOUCH_TEXT_ENTRY_SELECTOR/u);
  assert.match(shell,/function focusTouchTextEntry\(control,event\)/u);
  assert.match(shell,/pointerType==='touch'\|\|root\?\.dataset\?\.m26Input==='touch'/u);
  assert.match(shell,/if\(textEntry\)focusTouchTextEntry\(textEntry,event\)/u);
  assert.match(shell,/m26TextEntryActive/u);
  assert.match(shellEnhancer,/data-m26-text-entry-active="true"[\s\S]*?\.m26-mobile-nav[\s\S]*?pointer-events:\s*none/u);
});
