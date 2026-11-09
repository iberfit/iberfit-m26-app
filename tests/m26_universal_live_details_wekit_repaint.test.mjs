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
 const renderStart=file.indexOf('  render=()=>{');
 const renderEnd=file.indexOf('  function renderSession(){',renderStart);
 assert.ok(renderStart>=0&&renderEnd>renderStart);
 const rendered=file.slice(renderStart,renderEnd);
 for(const token of ['captureSessionBuilderDisclosureState','captureSessionBuilderFocus','baseRender?.()',
   'restoreSessionBuilderDisclosureState','restoreSessionBuilderFocus','restoreLiveDisclosure(liveDisclosure,after)',
   'hydrateActiveSetDraft(after)','hydrateFinalFeedbackDraft(after)',
   'syncLiveAddExerciseControl(after)','ensureSessionClockTicker(after)'])
   assert.ok(rendered.includes(token),token);
});
\ntest('U360 WebKit: skip-set reason disclosure toggles synchronously without native double toggle',()=>{\n const ui=readFileSync(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');\n assert.ok(ui.includes('data-session-skip-set-disclosure'));\n assert.ok(file.includes("event.target.closest?.('details[data-session-skip-set-disclosure] > summary')"));\n assert.ok(file.includes("if(details?.tagName==='DETAILS')details.open=!details.open"));\n assert.ok(file.includes('event.preventDefault?.()'));\n});\n