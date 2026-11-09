import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
test('Coach session enhancement retains only two expensive owner-scoped context snapshots per shell render',()=>{
 const start=file.indexOf('  render=()=>{\n');
 const end=file.indexOf('  function renderSession()',start);
 assert.ok(start>=0&&end>start);
 const body=file.slice(start,end);
 assert.equal((body.match(/getContext\(\)/gu)||[]).length,2);
 assert.match(body,/const before=getContext\(\);/u);
 assert.match(body,/baseRender\?\.\(\);\s*const after=getContext\(\);/u);
 for(const enhancement of ['hydrateCapture','hydrateActiveSetDraft','primeCoachSetDraft','hydrateFinalFeedbackDraft',
  'syncLiveAddExerciseControl','syncFinishControl','syncManualSyncControl','syncRecoveryReviewControl',
  'scheduleCoachRestAutoAdvance','ensureSessionClockTicker']){
  assert.match(body,new RegExp(enhancement+'\\(after\\)'));
 }
 assert.match(body,/restoreSessionBuilderFocus\(root,focused,draftAfter\)/u);
 assert.match(body,/restoreLiveDisclosure\(liveDisclosure,after\)/u);
});
