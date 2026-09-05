import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const uiUrl=new URL('../src/m26/data-experience/longitudinal-ui.js',import.meta.url);

async function source(){
  return readFile(uiUrl,'utf8');
}

function nextStepBlock(ui){
  const start=ui.indexOf('function metricNextStepCopy');
  const end=ui.indexOf('function chartPayload',start);
  assert.ok(start>=0&&end>start,'Bloque de siguiente paso no localizado');
  return ui.slice(start,end);
}

test('RC74.17b mantiene una única Prueba de Progreso canónica',async()=>{
  const ui=await source();
  assert.doesNotMatch(ui,/Proof of Progress|¿Estoy progresando\?/);
  assert.match(ui,/function metricNextStepCopy/);
});

test('RC74.17b cada gráfica cliente añade interpretación accionable sin puntuar el progreso',async()=>{
  const ui=await source();
  const block=nextStepBlock(ui);
  assert.match(ui,/class="m26-data-next-step"/);
  assert.match(ui,/metricNextStepCopy\(comparison,key\)/);
  assert.match(block,/Siguiente paso:/);
  assert.match(block,/reúne más días confirmados/);
  assert.match(block,/revisa este cambio con tu entrenador/);
  assert.doesNotMatch(block,/puntuación|mejoraste|empeoraste|éxito|fracaso|good|bad/i);
});

test('RC74.17b VFC permanece fail-closed cuando el método no es comparable',async()=>{
  const ui=await source();
  const block=nextStepBlock(ui);
  assert.match(block,/key==='hrvMs'&&!comparison\?\.comparable/);
  assert.match(block,/método de VFC homogéneo/);
});

test('RC74.17b no introduce comandos ni escritura desde la experiencia longitudinal',async()=>{
  const ui=await source();
  const block=nextStepBlock(ui);
  assert.doesNotMatch(block,/commandBus|EJECUCION_|SESION_|localStorage|sessionStorage|fetch\(|supabase|service[_-]?role/i);
  assert.match(ui,/cada tarjeta explica el cambio disponible y el siguiente paso/);
});
