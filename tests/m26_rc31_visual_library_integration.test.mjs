import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {resolveExerciseMedia} from '../src/m26/library/exercise-media.js';
import {renderLibraryRoute} from '../src/m26/modules/route-render.js';
import {renderSessionBuilder,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';

const root=process.cwd();
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const json=(relative)=>JSON.parse(read(relative));
const catalog=createExerciseCatalog(json('baseline_m25_2/exercise-catalog-m25.json'));
const manifest=json('public/vendor/repdb/iberfit-canonical-media-map-v1.json');

test('el mapa visual utiliza exactamente los 367 IDs canónicos IBERFIT',()=>{
  assert.equal(manifest.schemaVersion,3);
  assert.equal(manifest.items.length,367);
  assert.equal(new Set(manifest.items.map((item)=>item.iberfit_id)).size,367);
  assert.deepEqual(
    new Set(manifest.items.map((item)=>item.iberfit_id)),
    new Set(catalog.list().map((item)=>item.id)),
  );
});

test('todas las imágenes canónicas existen y usan rutas públicas same-origin',()=>{
  let paths=0;
  for(const item of manifest.items){
    for(const mediaPath of item.image_paths||[]){
      assert.match(mediaPath,/^\/public\/vendor\/repdb\/images\/flat\/[a-z0-9-]+-(?:main|start|peak)\.webp$/);
      const file=path.join(root,mediaPath.replace(/^\//,''));
      assert.equal(fs.existsSync(file),true,mediaPath);
      paths++;
    }
  }
  assert.ok(paths>0);
});

test('Cliente solo recibe A o B y las candidatas C quedan para Entrenador',()=>{
  for(const item of manifest.items){
    if(item.client_visible)assert.match(item.quality,/^[AB] · /);
    if(item.quality.startsWith('C · '))assert.equal(item.client_visible,false);
  }

  const approved=manifest.items.find((item)=>item.client_visible);
  assert.ok(approved);
  assert.ok(resolveExerciseMedia(manifest,approved.iberfit_id,{role:'client'}));

  const coachOnly=manifest.items.find((item)=>item.coach_visible&&!item.client_visible);
  if(coachOnly){
    assert.equal(resolveExerciseMedia(manifest,coachOnly.iberfit_id,{role:'client'}),null);
    assert.ok(resolveExerciseMedia(manifest,coachOnly.iberfit_id,{role:'coach'}));
  }
});

test('la biblioteca queda agrupada por músculos y muestra medios con atribución',()=>{
  const html=renderLibraryRoute({
    role:'coach',
    catalog:catalog.list(),
    mediaMap:manifest,
    total:catalog.count,
  });
  assert.match(html,/m26-library-group/);
  assert.match(html,/data-muscle-group=/);
  assert.match(html,/RepDB \(repdb\.co\)/);
  assert.match(html,/data-exercise-media=|m26-exercise-media-fallback/);
});

test('constructor, vista previa y ejecución guiada reciben el mapa visual',()=>{
  const visualItem=manifest.items.find((item)=>item.client_visible);
  assert.ok(visualItem);
  const draft=createSessionDraft({clientId:'CLI-RC31'});
  addCatalogExercise(draft,visualItem.iberfit_id,catalog,{sets:1,reps:'8'});
  let builder=renderSessionBuilder({draft,catalog,mediaMap:manifest,role:'coach'});
  assert.match(builder,/data-exercise-media=/);
  draft.previewAccepted=true;
  builder=renderSessionBuilder({draft,catalog,mediaMap:manifest,role:'coach'});
  assert.match(builder,/m26-session-preview-item/);

  const execution=createExecution({session:draft,clientId:'CLI-RC31'});
  startExecution(execution);
  const guided=renderGuidedExecution({execution,session:draft,catalog,mediaMap:manifest,role:'client'});
  assert.match(guided,/data-exercise-media=/);
  assert.match(guided,/RepDB \(repdb\.co\)/);
});

test('PWA guarda mapa e imágenes bajo demanda sin precargar las 745 imágenes',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/iberfit-canonical-media-map-v1\.json/);
  assert.match(sw,/\/public\/vendor\/repdb\//);
  assert.match(sw,/images\\\/flat|images\/flat/);
  const appShell=sw.match(/const APP_SHELL=\[(.*?)\];/s)?.[1]||'';
  assert.doesNotMatch(appShell,/\.webp/);
});

test('cabeceras de caché distinguen mapas e imágenes inmutables',()=>{
  const headers=read('public/m26/_headers');
  assert.match(headers,/\/public\/vendor\/repdb\/images\/\*/);
  assert.match(headers,/max-age=31536000, immutable/);
  assert.match(headers,/\/public\/vendor\/repdb\/\*\.json/);
  assert.match(headers,/no-cache, must-revalidate/);
});
