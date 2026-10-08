import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const render=fs.readFileSync('src/m26/modules/route-render.js','utf8');
const engagement=fs.readFileSync('src/m26/engagement/engagement-controller.js','utf8');

test('workspace Coach reutiliza señal de bienestar sin duplicar una superficie de decisión',()=>{
  assert.match(render,/suggestedDecisionSignal=/u);
  assert.match(render,/\['pain','wellbeing','wellbeing-shift'\]/u);
  assert.match(render,/data-action-outcome-prefill-source/u);
  assert.match(render,/data-action-outcome-prefill-signal/u);
  assert.doesNotMatch(render,/PROGRESS_COACH_DECISION_BRIDGE_V1/u);
});

test('prefill acepta solo origen y señal; decisión e intervención siguen humanas',()=>{
  assert.match(engagement,/allowedSuggestedSources=new Set\(\['checkin','adherence','session','progress','coach_observation','other'\]\)/u);
  assert.match(engagement,/if\(suggestedSignal\)signal\.input\.value=suggestedSignal/u);
  assert.match(engagement,/if\(allowedSuggestedSources\.has\(suggestedSource\)\)signalSource\.select\.value=suggestedSource/u);
  const start=engagement.indexOf('const suggestedSignal');
  const end=engagement.indexOf("const decision=createTextarea",start);
  const prefill=engagement.slice(start,end);
  assert.doesNotMatch(prefill,/decisionSummary|interventionSummary|submit\(|dispatchEvent|open=true/u);
});

test('prefill no altera el contrato de seguridad de próxima sesión',()=>{
  const prep=fs.readFileSync('src/m26/intelligence/next-session-prep.js','utf8');
  assert.match(prep,/automaticLoadChange:false/u);
  assert.match(prep,/automaticExerciseChange:false/u);
  assert.match(prep,/automaticClinicalDecision:false/u);
  assert.match(prep,/coachConfirmationRequired:true/u);
});
