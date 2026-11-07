import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
const casePart=file.slice(file.indexOf('function liveDisclosureScope('),file.indexOf('  const baseRender=render;'));
test('U360 WebKit: live detail opens survive only same execution and set repaint',()=>{
  assert.ok(casePart.includes("[data-session-live-entry]"));
  assert.ok(casePart.includes('String(x.id'));
  assert.ok(casePart.includes('String(x.index'));
  assert.ok(casePart.includes('String(x.setIndex'));
  assert.ok(casePart.includes('String(x.status'));
  assert.ok(casePart.includes("[data-session-live-state]"));
  assert.ok(casePart.includes('snapshot.key!==liveDisclosureScope(c)'));
  assert.ok(casePart.includes('nodes.length!==snapshot.total'));
  assert.ok(casePart.includes('nodes[index].open=true'));
});
test('U360 WebKit: preserves original post-render set validation and all controls',()=>{
 const rendered=file.slice(file.indexOf('  render=()=>{const before=getContext()'),file.indexOf('  function renderSession(){'));
 for(const token of ['captureSessionBuilderDisclosureState','captureSessionBuilderFocus','baseRender?.()',
   'restoreSessionBuilderDisclosureState','restoreSessionBuilderFocus','restoreLiveDisclosure(liveDisclosure,getContext())',
   'hydrateActiveSetDraft(getContext())','hydrateFinalFeedbackDraft(getContext())',
   'syncLiveAddExerciseControl(getContext())','ensureSessionClockTicker(getContext())'])
   assert.ok(rendered.includes(token),token);
});
