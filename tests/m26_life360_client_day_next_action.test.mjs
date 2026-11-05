import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveClientDayNextAction,renderClientDayContext} from '../src/m26/experience/client-day-context.js';
test('Life360 prioritizes one real wellbeing action if no fresh check-in exists',()=>{
  const item={asOf:'2026-11-05',wellbeing:{status:'missing',metrics:{}},
    movement:{status:'missing',metrics:{}},training:{}};
  const next=deriveClientDayNextAction(item);
  assert.equal(next.area,'actividad');
  assert.match(renderClientDayContext(item),/class="m26-primary-action" data-m26-area="actividad"/u);
  assert.match(renderClientDayContext(item),/data-m26-area="progreso"/u);
});
test('Life360 confirms check-in before promoting longitudinal overview',()=>{
  const item={asOf:'2026-11-05',wellbeing:{status:'today',date:'2026-11-05',metrics:{energy:6}},
    movement:{status:'missing',metrics:{}},training:{completed28:null}};
  const next=deriveClientDayNextAction(item);
  assert.equal(next.area,'progreso');
  const html=renderClientDayContext(item);
  assert.match(html,/class="m26-primary-action" data-m26-area="progreso"/u);
  assert.match(html,/data-m26-area="actividad"/u);
  assert.doesNotMatch(next.detail,/diagnosticado|apto|enfermedad/u);
});
