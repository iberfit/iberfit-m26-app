import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatConnected360ProductionSummary} from '../src/m26/wearables/v46-production-summary.js';

const empty=()=>({ok:true,provider:'health_connect',heartRateDaily:[],exerciseEvidence:[]});

test('initial Client screen never invents a wearable measurement before consent',()=>{
  const message=formatConnected360ProductionSummary(empty());
  assert.match(message,/Todavía no hay mediciones sincronizadas/u);
  assert.match(message,/permisos de Android/u);
  assert.doesNotMatch(message,/Sincronización automática completada/u);
});

test('workouts without general pulse are visible but never count as confirmed IBERFIT sessions',()=>{
  const message=formatConnected360ProductionSummary({...empty(),exerciseEvidence:[{sport:'running'}]});
  assert.match(message,/Sin frecuencia cardíaca general registrada/u);
  assert.match(message,/Actividades observadas \(7 días\): 1/u);
  assert.match(message,/No son entrenamientos confirmados/u);
  assert.match(message,/origen físico del reloj no está verificado/u);
});

test('only bounded known fields display, without untrusted tags or device identity',()=>{
  const message=formatConnected360ProductionSummary({...empty(),
    heartRateDaily:[
      {date:'2026-10-11',samples:20,minBpm:60,maxBpm:130},
      {date:'2026-10-12',samples:7821,minBpm:55,maxBpm:175,
        deviceId:'watch-secret',sourceKey:'<script>alert(1)</script>'},
    ],
    exerciseEvidence:[{sport:'running',deviceId:'watch-secret'}],
  });
  assert.match(message,/FC general del 2026-10-12 · 7821 mediciones/u);
  assert.match(message,/55–175 lpm/u);
  assert.match(message,/FC general no equivale a FC en reposo/u);
  assert.doesNotMatch(message,/watch-secret|script|restingHeartRate|clínico/iu);
});

test('invalid counts and pulse values never become plausible measurements',()=>{
  const message=formatConnected360ProductionSummary({...empty(),
    heartRateDaily:[{date:'2026-10-12',samples:'7821',minBpm:-2,maxBpm:800}],
  });
  assert.match(message,/FC general del 2026-10-12/u);
  assert.doesNotMatch(message,/7821|800|–2 lpm/u);
});

test('invalid server summary fails closed instead of showing a healthy sync',()=>{
  for(const value of [null,{},'bad',{...empty(),ok:false},
    {...empty(),provider:'apple_health'},
    {...empty(),heartRateDaily:null},{...empty(),exerciseEvidence:null}]){
    assert.throws(()=>formatConnected360ProductionSummary(value),/M26_V46_PROD_SUMMARY_INVALID/u);
  }
});

test('post-sync Client history refresh fences stale owner and older responses',()=>{
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(controller,/if\(result\?\.ok===true\)\{/u);
  assert.match(controller,/void refreshProductionSummary\(wrap\)/u);
  assert.match(controller,/const requestEpoch=\+\+productionSummaryEpoch/u);
  assert.match(controller,/requestEpoch===productionSummaryEpoch/u);
  assert.match(controller,/expected\.ownerId===current\.ownerId&&expected\.clientId===current\.clientId/u);
  assert.match(controller,/productionSummaryEpoch\+=1/u);
  assert.match(controller,/target\.textContent=formatConnected360ProductionSummary\(response\)/u);
  assert.match(controller,/Datos existentes se conservan|Los datos existentes se conservan/u);
});
