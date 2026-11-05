import test from 'node:test';
import assert from 'node:assert/strict';
import {renderClientCycleGoal,renderPeriodizationBoard} from '../src/m26/planning/periodization-workbench.js';
const cycle={
  clientId:'authorized',cycleName:'Ciclo de fuerza',goal:'Completar dos sesiones semanales',
  start:'2026-11-01',end:'2026-11-30',currentWeek:1,
  weeks:[{index:1,completed:1,scheduled:2}],
  blocks:[{index:1,start:'2026-11-01',end:'2026-11-30',completed:1,scheduled:2}],
  completed:1,scheduled:2,
};
test('Life360 client sees an agreed goal without inferred achievement',()=>{
  const html=renderClientCycleGoal(cycle);
  assert.match(html,/data-m26-client-cycle-goal/u);
  assert.match(html,/Completar dos sesiones semanales/u);
  assert.match(html,/Semana 1 de 1/u);
  assert.match(html,/Ver mi planificación/u);
  assert.doesNotMatch(html,/100 %|Objetivo logrado|meta conseguida/u);
  assert.equal(renderClientCycleGoal({...cycle,goal:''}),'');
  assert.equal(renderClientCycleGoal({...cycle,clientId:''}),'');
});
test('Life360 coach and client goals escape untrusted goal copy',()=>{
  const data={...cycle,goal:'<script>boom</script>'};
  const html=renderClientCycleGoal(data);
  assert.doesNotMatch(html,/<script>/u);
  assert.match(html,/&lt;script&gt;/u);
  const coach=renderPeriodizationBoard(data,{role:'coach'});
  assert.match(coach,/Objetivo acordado/u);
  assert.doesNotMatch(coach,/<script>/u);
});
