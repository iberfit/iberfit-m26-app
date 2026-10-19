import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderHeartRateSparkline} from '../src/m26/workflows/session-ui.js';

test('SIGNATURE U15: FC no confunde ausencias, ceros o lecturas inválidas con muestras reales',()=>{
  const points=[
    {bpm:112}, {bpm:null}, {bpm:' '}, {bpm:0}, {bpm:Infinity},
    {bpm:NaN}, {bpm:136}, {bpm:undefined}, null,
  ];
  const before=structuredClone(points.filter((p)=>p&&Number.isFinite(p.bpm)));
  const html=renderHeartRateSparkline(points);
  assert.match(html,/m26-live-hr-chart/u);
  assert.match(html,/points="0,34 100,4"/u);
  assert.match(html,/de 112 a 136 lpm/u);
  assert.match(html,/<span>112 lpm<\/span><span>136 lpm<\/span>/u);
  assert.doesNotMatch(html,/NaN|Infinity|<span>0 lpm/u);
  assert.deepEqual(points.filter((p)=>p&&Number.isFinite(p.bpm)),before);
});

test('SIGNATURE U15: sin dos muestras válidas muestra vacío, nunca un gráfico engañoso',()=>{
  for(const points of [[],null,{},[{bpm:118}],[{bpm:null},{bpm:0},{bpm:undefined}], [{bpm:' '},{bpm:125}]]){
    const html=renderHeartRateSparkline(points);
    assert.match(html,/cobertura suficiente/u);
    assert.doesNotMatch(html,/<svg|NaN|Infinity/u);
  }
});

test('SIGNATURE U15: conserva medidas genuinas y dibuja progresos estables',()=>{
  const html=renderHeartRateSparkline([{bpm:90},{bpm:90},{bpm:120}]);
  assert.match(html,/points="0,34 50,34 100,4"/u);
  assert.match(html,/de 90 a 120 lpm/u);
  assert.match(renderHeartRateSparkline([{bpm:110},{bpm:110}]),/points="0,34 100,34"/u);
  assert.match(renderHeartRateSparkline([{bpm:'95'},{bpm:'105'}]),/de 95 a 105 lpm/u);
});

test('SIGNATURE U15: native session summary remains a touch-activated list-item, not a flex container',()=>{
  const css=fs.readFileSync('src/m26/design/premium-ux.css','utf8');
  assert.match(css,/\.m26-session-preview-disclosure>summary\{display:list-item;position:relative;/u);
  assert.match(css,/\.m26-session-preview-disclosure>summary:after\{[^}]*pointer-events:none/u);
  assert.doesNotMatch(css,/\.m26-session-preview-disclosure>summary\{display:flex;/u);
});
