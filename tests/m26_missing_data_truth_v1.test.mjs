import test from 'node:test';
import assert from 'node:assert/strict';

import {finiteOptionalNumber} from '../src/m26/domain/optional-number.js';
import {renderProgressRoute} from '../src/m26/modules/route-render.js';
import {__client360Internals} from '../src/m26/ui/client-360.js';
import {__echartsElementInternals} from '../src/m26/data-experience/echarts-element.js';
import {__longitudinalUiInternals} from '../src/m26/data-experience/longitudinal-ui.js';

test('optional numeric truth preserves absence and explicit zero',()=>{
  for(const value of [null,undefined,'','   ',false,true,[],{}]){
    assert.equal(finiteOptionalNumber(value),null);
  }
  assert.equal(finiteOptionalNumber(0),0);
  assert.equal(finiteOptionalNumber('0'),0);
  assert.equal(finiteOptionalNumber(' 12.5 '),12.5);
  assert.equal(finiteOptionalNumber(Number.NaN),null);
  assert.equal(finiteOptionalNumber(Number.POSITIVE_INFINITY),null);
});

test('Cliente 360 never converts absent wearable, wellbeing or proof values into zero',()=>{
  const {wearableMetric,wellbeingValue,proofMetric}=__client360Internals;

  assert.equal(wearableMetric({wearable:{metrics:{steps:null}}},'steps'),'Sin dato');
  assert.equal(wearableMetric({wearable:{metrics:{steps:''}}},'steps'),'Sin dato');
  assert.equal(wearableMetric({wearable:{metrics:{steps:0}}},'steps'),'0');

  assert.equal(wellbeingValue({checkinAverage:{energy:undefined}},'energy'),'Sin dato');
  assert.equal(wellbeingValue({checkinAverage:{energy:''}},'energy'),'Sin dato');
  assert.equal(wellbeingValue({checkinAverage:{energy:0}},'energy'),'0/10');

  const missing=proofMetric({
    history:[
      {at:'2026-09-01T10:00:00.000Z',maxLoadKg:null},
      {at:'2026-09-08T10:00:00.000Z',maxLoadKg:''},
    ],
    loadTrend:{direction:'increasing'},
  });
  assert.equal(missing,null);

  const explicitZero=proofMetric({
    history:[
      {at:'2026-09-01T10:00:00.000Z',maxLoadKg:0},
      {at:'2026-09-08T10:00:00.000Z',maxLoadKg:'0'},
    ],
    loadTrend:{direction:'flat'},
  });
  assert.equal(explicitZero.key,'maxLoadKg');
  assert.deepEqual(explicitZero.points.map((point)=>point.value),[0,0]);
});

test('chart and longitudinal layers omit absent values but retain real zero',()=>{
  const {chartPoint}=__echartsElementInternals;
  assert.equal(chartPoint({date:'2026-09-01',value:null}),null);
  assert.equal(chartPoint({date:'2026-09-01',value:''}),null);
  assert.deepEqual(
    chartPoint({date:'2026-09-01',value:0}),
    {date:'2026-09-01',value:0},
  );

  const {
    percent,
    numberText,
    chartReferenceAttributes,
  }=__longitudinalUiInternals;

  assert.equal(percent(null),'—');
  assert.equal(percent(undefined),'—');
  assert.equal(percent(''),'—');
  assert.equal(percent(0),'0 %');
  assert.equal(numberText(null),'—');
  assert.equal(numberText(0),'0');

  assert.equal(
    chartReferenceAttributes({d28:{average:null},comparison:null,professional:false}),
    '',
  );
  assert.match(
    chartReferenceAttributes({d28:{average:0},comparison:null,professional:false}),
    /data-reference-value="0"/u,
  );
});

test('progress route renders missing wellbeing and sleep as missing while keeping explicit zero',()=>{
  const html=renderProgressRoute({
    role:'coach',
    summary:{
      days:28,
      dataQuality:'alta',
      adherence:null,
      completedSessions:0,
      plannedSessions:0,
      averageRpe:null,
      volume:null,
      iriCurrent:null,
      iriDelta:null,
      evolution:null,
      iri2:null,
      checkins:1,
      checkinAverage:{
        energy:5,
        sleep:null,
        stress:undefined,
        pain:'',
        fatigue:0,
        motivation:7,
      },
      wearable:{
        metrics:{
          steps:null,
          activeMinutes:null,
          sleepMinutes:null,
          restingHeartRate:null,
        },
        providers:['apple_health'],
        daysWithData:1,
        latestDate:'2026-09-12',
        freshness:'reciente',
        quality:'alta',
      },
      unconfirmedExecutions:0,
      volumeDelta:null,
      lastExecutionAt:null,
    },
    signal:{label:'Al día',level:'neutral'},
    timeline:[],
    longitudinal:null,
    alerts:[],
    planExecution:null,
    exerciseProgress:{totalExercises:0,exercises:[]},
  });

  assert.match(html,/<span>Sueño<\/span><strong>Sin dato<\/strong>/u);
  assert.match(html,/<span>Estrés<\/span><strong>Sin dato<\/strong>/u);
  assert.match(html,/<span>Dolor<\/span><strong>Sin dato<\/strong>/u);
  assert.match(html,/<span>Fatiga<\/span><strong>0\/10<\/strong>/u);
  assert.match(html,/<span>Sueño de dispositivo<\/span><strong>Sin dato<\/strong>/u);
  assert.doesNotMatch(html,/<span>Sueño<\/span><strong>0\/10<\/strong>/u);
  assert.doesNotMatch(html,/<span>Sueño de dispositivo<\/span><strong>0 h\/día<\/strong>/u);
});
