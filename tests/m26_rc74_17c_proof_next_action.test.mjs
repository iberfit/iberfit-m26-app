import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const uiUrl=new URL('../src/m26/ui/client-360.js',import.meta.url);

async function proofBlock(){
  const ui=await readFile(uiUrl,'utf8');
  const start=ui.indexOf('// RC74_17_PROOF_OF_PROGRESS_BEGIN');
  const end=ui.indexOf('// RC74_17_PROOF_OF_PROGRESS_END',start);
  assert.ok(start>=0&&end>start,'Bloque Proof of Progress no localizado');
  return {ui,block:ui.slice(start,end)};
}

test('RC74.17c mantiene Cliente 360 sintácticamente válido',()=>{
  const result=spawnSync(process.execPath,['--check',uiUrl.pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('RC74.17c añade un siguiente paso explícito a cada prueba comparable',async()=>{
  const {block}=await proofBlock();
  assert.match(block,/function proofNextStep\(exercise\)/);
  assert.match(block,/m29-proof-next/);
  assert.match(block,/Siguiente paso: registra otra exposición confirmada con la misma señal/);
  assert.match(block,/Siguiente paso: mantén el mismo tipo de registro en próximas sesiones y revisa la tendencia con tu entrenador/);
  assert.match(block,/cardNode\.append\(meta,createElement\(document,'p','m29-proof-next',proofNextStep\(exercise\)\)\)/);
});

test('RC74.17c hace accionable también la línea base sin inventar evidencia',async()=>{
  const {block}=await proofBlock();
  assert.match(block,/Construyendo tu línea base/);
  assert.match(block,/sin convertir datos ausentes en cero\. Siguiente paso: registra otra exposición confirmada con la misma señal/);
  assert.match(block,/points\.length>=2/);
  assert.match(block,/Number\.isFinite\(point\.value\)/);
});

test('RC74.17c conserva interpretación neutral, read-only y control humano',async()=>{
  const {block}=await proofBlock();
  assert.doesNotMatch(block,/commandBus|EJECUCION_COMPLETAR|SESION_INICIAR|localStorage|sessionStorage|fetch\(|supabase|service[_-]?role/i);
  assert.doesNotMatch(block,/mejoraste|empeoraste|éxito|fracaso|aumenta la carga|reduce la carga|cambia el entrenamiento/i);
  assert.match(block,/sin convertirlo en una puntuación global ni atribuir causas/);
  assert.match(block,/revisa la tendencia con tu entrenador/);
});

test('RC74.17c no introduce un contrato corporal especulativo en Cliente 360',async()=>{
  const {ui}=await proofBlock();
  assert.doesNotMatch(ui,/bodyFatPercent|waistCm|leanMassKg|muscleMassKg|visceralFatLevel|bodyCompositionMethod|bodyCompositionDevice/);
});
