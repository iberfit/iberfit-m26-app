import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildLongitudinalLineOption,
} from '../src/m26/data-experience/echarts-element.js';
import {
  renderLongitudinalDataExperience,
} from '../src/m26/data-experience/longitudinal-ui.js';
import {
  buildLongitudinalAggregation,
} from '../src/m26/intelligence/longitudinal-aggregation.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const NOW=new Date('2026-08-16T12:00:00.000Z');
const CLIENT='CLIENT-DATA-INTELLIGENCE-V1';

function day(offset){
  const date=new Date(NOW);
  date.setUTCDate(date.getUTCDate()-offset);
  return date.toISOString().slice(0,10);
}

function record(offset){
  return {
    clientId:CLIENT,
    provider:'health_connect',
    date:day(offset),
    steps:8000-offset*10,
    activeMinutes:45-offset%4,
    sleepMinutes:440-offset%12,
    restingHeartRate:58+(offset%3),
    hrvMs:50-(offset%4),
    vfcMethod:'rmssd',
    activeEnergyKcal:480-offset%20,
    workoutMinutes:38-offset%5,
    quality:'alta',
    sourceUpdatedAt:`${day(offset)}T23:00:00.000Z`,
  };
}

function stateFixture(){
  return {
    collections:{
      wearableDailySummaries:Array.from({length:90},(_,offset)=>record(offset)),
      appointments:[],
      sessionExecutions:[],
      checkins:[],
      iriAssessments:[],
    },
  };
}

test('Data Intelligence V1 dibuja referencias comparativas y último dato sin añadir series',()=>{
  const option=buildLongitudinalLineOption({
    points:[
      {date:'2026-08-15',value:7000},
      {date:'2026-08-16',value:8000},
    ],
    label:'Pasos',
    unit:'pasos',
    referenceValue:7500,
    referenceLabel:'Media 28 días',
    comparisonValue:6200,
    comparisonLabel:'28 días previos',
  });

  assert.equal(option.series.length,1);
  assert.equal(option.xAxis.axisLabel.formatter('2026-08-16'),'16/08');
  assert.equal(option.tooltip.valueFormatter(8000),'8.000 pasos');
  assert.equal(option.series[0].markLine.data.length,2);
  assert.equal(option.series[0].markLine.data[0].yAxis,7500);
  assert.equal(option.series[0].markLine.data[1].yAxis,6200);
  assert.deepEqual(option.series[0].markPoint.data[0].coord,['2026-08-16',8000]);
});

test('Data Intelligence V1 comparte la carga ECharts y agrupa resize en frame',()=>{
  const source=read('src/m26/data-experience/echarts-element.js');

  assert.match(source,/let echartsModulePromise=null/u);
  assert.match(source,/function loadEchartsModule\(\)/u);
  assert.equal((source.match(/import\(ECHARTS_VENDOR_URL\)/gu)||[]).length,1);
  assert.match(source,/requestAnimationFrame/u);
  assert.match(source,/cancelFrame/u);
  assert.match(source,/ResizeObserver/u);
  assert.match(source,/renderer:'svg'/u);
});

test('Data Intelligence V1 expone último rango cobertura y baseline según rol',()=>{
  const aggregate=buildLongitudinalAggregation(stateFixture(),CLIENT,{now:NOW});
  const clientHtml=renderLongitudinalDataExperience(aggregate,{role:'client'});
  const coachHtml=renderLongitudinalDataExperience(aggregate,{role:'coach'});

  assert.match(clientHtml,/Último dato/u);
  assert.match(clientHtml,/Rango 28 días/u);
  assert.match(clientHtml,/días con dato/u);
  assert.match(clientHtml,/data-reference-value=/u);
  assert.doesNotMatch(clientHtml,/data-comparison-value=/u);

  assert.match(coachHtml,/Resumen del periodo/u);
  assert.match(coachHtml,/Rango 90 días/u);
  assert.match(coachHtml,/Días con dato/u);
  assert.match(coachHtml,/data-reference-value=/u);
  assert.match(coachHtml,/data-comparison-value=/u);
  assert.match(coachHtml,/data-comparison-label="28 días previos"/u);
});

test('Data Intelligence V1 conserva interpretación humana y ausencia explícita',()=>{
  const aggregate=buildLongitudinalAggregation(stateFixture(),CLIENT,{now:NOW});
  const html=renderLongitudinalDataExperience(aggregate,{role:'coach'});

  assert.match(html,/Dato → contexto → entrenador decide/u);
  assert.match(html,/no cambian automáticamente/u);
  assert.match(html,/cobertura/u);
  assert.doesNotMatch(html,/readiness score|puntuación global|score global/iu);
});
