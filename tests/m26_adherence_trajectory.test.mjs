import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deriveAdherenceTrajectory} from '../src/m26/data-experience/adherence-trajectory.js';

test('adherence trajectory keeps incomplete windows as insufficient evidence',()=>{
  const result=deriveAdherenceTrajectory({d7:0.8,d28:0.8,d90:null});
  assert.equal(result.available,false);
  assert.equal(result.kind,'insufficient');
});

test('adherence trajectory detects a material recent drop before longer-term context',()=>{
  const result=deriveAdherenceTrajectory({d7:0.55,d28:0.75,d90:0.80});
  assert.equal(result.available,true);
  assert.equal(result.kind,'recent_drop');
  assert.equal(result.level,'warning');
  assert.equal(result.recentDeltaPoints,-20);
  assert.match(result.action,/barreras recientes/i);
});

test('adherence trajectory detects recent improvement',()=>{
  const result=deriveAdherenceTrajectory({d7:0.90,d28:0.75,d90:0.70});
  assert.equal(result.kind,'recent_improvement');
  assert.equal(result.level,'success');
  assert.equal(result.recentDeltaPoints,15);
});

test('adherence trajectory uses 28 versus 90 days when the recent window is stable',()=>{
  const result=deriveAdherenceTrajectory({d7:0.70,d28:0.72,d90:0.85});
  assert.equal(result.kind,'below_long_term');
  assert.equal(result.level,'warning');
  assert.equal(result.longDeltaPoints,-13);
});

test('adherence trajectory treats sub-threshold variation as stable',()=>{
  const result=deriveAdherenceTrajectory({d7:0.82,d28:0.78,d90:0.75});
  assert.equal(result.kind,'stable');
  assert.equal(result.level,'neutral');
});

test('longitudinal entrypoint exposes the coach trajectory without changing the client path',()=>{
  const index=fs.readFileSync('src/m26/data-experience/index.js','utf8');
  const wrapper=fs.readFileSync('src/m26/data-experience/longitudinal-adherence-ui.js','utf8');
  assert.match(index,/longitudinal-adherence-ui\.js/u);
  assert.match(wrapper,/deriveAdherenceTrajectory\(aggregate\?\.adherence\)/u);
  assert.match(wrapper,/if\(!base\|\|!professionalRole\(role\)\)return base/u);
  assert.match(wrapper,/No modifica el plan automáticamente/u);
});
