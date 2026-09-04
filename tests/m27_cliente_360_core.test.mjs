import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const runtime=read('src/m26/ui/client-360.js');
const shellController=read('src/m26/shell/shell-controller.js');

test('Cliente 360 se activa desde el render canónico sin observadores globales',()=>{
  assert.match(shellController,/import \{enhanceCliente360\} from '\.\.\/ui\/client-360\.js'/u);
  assert.match(shellController,/enhanceCliente360\(\{root,viewModel,state\}\)/u);
  assert.doesNotMatch(runtime,/MutationObserver/u);
  assert.doesNotMatch(runtime,/setInterval|setTimeout/u);
});

test('Cliente 360 reutiliza progreso confirmado y no crea otra fuente de verdad',()=>{
  assert.match(runtime,/computeProgressSummary/u);
  assert.match(runtime,/deriveAdherenceAlerts/u);
  assert.match(runtime,/adherenceSignal/u);
  assert.match(runtime,/summary\.adherence/u);
  assert.match(runtime,/summary\.averageRpe/u);
  assert.match(runtime,/summary\.volumeDelta/u);
  assert.match(runtime,/summary\.iriCurrent/u);
  assert.match(runtime,/checkinAverage/u);
  assert.match(runtime,/summary\.wearable/u);
  assert.doesNotMatch(runtime,/supabase|service[_-]?role|rpc\(|fetch\(/iu);
});

test('Cliente 360 presenta una vista integral en español y sin puntuación global',()=>{
  assert.match(runtime,/IBERFIT · Cliente 360/u);
  assert.match(runtime,/Recuperación y bienestar/u);
  assert.match(runtime,/Actividad de dispositivos/u);
  assert.match(runtime,/Calidad del dato/u);
  assert.match(runtime,/Sin puntuación global|no crea una puntuación global/iu);
  assert.match(runtime,/Ver planificación/u);
  assert.match(runtime,/Registrar bienestar/u);
  assert.match(runtime,/Consultar informes/u);
  assert.doesNotMatch(runtime,/Athlete|Dashboard|Coach|Wearables?/u);
});

test('Cliente 360 conserva navegación existente y hace real la etiqueta inferior',()=>{
  assert.match(runtime,/data-m26-area/u);
  assert.match(runtime,/bottomLabel\.textContent='Cliente 360'/u);
  assert.match(runtime,/data-client-bottom-nav-route="progreso"/u);
  for(const area of ['planificacion','sesion','actividad','iri','informes']){
    assert.match(runtime,new RegExp(`'${area}'`,'u'));
  }
});
