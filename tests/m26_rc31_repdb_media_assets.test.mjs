import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';

import {
  REPDB_MEDIA_ATTRIBUTION,
  resolveExerciseMedia,
  validateExerciseMediaMap,
} from '../src/m26/library/exercise-media.js';

const root=process.cwd();
const publicRoot=path.join(root,'public');
const manifestPath=path.join(publicRoot,'vendor','repdb','iberfit-media-map-v2.json');
const freeEsPath=path.join(publicRoot,'vendor','repdb','free.es.json');
const freeCanonicalPath=path.join(publicRoot,'vendor','repdb','free.json');

const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const freeEs=JSON.parse(await readFile(freeEsPath,'utf8'));
const freeCanonical=JSON.parse(await readFile(freeCanonicalPath,'utf8'));

test('el paquete RepDB contiene solo el snapshot gratuito autorizado',async()=>{
  assert.equal(freeEs.exercises.length,400);
  assert.equal(manifest.source.provider,'RepDB');
  assert.equal(manifest.source.exerciseCount,400);
  assert.equal(manifest.items.length,3240);

  await assert.rejects(
    stat(path.join(publicRoot,'vendor','repdb','upgrade-samples')),
  );
});

test('los alias visuales canónicos se respetan',()=>{
  const source=freeCanonical.exercises.find((item)=>item.id==='barbell-lunge');
  const mapped=manifest.items.find((item)=>item.repdb_id==='barbell-lunge');

  assert.equal(source.image_alias,'barbell-reverse-lunge');
  assert.deepEqual(mapped.image_paths,[
    '/vendor/repdb/images/flat/barbell-reverse-lunge-start.webp',
    '/vendor/repdb/images/flat/barbell-reverse-lunge-peak.webp',
  ]);
});

test('la atribución obligatoria queda conservada',()=>{
  validateExerciseMediaMap(manifest);
  assert.deepEqual(REPDB_MEDIA_ATTRIBUTION,{
    text:'Exercise data by RepDB (repdb.co)',
    url:'https://repdb.co/free-exercise-dataset',
  });
});

test('todas las rutas declaradas existen dentro de public',async()=>{
  const paths=new Set();

  for(const item of manifest.items){
    for(const mediaPath of item.image_paths||[]){
      assert.match(
        mediaPath,
        /^\/vendor\/repdb\/images\/flat\/[a-z0-9-]+-(?:main|start|peak)\.webp$/,
      );
      paths.add(mediaPath);
    }
  }

  assert.ok(paths.size>0);

  for(const mediaPath of paths){
    const file=path.join(publicRoot,mediaPath.replace(/^\//,''));
    const info=await stat(file);
    assert.ok(info.isFile());
    assert.ok(info.size>100);
  }
});

test('Cliente solo recibe coincidencias aprobadas A o B',()=>{
  for(const item of manifest.items){
    if(!item.client_visible)continue;
    assert.match(item.quality,/^[AB] · /);
    assert.equal(item.coach_visible,true);
    assert.ok(item.repdb_id);
    assert.ok(item.image_paths.length>=1);
  }
});

test('las candidatas C nunca se entregan al Cliente',()=>{
  for(const item of manifest.items.filter((entry)=>entry.quality.startsWith('C · '))){
    assert.equal(item.client_visible,false);
  }
});

test('la resolución de medios falla cerrada según el rol',()=>{
  const approved=manifest.items.find((item)=>item.client_visible===true);
  const hidden=manifest.items.find(
    (item)=>item.coach_visible!==true&&item.client_visible!==true,
  );

  assert.ok(approved);
  assert.ok(hidden);

  assert.ok(resolveExerciseMedia(manifest,approved.iberfit_id,{role:'cliente'}));
  assert.ok(resolveExerciseMedia(manifest,approved.iberfit_id,{role:'coach'}));

  const coachOnlyManifest={
    ...manifest,
    items:manifest.items.map((item)=>
      item.iberfit_id===approved.iberfit_id
        ?{...item,coach_visible:true,client_visible:false}
        :item,
    ),
  };

  assert.equal(
    resolveExerciseMedia(coachOnlyManifest,approved.iberfit_id,{role:'cliente'}),
    null,
  );
  assert.ok(
    resolveExerciseMedia(coachOnlyManifest,approved.iberfit_id,{role:'coach'}),
  );

  assert.equal(
    resolveExerciseMedia(manifest,hidden.iberfit_id,{role:'cliente'}),
    null,
  );
  assert.equal(
    resolveExerciseMedia(manifest,hidden.iberfit_id,{role:'coach'}),
    null,
  );
  assert.equal(resolveExerciseMedia(manifest,'../secreto',{role:'coach'}),null);
});

test('el branding usa solo el isotipo oficial y no modifica las imágenes',async()=>{
  const css=await readFile(
    path.join(publicRoot,'vendor','repdb','iberfit-exercise-media.css'),
    'utf8',
  );

  assert.match(css,/url\("\/isotipo-iberfit\.png"\)/);
  assert.doesNotMatch(css,/data:image|base64|IBERFIT\s*::/i);

  const logo=await stat(path.join(publicRoot,'isotipo-iberfit.png'));
  assert.ok(logo.isFile());
  assert.ok(logo.size>100);
});
