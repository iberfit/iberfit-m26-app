import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

import {
  buildLongitudinalLineOption,
  ECHARTS_DATA_EXPERIENCE_VERSION,
} from '../src/m26/data-experience/echarts-element.js';
import {
  renderLongitudinalDataExperience,
} from '../src/m26/data-experience/longitudinal-ui.js';
import {
  buildLongitudinalAggregation,
} from '../src/m26/intelligence/longitudinal-aggregation.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function gitBlobSha1(path){
  const bytes=fs.readFileSync(path);
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex');
}

const NOW=new Date('2026-08-16T12:00:00.000Z');
const CLIENT='CLIENT-RC594';

function day(offset){
  const date=new Date(NOW);
  date.setUTCDate(date.getUTCDate()-offset);
  return date.toISOString().slice(0,10);
}

function record(offset,{
  provider='health_connect',
  hrvMs=48,
  vfcMethod='rmssd',
}={}){
  return {
    clientId:CLIENT,
    provider,
    date:day(offset),
    steps:8000-offset*5,
    activeMinutes:45,
    sleepMinutes:440,
    restingHeartRate:59,
    hrvMs,
    vfcMethod,
    activeEnergyKcal:480,
    workoutMinutes:38,
    quality:'alta',
    sourceUpdatedAt:`${day(offset)}T23:00:00.000Z`,
  };
}

function stateFixture(){
  return {
    collections:{
      wearableDailySummaries:Array.from(
        {length:90},
        (_,offset)=>record(offset)
      ),
      appointments:[
        {
          id:'A-1',
          clientId:CLIENT,
          scheduledAt:`${day(3)}T10:00:00.000Z`,
          status:'completed',
        },
      ],
      sessionExecutions:[],
      checkins:[],
      iriAssessments:[],
    },
  };
}

test('RC59.4 opción ECharts activa ARIA y mantiene una serie lineal ordinaria',()=>{
  const option=buildLongitudinalLineOption({
    points:[
      {date:'2026-08-15',value:7000},
      {date:'2026-08-16',value:8000},
    ],
    label:'Pasos',
    unit:'pasos',
  });

  assert.equal(ECHARTS_DATA_EXPERIENCE_VERSION,'6.1.0');
  assert.equal(option.aria.enabled,true);
  assert.equal(option.series.length,1);
  assert.equal(option.series[0].type,'line');
  assert.equal(option.series[0].connectNulls,false);
  assert.deepEqual(option.xAxis.data,['2026-08-15','2026-08-16']);
  assert.deepEqual(option.series[0].data,[7000,8000]);
});

test('RC59.4 renderer usa SVG, carga diferida, resize, dispose y movimiento reducido',()=>{
  const source=read('src/m26/data-experience/echarts-element.js');

  assert.match(source,/\{renderer:'svg'\}/u);
  assert.match(source,/IntersectionObserver/u);
  assert.match(source,/rootMargin:'240px 0px'/u);
  assert.match(source,/ResizeObserver/u);
  assert.match(source,/\.dispose\?\.\(\)/u);
  assert.match(source,/prefers-reduced-motion: reduce/u);
  assert.match(source,/data-chart-state','unavailable'/u);
  assert.match(
    source,
    /Gráfico no disponible\. Los mismos datos siguen disponibles en la tabla/u
  );
});

test('RC59.4 Cliente recibe lectura simple de 28 días y no densidad profesional',()=>{
  const aggregate=buildLongitudinalAggregation(
    stateFixture(),
    CLIENT,
    {now:NOW}
  );

  const html=renderLongitudinalDataExperience(
    aggregate,
    {role:'client'}
  );

  assert.match(html,/data-role-density="simple"/u);
  assert.match(html,/Tu evolución/u);
  assert.match(html,/Media 28 días/u);
  assert.match(html,/Cobertura/u);
  assert.match(html,/Ver datos del gráfico/u);
  assert.doesNotMatch(html,/7 días<\/span>/u);
  assert.doesNotMatch(html,/Regresión lineal de medias diarias/u);
});

test('RC59.4 Coach recibe 7 28 90 baseline tendencia procedencia y método',()=>{
  const aggregate=buildLongitudinalAggregation(
    stateFixture(),
    CLIENT,
    {now:NOW}
  );

  const html=renderLongitudinalDataExperience(
    aggregate,
    {role:'coach'}
  );

  assert.match(html,/data-role-density="professional"/u);
  assert.match(html,/Análisis longitudinal/u);
  assert.match(html,/7 días/u);
  assert.match(html,/28 días/u);
  assert.match(html,/90 días/u);
  assert.match(html,/Cambio vs\. 28 días previos/u);
  assert.match(html,/regresión lineal/u);
  assert.match(html,/Procedencia:/u);
  assert.match(html,/Confianza y método/u);
});

test('RC59.4 VFC mixta muestra no comparable y no fabrica tendencia',()=>{
  const state=stateFixture();
  state.collections.wearableDailySummaries.push(
    record(2,{
      provider:'apple_health',
      hrvMs:70,
      vfcMethod:'sdnn',
    })
  );

  const aggregate=buildLongitudinalAggregation(
    state,
    CLIENT,
    {now:NOW}
  );
  const html=renderLongitudinalDataExperience(
    aggregate,
    {role:'coach'}
  );

  assert.match(
    html,
    /No comparable: el método de VFC no es homogéneo/u
  );
  assert.match(
    html,
    /Tendencia no comparable por método de VFC/u
  );
  assert.doesNotMatch(html,/mejora|empeora/iu);
});

test('RC59.4 fallback tabular conserva fecha valor y calidad sin datos crudos',()=>{
  const aggregate=buildLongitudinalAggregation(
    stateFixture(),
    CLIENT,
    {now:NOW}
  );
  const html=renderLongitudinalDataExperience(
    aggregate,
    {role:'coach'}
  );

  assert.match(html,/<table>/u);
  assert.match(html,/<th>Fecha<\/th>/u);
  assert.match(html,/<th>Calidad<\/th>/u);
  assert.match(html,/alta/u);
  assert.doesNotMatch(html,/CLIENT-RC594/u);
  assert.doesNotMatch(html,/rawHeartRate|rrIntervals|token/iu);
});

test('RC59.4 UI consume agregado longitudinal y no consulta sensores ni wearables',()=>{
  const ui=read('src/m26/data-experience/longitudinal-ui.js');
  const routeVm=read('src/m26/modules/route-view-model.js');
  const routeRender=read('src/m26/modules/route-render.js');

  assert.doesNotMatch(ui,/\/wearables\/|\/telemetry\//u);
  assert.match(routeVm,/buildLongitudinalAggregation/u);
  assert.match(routeVm,/\blongitudinal,/u);
  assert.match(routeRender,/renderLongitudinalDataExperience/u);
  assert.match(
    routeRender,
    /renderLongitudinalDataExperience\(vm\.longitudinal,\{role:vm\.role\}\)/u
  );
});

test('RC59.4 vendor ECharts está fijado al blob oficial y conserva licencias',()=>{
  const files={
    js:'public/m26/vendor/echarts-6.1.0.esm.min.js',
    license:'public/m26/vendor/echarts-6.1.0.LICENSE.txt',
    notice:'public/m26/vendor/echarts-6.1.0.NOTICE.txt',
    d3:'public/m26/vendor/echarts-6.1.0.LICENSE-d3.txt',
  };

  for(const path of Object.values(files)){
    assert.equal(fs.existsSync(path),true);
  }

  assert.equal(
    gitBlobSha1(files.js),
    'b29a5c8de6871ef2599b4ca3c81f75b7bb45f555'
  );
  assert.equal(
    gitBlobSha1(files.license),
    'c633765305b658c2b42837d2b72071d73c0379c5'
  );
  assert.equal(
    gitBlobSha1(files.notice),
    'c6a6e5e43b0d3cf6524297b9fa0c346f96b70602'
  );
  assert.equal(
    gitBlobSha1(files.d3),
    '721bd22ece6587a9408eda1b6a3949c425b5624a'
  );

  assert.ok(fs.statSync(files.js).size>500_000);
  assert.match(read(files.license),/Apache License/u);
  assert.match(read(files.notice),/Apache ECharts/u);
});

test('RC59.4 runtime usa vendor same-origin sin CDN y APP_SHELL lo preserva',()=>{
  const element=read('src/m26/data-experience/echarts-element.js');
  const sw=read('public/m26/sw.js');

  assert.match(
    element,
    /ECHARTS_VENDOR_URL='\/m26\/vendor\/echarts-6\.1\.0\.esm\.min\.js'/u
  );
  assert.doesNotMatch(
    element,
    /cdn\.jsdelivr|unpkg|cdnjs|esm\.sh/iu
  );

  assert.match(
    sw,
    /"\/m26\/vendor\/echarts-6\.1\.0\.esm\.min\.js"/u
  );
  assert.match(
    sw,
    /"\/src\/m26\/data-experience\/echarts-element\.js"/u
  );
  assert.match(
    sw,
    /"\/src\/m26\/data-experience\/longitudinal-ui\.js"/u
  );
  assert.match(sw,/VERSION='m26-rc59-4'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc59-3'/u);
  assert.match(
    sw,
    /Historical compatibility markers retained[^\n]*m26-rc59-4/u
  );
});

test('RC59.4 mantiene fallback accesible y política no clínica',()=>{
  const aggregate=buildLongitudinalAggregation(
    stateFixture(),
    CLIENT,
    {now:NOW}
  );
  const html=renderLongitudinalDataExperience(
    aggregate,
    {role:'client'}
  );

  assert.match(html,/Dato → contexto → entrenador decide/u);
  assert.match(html,/no cambian automáticamente/u);
  assert.match(html,/ni constituyen una clasificación clínica/u);
  assert.match(html,/Ver datos del gráfico/u);
});

test('RC59.4 cierra Data Experience y conserva el siguiente rail de retos',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');

  assert.match(
    roadmap,
    /RC59_4=CLOSED_DATA_EXPERIENCE_ECHARTS/u
  );
  assert.match(
    roadmap,
    /RC59_5=(?:IN_PROGRESS|CLOSED)_CHALLENGE_METRICS_FOUNDATION/u
  );
  assert.match(
    roadmap,
    /RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u
  );
});
test('Premium Report Parity queda fijado como gate transversal al nivel IRI',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  const spec=read('docs/product/PREMIUM_REPORT_PARITY.md');
  const workflow=read('src/m26/workflows/report-workflow.js');
  const iri=read('src/m26/workflows/iri-report-document.js');

  assert.match(
    roadmap,
    /PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u
  );
  assert.match(spec,/Reference standard: IRI Premium/u);
  assert.match(spec,/periodic progress report/u);
  assert.match(spec,/cycle closeout report/u);
  assert.match(spec,/longitudinal 7 \/ 28 \/ 90-day report/u);
  assert.match(spec,/activity \/ device-data report/u);
  assert.match(spec,/A4\/PDF-grade output/u);
  assert.match(workflow,/format:'a4-premium'/u);
  assert.match(iri,/m26-premium-report-v2/u);
});