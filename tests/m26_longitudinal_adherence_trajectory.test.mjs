import test from 'node:test';
import assert from 'node:assert/strict';

import {__longitudinalUiInternals} from '../src/m26/data-experience/longitudinal-ui.js';

const aggregate={
  adherence:{
    d7:0.75,
    d28:0.8,
    d90:0.7,
    baseline28:0.65,
    change28VsPrevious28:0.15,
  },
  progress:{
    d28:{
      summary:{
        completedSessions:8,
        plannedSessions:10,
      },
    },
  },
};

test('client adherence panel exposes 7/28/90 trajectory and raw 28-day counts',()=>{
  const html=__longitudinalUiInternals.adherencePanel(aggregate,'client');

  assert.match(html,/Tu trayectoria de adherencia/u);
  assert.match(html,/7 días[\s\S]*75 %/u);
  assert.match(html,/28 días[\s\S]*80 %/u);
  assert.match(html,/90 días[\s\S]*70 %/u);
  assert.match(html,/Completadas[\s\S]*8/u);
  assert.match(html,/Planificadas[\s\S]*10/u);
  assert.match(html,/Cambio frente a los 28 días previos: \+15 pp\./u);
  assert.match(html,/no sustituye la valoración de tu entrenador/u);
});

test('client adherence panel keeps unknown comparison explicit',()=>{
  const html=__longitudinalUiInternals.adherencePanel(
    {
      ...aggregate,
      adherence:{
        ...aggregate.adherence,
        change28VsPrevious28:null,
      },
    },
    'client'
  );

  assert.match(html,/Aún no hay un periodo previo comparable\./u);
  assert.doesNotMatch(html,/\+0 pp/u);
});

test('professional adherence panel retains 7/28/90 baseline comparison',()=>{
  const html=__longitudinalUiInternals.adherencePanel(aggregate,'coach');

  assert.match(html,/Comparativa temporal/u);
  assert.match(html,/7 días[\s\S]*75 %/u);
  assert.match(html,/28 días[\s\S]*80 %/u);
  assert.match(html,/90 días[\s\S]*70 %/u);
  assert.match(html,/Baseline 28 días previos: 65 %[\s\S]*cambio \+15 pp/u);
});
