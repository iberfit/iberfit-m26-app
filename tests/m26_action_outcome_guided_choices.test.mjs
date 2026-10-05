import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const controller=fs.readFileSync('src/m26/engagement/engagement-controller.js','utf8');

test('decision tracking never preselects signal source or intervention type',()=>{
  assert.match(controller,/\['','Seleccionar origen'\]/u);
  assert.match(controller,/\['','Seleccionar intervención'\]/u);
  assert.match(controller,/data-guided-required-form/u);
  assert.match(controller,/signalSource\.select,signal\.input,decision\.input,interventionType\.select/u);
  assert.match(controller,/control\.required=true/u);
});

test('outcome review never preselects improved/stable/worse',()=>{
  assert.match(controller,/\['','Seleccionar resultado'\]/u);
  assert.match(controller,/outcomeStatus\.select,outcomeSummary\.input,reviewed\.input/u);
});

test('suggested review date is explicit, editable and described as a proposal',()=>{
  assert.match(controller,/review\.input\.value=civilDateOffset\(14\)/u);
  assert.match(controller,/IBERFIT propone revisar en 14 días\. Ajusta la fecha según tu criterio profesional\./u);
  assert.doesNotMatch(controller,/review\.input\.readOnly=true/u);
  assert.doesNotMatch(controller,/review\.input\.disabled=true/u);
});
