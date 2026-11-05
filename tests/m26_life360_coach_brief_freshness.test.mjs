import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIberfitDecisionBrief} from '../src/m26/intelligence/decision-brief.js';
const NOW=new Date('2026-11-05T16:00:00Z');
const summary=lastExecutionAt=>({
  clientId:'owner',days:28,lastExecutionAt,
  adherence:null,averageRpe:null,checkins:0,plannedSessions:0,
  wearable:{daysWithData:0},dataQuality:'alta',
});
test('Coach Decision Brief does not call a stale or future execution recent',()=>{
  for(const date of ['2026-07-01T16:00:00Z','2026-11-09T16:00:00Z','malformed']){
    const brief=buildIberfitDecisionBrief({summary:summary(date),now:NOW});
    assert.equal(brief.evidenceCount,0);
    assert.equal(brief.confidence,'limitada');
    assert.ok(brief.limitations.some(item=>/no acredita una sesión reciente/u.test(item)));
    assert.doesNotMatch(brief.signals.join(' '),/sesión confirmada reciente/u);
  }
});
test('Coach Decision Brief accepts a real, dated execution inside the measured window',()=>{
  const brief=buildIberfitDecisionBrief({summary:summary('2026-11-04T16:00:00Z'),now:NOW});
  assert.equal(brief.evidenceCount,1);
  assert.match(brief.signals.join(' '),/sesión confirmada reciente/u);
  assert.equal(brief.mode,'deterministic-explainable');
  assert.match(brief.safetyNote,/no modifica cargas/u);
});
test('Coach Decision Brief no longer grants high confidence from a quality flag alone',()=>{
  const empty=buildIberfitDecisionBrief({summary:summary(null),now:NOW});
  assert.equal(empty.confidence,'limitada');
  assert.equal(empty.evidenceCount,0);
});
