import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createExerciseMediaBundle,
  loadExerciseMediaMap,
  resolveExerciseMedia,
  validateIberfitExerciseMediaMap,
} from '../src/m26/library/exercise-media.js';
import {renderExerciseMedia} from '../src/m26/library/exercise-media-ui.js';

const read=(file)=>fs.readFileSync(file,'utf8');
const json=(file)=>JSON.parse(read(file));
const repdb=json('public/vendor/repdb/iberfit-canonical-media-map-v1.json');
const iberfit=json('public/iberfit/exercises/iberfit-exercise-media-v1.json');
const fallback=repdb.items.find((item)=>item.client_visible&&item.image_paths?.length);

function ownedItem(overrides={}){
  return {
    exercise_id:fallback.iberfit_id,
    name_es:'Ejercicio IBERFIT',
    image_mode:'start_peak',
    image_paths:[
      `/public/iberfit/exercises/images/${fallback.iberfit_id}/start.webp`,
      `/public/iberfit/exercises/images/${fallback.iberfit_id}/peak.webp`,
    ],
    review_status:'approved',
    published:true,
    coach_visible:true,
    client_visible:true,
    ...overrides,
  };
}

function ownedMap(items){
  return {...iberfit,items,summary:{approved:items.length,published:items.length,pending:0}};
}

test('RC45.5 registra un mapa IBERFIT vacío y válido antes de publicar imágenes',()=>{
  assert.equal(validateIberfitExerciseMediaMap(iberfit),iberfit);
  assert.equal(iberfit.source.provider,'IBERFIT');
  assert.equal(iberfit.policy.automaticPublication,false);
  assert.deepEqual(iberfit.items,[]);
});

test('RC45.5 conserva RepDB como fallback autorizado mientras no existe imagen propia',()=>{
  const media=resolveExerciseMedia(createExerciseMediaBundle({iberfit,repdb}),fallback.iberfit_id,{role:'client'});
  assert.equal(media.provider,'RepDB');
  assert.equal(media.owned,false);
  assert.ok(media.attribution);
});

test('RC45.5 prioriza una imagen IBERFIT aprobada y publicada',()=>{
  const map=ownedMap([ownedItem()]);
  const media=resolveExerciseMedia(createExerciseMediaBundle({iberfit:map,repdb}),fallback.iberfit_id,{role:'client'});
  assert.equal(media.provider,'IBERFIT');
  assert.equal(media.owned,true);
  assert.equal(media.attribution,null);
  assert.equal(media.mode,'start_peak');
  assert.equal(media.images.length,2);
});

test('RC45.5 falla cerrado y vuelve a RepDB si la imagen propia no está aprobada o publicada',()=>{
  for(const item of [
    ownedItem({review_status:'technical_review'}),
    ownedItem({published:false}),
    ownedItem({client_visible:false}),
    ownedItem({image_paths:['https://example.com/unsafe.webp']}),
  ]){
    const media=resolveExerciseMedia(createExerciseMediaBundle({iberfit:ownedMap([item]),repdb}),fallback.iberfit_id,{role:'client'});
    assert.equal(media.provider,'RepDB');
  }
});

test('RC45.5 no muestra crédito RepDB sobre una imagen propia',()=>{
  const exercise={id:fallback.iberfit_id,name_es:'Ejercicio IBERFIT'};
  const ownHtml=renderExerciseMedia({manifest:createExerciseMediaBundle({iberfit:ownedMap([ownedItem()]),repdb}),exercise,role:'client',showCredit:true});
  assert.match(ownHtml,/data-exercise-media-source="IBERFIT"/);
  assert.doesNotMatch(ownHtml,/RepDB \(repdb\.co\)/);
  const fallbackHtml=renderExerciseMedia({manifest:createExerciseMediaBundle({iberfit,repdb}),exercise,role:'client',showCredit:true});
  assert.match(fallbackHtml,/data-exercise-media-source="RepDB"/);
  assert.match(fallbackHtml,/RepDB \(repdb\.co\)/);
});

test('RC45.5 carga ambos mapas y tolera que uno de ellos no esté disponible',async()=>{
  const fetchBoth=async(url)=>({ok:true,json:async()=>url.includes('/iberfit/')?iberfit:repdb});
  const both=await loadExerciseMediaMap({fetchImpl:fetchBoth});
  assert.equal(both.iberfit.source.provider,'IBERFIT');
  assert.equal(both.repdb.source.provider,'RepDB');
  const onlyRepdb=await loadExerciseMediaMap({fetchImpl:async(url)=>url.includes('/iberfit/')?{ok:false,status:404}:{ok:true,json:async()=>repdb}});
  assert.equal(onlyRepdb.iberfit,null);
  assert.equal(onlyRepdb.repdb.source.provider,'RepDB');
});

test('RC45.5 prepara PWA, caché y build para medios propios progresivos',()=>{
  const sw=read('public/m26/sw.js');
  const headers=read('public/m26/_headers');
  const build=read('scripts/build_rc29_prepublication_candidate.mjs');
  const runtimeBuild=read('scripts/generate_rc35_runtime_config.mjs');
  assert.match(sw,/iberfit-exercise-media-v1\.json/);
  assert.ok(sw.includes('iberfit\\/exercises\\/images')||sw.includes('/public/iberfit/exercises/images/'));
  const appShell=sw.match(/const APP_SHELL=\[(.*?)\];/s)?.[1]||'';
  assert.doesNotMatch(appShell,/\.webp/);
  assert.match(headers,/\/public\/iberfit\/exercises\/images\/\*/);
  assert.match(headers,/max-age=31536000, immutable/);
  assert.match(build,/IBERFIT_MEDIA_MAP_PATH/);
  assert.match(build,/iberfitMediaPackaged/);
  assert.match(runtimeBuild,/IBERFIT_MEDIA_MAP_PATH/);
  assert.match(runtimeBuild,/iberfitMediaPackaged/);
});
