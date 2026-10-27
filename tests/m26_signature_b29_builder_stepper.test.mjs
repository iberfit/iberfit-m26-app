import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');
const ctrl=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/m26/design/signature-ux-v2.css',import.meta.url),'utf8');
test('B29 stepper points to three actual regions, reusing the existing handler',()=>{
 for(const key of ['meta','program','review']){
  assert.ok(ui.includes('data-session-jump="'+key+'"'));
  assert.ok(ui.includes('data-session-jump-target="'+key+'"'));
 }
 assert.ok(ctrl.includes("'[data-session-jump]'"));
 assert.ok(ctrl.includes('scrollIntoView'));
});
test('B29 review remains a voluntary explicit publication step',()=>{
 assert.ok(ui.includes('data-session-action="publish"'));
 assert.ok(ui.includes('Vista previa preparada. La publicación requiere una confirmación expresa.'));
 assert.ok(ui.includes("draft.previewAccepted?'<button"));
});
test('B29 stepper supports touch, keyboard focus and forced colors',()=>{
 assert.ok(css.includes('li>button:focus-visible'));
 assert.ok(css.includes('min-height:44px'));
 assert.ok(css.includes('forced-colors:active'));
});

test('B29: exactly one accessible active step per builder state',()=>{
 for(const stage of ['start','program','review']){
  assert.ok(ui.includes("flowStage==='"+stage+"'?' aria-current=\"step\"'"));
 }
});
