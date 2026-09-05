import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const uiUrl=new URL('../src/m26/ui/client-360.js',import.meta.url);
const engineUrl=new URL('../src/m26/engagement/progress-engine.js',import.meta.url);
const swUrl=new URL('../public/m26/sw.js',import.meta.url);

async function sources(){
  const [ui,engine,sw]=await Promise.all([
    readFile(uiUrl,'utf8'),
    readFile(engineUrl,'utf8'),
    readFile(swUrl,'utf8'),
  ]);
  return {ui,engine,sw};
}

function proofBlock(ui){
  const start=ui.indexOf('// RC74_17_PROOF_OF_PROGRESS_BEGIN');
  const end=ui.indexOf('// RC74_17_PROOF_OF_PROGRESS_END',start);
  assert.ok(start>=0&&end>start,'Bloque Proof of Progress no localizado');
  return ui.slice(start,end);
}

test('RC74.17 mantiene Cliente 360 sintácticamente válido',()=>{
  const result=spawnSync(process.execPath,['--check',uiUrl.pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('RC74.17 reutiliza el motor longitudinal canónico en Cliente 360',async()=>{
  const {ui,engine}=await sources();
  assert.match(ui,/buildExerciseLongitudinalProgress/);
  assert.match(ui,/buildExerciseLongitudinalProgress\(state,clientId,\{limitPerExercise:12\}\)/);
  assert.match(engine,/export function buildExerciseLongitudinalProgress/);
  assert.match(ui,/data-m29-proof/);
  assert.match(ui,/Prueba de progreso/);
  assert.match(ui,/Construyendo tu línea base/);
  assert.match(ui,/vs\. exposición anterior/);
});

test('RC74.17 selecciona evidencia objetiva sin convertir esfuerzo en mejora',async()=>{
  const {ui}=await sources();
  const block=proofBlock(ui);
  assert.match(block,/key:'maxLoadKg'.*trendKey:'loadTrend'/s);
  assert.match(block,/key:'bestReps'.*trendKey:'repsTrend'/s);
  assert.match(block,/key:'volumeKgReps'.*trendKey:'volumeTrend'/s);
  assert.doesNotMatch(block,/trendKey:'rpeTrend'|trendKey:'rirTrend'/);
  assert.match(block,/Esfuerzo último:/);
  assert.match(block,/sin convertirlo en una puntuación global ni atribuir causas/);
  assert.match(block,/slice\(0,3\)/);
});

test('RC74.17 grafica sólo puntos comparables y conserva ausencia como ausencia',async()=>{
  const {ui,engine}=await sources();
  const block=proofBlock(ui);
  assert.match(block,/Number\.isFinite\(point\.value\)/);
  assert.match(block,/points\.length>=2/);
  assert.match(block,/createElementNS/);
  assert.match(block,/createElementNS\(namespace,'polyline'\)/);
  assert.match(block,/Dato ausente se conserva como ausente|datos ausentes en cero/);
  assert.match(engine,/function epKnownLoadKg\(row\)/);
  assert.match(engine,/if\(!kgMatch\)return null/);
  assert.match(engine,/function epLoadLabel\(row\)/);
  assert.match(engine,/const knownKg=epKnownLoadKg\(row\)/);
  assert.match(engine,/return Number\.isFinite\(load\)&&Number\.isFinite\(rowReps\)\s*\?\s*load\*rowReps\s*:\s*null/s);
});

test('RC74.17 mantiene interpretación neutral, read-only y sin nueva superficie PWA',async()=>{
  const {ui,sw}=await sources();
  const block=proofBlock(ui);
  assert.doesNotMatch(block,/commandBus|EJECUCION_COMPLETAR|SESION_INICIAR|localStorage|sessionStorage|SUPABASE_SERVICE_ROLE|service[_-]?role/i);
  assert.doesNotMatch(block,/MutationObserver|setTimeout|setInterval|\.click\(\)/);
  assert.doesNotMatch(block,/mejoraste|empeoraste|éxito|fracaso|good|bad/i);
  assert.ok(sw.includes('"/src/m26/ui/client-360.js"'));
  assert.ok(sw.includes('"/src/m26/engagement/progress-engine.js"'));
  assert.match(ui,/Cliente 360 no crea una puntuación global ni atribuye causas/);
});
