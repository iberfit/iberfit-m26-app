import test from 'node:test';
import assert from 'node:assert/strict';
import {LONGITUDINAL_EXPLORER_WINDOWS,buildLongitudinalAggregation} from '../src/m26/intelligence/longitudinal-aggregation.js';
import {renderLongitudinalDataExperience,applyEvolutionPeriodSelection} from '../src/m26/data-experience/longitudinal-ui.js';
test('Life360 exposes four genuine historical chart windows',()=>{assert.deepEqual(LONGITUDINAL_EXPLORER_WINDOWS,[7,28,90,365]);});
test('Longitudinal year keeps observed samples and does not generate a new progress window',()=>{
  const state={collections:{wearableDailySummaries:[],appointments:[],sessionExecutions:[],checkins:[],iriAssessments:[]}};
  const today=new Date('2026-11-05T12:00:00Z');
  const result=buildLongitudinalAggregation(state,'demo',{now:today});
  assert.equal(result.windows.d365.daysWithAnyData,0);
  assert.equal(result.windows.d365.metrics.steps.average,null);
  assert.equal(result.windows.d365.metrics.steps.coverage,0);
  assert.equal(Object.hasOwn(result.progress,'d365'),false);
});
test('Life360 uses a single chart per variable with a real period selector',()=>{
  const state={collections:{wearableDailySummaries:[],appointments:[],sessionExecutions:[],checkins:[],iriAssessments:[]}};
  const a=buildLongitudinalAggregation(state,'demo',{now:new Date('2026-11-05T12:00:00Z')});
  const html=renderLongitudinalDataExperience(a,{role:'client'});
  assert.match(html,/data-m26-evolution-period/u);
  assert.match(html,/365 días/u);
  assert.match(html,/data-m26-period-series/u);
  assert.match(html,/data-m26-current-period="28"/u);
  const n=(html.match(/data-m26-period-series=/gu)||[]).length;
  assert.equal((html.match(/<m26-echart /gu)||[]).length,n);
  assert.equal(applyEvolutionPeriodSelection([],365),365);
  assert.equal(applyEvolutionPeriodSelection([],'invalid'),28);
});
