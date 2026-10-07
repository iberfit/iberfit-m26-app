import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('detalle de dolor nace oculto y vinculado al checkbox',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-ui.js','utf8');
  assert.match(source,/data-session-feedback-pain aria-controls="m26-session-feedback-pain-detail" aria-expanded="false"/u);
  assert.match(source,/data-session-feedback-pain-detail hidden/u);
  assert.match(source,/id="m26-session-feedback-pain-detail" data-session-feedback-pain-notes/u);
});

test('controller muestra y exige detalle solo cuando dolor está marcado',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(source,/function syncFeedbackPainControl\(\)/u);
  assert.match(source,/if\(detail\)detail\.hidden=!active/u);
  assert.match(source,/pain\?\.setAttribute\?\.\('aria-expanded',active\?'true':'false'\)/u);
  assert.match(source,/painNotes\.required=active/u);
  assert.match(source,/aria-required/u);
});

test('rehidratación del borrador restaura dolor y recalcula disclosure',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(source,/if\(!draft\)\{syncFeedbackPainControl\(\);return;\}/u);
  assert.match(source,/pain\.checked=Boolean\(values\.pain\)/u);
  assert.match(source,/painNotes\.value=values\.painNotes\?\?''/u);
  assert.match(source,/syncFeedbackPainControl\(\);/u);
});