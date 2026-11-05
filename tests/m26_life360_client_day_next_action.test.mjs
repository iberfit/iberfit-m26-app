import test from 'node:test';
import assert from 'node:assert/strict';
import {buildClientDayContext,deriveClientDayNextAction,renderClientDayContext} from '../src/m26/experience/client-day-context.js';
import {renderClientWeekRail} from '../src/m26/modules/route-render.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
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

test('Life360 retains the latest real device reading when a newer sync day is empty',()=>{
  const snapshot=buildClientDayContext({clientId:'owner',now:new Date('2026-11-05T15:00:00Z'),wearables:{
    dailyRecords:[
      {clientId:'owner',date:'2026-11-05',metrics:{}},
      {clientId:'owner',date:'2026-11-04',metrics:{steps:5500,activeMinutes:36}},
      {clientId:'foreign',date:'2026-11-05',metrics:{steps:90000}},
    ],
  }});
  assert.equal(snapshot.movement.date,'2026-11-04');
  assert.equal(snapshot.movement.status,'recent');
  assert.equal(snapshot.movement.metrics.steps,5500);
  assert.equal(snapshot.movement.metrics.activeMinutes,36);
  assert.match(renderClientDayContext(snapshot),/Último día con datos/u);
  assert.doesNotMatch(renderClientDayContext(snapshot),/90\\.000/u);
});
test('Life360 preserves conflicting newest source evidence without invented averages',()=>{
  const snapshot=buildClientDayContext({clientId:'owner',now:new Date('2026-11-05T15:00:00Z'),wearables:{
    dailyRecords:[
      {clientId:'owner',date:'2026-11-05',metrics:{steps:7000}},
      {clientId:'owner',date:'2026-11-05',metrics:{steps:9000}},
      {clientId:'owner',date:'2026-11-04',metrics:{steps:5100}},
    ],
  }});
  assert.equal(snapshot.movement.date,'2026-11-04');
  assert.equal(snapshot.movement.metrics.steps,5100);
  assert.equal(snapshot.movement.ambiguous,true);
  assert.match(renderClientDayContext(snapshot),/valores diferentes entre fuentes/u);
});
test('Life360 weekly rail never calls an upcoming-only window a complete weekly calendar',()=>{
  const html=renderClientWeekRail([{statusRaw:'confirmada',date:'2026-11-11'}],new Date('2026-11-05T15:00:00Z'));
  assert.match(html,/No se muestran próximas citas confirmadas esta semana/u);
  assert.doesNotMatch(html,/Sin citas confirmadas esta semana/u);
  for(const language of ['en','fr','pt'])
    assert.notEqual(iberfitSurfaceTranslate('No se muestran próximas citas confirmadas esta semana',{language}),
      'No se muestran próximas citas confirmadas esta semana');
});
