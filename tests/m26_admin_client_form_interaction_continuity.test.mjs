import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync('src/m26/shell/shell-controller.js','utf8');
const wizard=fs.readFileSync('src/m26/admin/client-create-wizard.js','utf8');
const matrix=fs.readFileSync('playwright.admin-interaction.config.mjs','utf8');
const shellEnhancer=fs.readFileSync('src/m26/rc39/shell-enhancer.js','utf8');

test('shell protects native selects and form buttons from deferred replacement',()=>{
  assert.match(shell,/SHELL_INTERACTIVE_SELECTOR='input,textarea,select,\[contenteditable="true"\],details > summary,button'/u);
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


test('label and form pointerdown acquire interaction protection before native focus transfer',()=>{
  assert.match(shell,/function labelControl\(node\)/u);
  assert.match(shell,/label\.control\|\|null/u);
  assert.match(shell,/label\.querySelector\?\.\(SHELL_FOCUS_INTERACTIVE_SELECTOR\)/u);
  assert.match(shell,/function interactiveControl\(node\)\{return node\?\.closest\?\.\(SHELL_INTERACTIVE_SELECTOR\)\|\|labelControl\(node\)\|\|null;\}/u);
  assert.match(shell,/const pointerForm=interactionForm\(event\.target\);/u);
  assert.match(shell,/if\(pointerForm\)formInteractionTarget=pointerForm;/u);
  assert.match(shell,/if\(previous&&!interactionPointerTarget&&!formInteractionTarget\)queueMicrotask\(flushDeferredRender\);/u);
});

test('touch text entry keeps native browser focus semantics through pointer release',()=>{
  assert.match(shell,/SHELL_TOUCH_TEXT_ENTRY_SELECTOR/u);
  assert.doesNotMatch(shell,/function focusTouchTextEntry\(control,event\)/u);
  assert.doesNotMatch(shell,/focusTouchTextEntry\(textEntry,event\)/u);
  assert.match(shell,/function onFocusIn\(event\)[\s\S]*?markTextEntryActive\(touchTextEntry\(control\)\)/u);
  assert.match(shell,/function onPointerDown\(event\)[\s\S]*?interactionPointerTarget=interactiveControl\(event\.target\);/u);
  assert.match(shell,/m26TextEntryActive/u);
  assert.match(shellEnhancer,/data-m26-text-entry-active="true"[\s\S]*?\.m26-mobile-nav[\s\S]*?pointer-events:\s*none/u);
});


test('open disclosures survive shell replacement without forcing unrelated controls',()=>{
  assert.match(shell,/function disclosureBaseKey\(details\)/u);
  assert.match(shell,/function captureDisclosureContinuity\(\)/u);
  assert.match(shell,/function restoreDisclosureContinuity\(snapshot=\[\]\)/u);
  assert.match(shell,/const disclosureSnapshot=captureDisclosureContinuity\(\);\s*root\.innerHTML = markup;\s*lastMarkup=markup;\s*restoreDisclosureContinuity\(disclosureSnapshot\);/u);
});


test('native disclosure summaries hold a short pointer lease until click default action completes',()=>{
  assert.match(shell,/SHELL_INTERACTIVE_SELECTOR='input,textarea,select,\[contenteditable="true"\],details > summary,button'/u);
  assert.match(shell,/const timeoutMs=tag==='select'\?NATIVE_SELECT_INTERACTION_HOLD_MS:INTERACTION_RELEASE_GRACE_MS;/u);
});


test('all buttons hold only the short pointer lease so click cannot be swallowed by a queued render',()=>{
  assert.match(shell,/SHELL_INTERACTIVE_SELECTOR='input,textarea,select,\[contenteditable="true"\],details > summary,button'/u);
  assert.match(shell,/SHELL_FOCUS_INTERACTIVE_SELECTOR='input,textarea,select,\[contenteditable="true"\]'/u);
});


test('external shell render requests cannot bypass active form interaction leases',()=>{
  assert.match(shell,/function renderSafely\(state=store\.getState\(\)\)\{[\s\S]*?if\(shellInteractionActive\(\)\)\{[\s\S]*?queuedState=state;[\s\S]*?return false;[\s\S]*?return renderNow\(state\);/u);
  assert.match(shell,/return Object\.freeze\(\{ mount, destroy, render:renderSafely, scheduleRender \}\);/u);
  assert.doesNotMatch(shell,/render:renderNow/u);
});
