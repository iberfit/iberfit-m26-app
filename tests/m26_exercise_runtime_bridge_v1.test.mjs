import test from 'node:test';
import assert from 'node:assert/strict';
import {materializeDynamicIberfitMediaMap,resolveExerciseMedia} from '../src/m26/library/exercise-media.js';
import {createExerciseCatalog,mergeExerciseCatalogRecords} from '../src/m26/exercises/catalog.js';

const runtime={enabled:true,url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',publishableKey:'sb_publishable_test',version:'26.0.0-test'};
const manifest={schemaVersion:1,source:{provider:'IBERFIT',ownership:'IBERFIT'},items:[{exercise_id:'IBF-SQUAT',name_es:'Sentadilla',review_status:'approved',published:true,coach_visible:true,client_visible:true,image_mode:'main',storage_path:'IBF-SQUAT/movement.webp'}]};

test('runtime bridge convierte sólo rutas del bucket IBERFIT a URL Supabase confiable',()=>{
  const hydrated=materializeDynamicIberfitMediaMap(manifest,runtime);
  assert.equal(hydrated.items.length,1);
  const media=resolveExerciseMedia(hydrated,'IBF-SQUAT',{role:'client'});
  assert.equal(media.provider,'IBERFIT');
  assert.equal(media.mode,'main');
  assert.equal(media.images[0],'https://gjztkdwfmunnzhtvxrsu.supabase.co/storage/v1/object/public/iberfit-exercise-media/IBF-SQUAT/movement.webp');
});

test('runtime bridge rechaza origen Supabase ajeno a QA/PROD IBERFIT',()=>{
  const hydrated=materializeDynamicIberfitMediaMap(manifest,{...runtime,url:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'});
  assert.equal(hydrated,null);
});

test('catálogo remoto puede añadir ejercicios sin perder el núcleo estático',()=>{
  const base=createExerciseCatalog([{id:'IBF-A',name_es:'A',pattern:'empuje',equipment:'sin equipo',difficulty:'inicial',intent:'fuerza'}]);
  const merged=mergeExerciseCatalogRecords(base,[{id:'IBF-B',name_es:'B',pattern:'tirón',equipment:'polea',difficulty:'media',intent:'fuerza',media:{schema:'iberfit.exercise.visual.v1'}}],{mediaOrigin:runtime.url});
  assert.equal(merged.count,2);
  assert.equal(merged.has('IBF-A'),true);
  assert.equal(merged.get('IBF-B').media.deliveryOrigin,runtime.url);
});
