import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {renderLibraryExerciseCard} from '../src/m26/library/exercise-media-ui.js';

const viewerCss=await readFile(new URL('../src/m26/library/exercise-media-viewer.css',import.meta.url),'utf8');
const indexHtml=await readFile(new URL('../public/m26/index.html',import.meta.url),'utf8');
const swSource=await readFile(new URL('../public/m26/sw.js',import.meta.url),'utf8');
const uiSource=await readFile(new URL('../src/m26/library/exercise-media-ui.js',import.meta.url),'utf8');

const exercise={
  id:'IBF-TEST-VIEWER',
  name_es:'Dominada pronada',
  pattern:'tracción vertical',
  equipment:'barra fija',
  difficulty:'media',
  primary_muscles:['dorsales'],
  secondary_muscles:['bíceps'],
  instructions_es:['Inicia con control escapular.'],
  precautions:[],
};

function approvedManifest(imagePaths=['/public/iberfit/exercises/images/IBF-TEST-VIEWER/main.webp']){
  return {
    schemaVersion:1,
    source:{provider:'IBERFIT'},
    items:[{
      exercise_id:'IBF-TEST-VIEWER',
      name_es:'Dominada pronada',
      review_status:'approved',
      published:true,
      coach_visible:true,
      client_visible:true,
      image_mode:imagePaths.length>1?'start_peak':'main',
      image_paths:imagePaths,
    }],
  };
}

test('library cards expose an explicit accessible large-view trigger only when trusted media resolves',()=>{
  const html=renderLibraryExerciseCard(exercise,approvedManifest(),{role:'coach'});
  assert.match(html,/<m26-exercise-media-viewer>/);
  assert.match(html,/type="button" class="m26-exercise-media-open"/);
  assert.match(html,/data-exercise-media-open/);
  assert.match(html,/aria-label="Ver Dominada pronada en grande"/);
  assert.match(html,/>Ver en grande<\/span>/);

  const withoutMedia=renderLibraryExerciseCard(exercise,approvedManifest([]),{role:'coach'});
  assert.doesNotMatch(withoutMedia,/data-exercise-media-open/);
  assert.match(withoutMedia,/Sin referencia visual/);
});

test('two-phase exercises keep both phase references available to the same viewer trigger',()=>{
  const html=renderLibraryExerciseCard(exercise,approvedManifest([
    '/public/iberfit/exercises/images/IBF-TEST-VIEWER/start.webp',
    '/public/iberfit/exercises/images/IBF-TEST-VIEWER/peak.webp',
  ]),{role:'coach'});
  assert.equal((html.match(/m26-exercise-media-image/g)||[]).length,2);
  assert.equal((html.match(/data-exercise-media-open/g)||[]).length,1);
  assert.match(html,/Posición inicial/);
  assert.match(html,/Posición final/);
});

test('viewer implementation is lazy, singleton, native-dialog based and restores focus',()=>{
  assert.match(uiSource,/const viewerState=\{dialog:null,opener:null,stylePromise:null\}/);
  assert.match(uiSource,/documentLike\.createElement\('dialog'\)/);
  assert.match(uiSource,/typeof dialog\.showModal==='function'/);
  assert.match(uiSource,/dialog\.addEventListener\('close'/);
  assert.match(uiSource,/opener\?\.isConnected/);
  assert.match(uiSource,/opener\.focus\?\.\(\{preventScroll:true\}\)/);
  assert.match(uiSource,/if\(event\.target===dialog\)closeExerciseMediaViewer\(\)/);
  assert.match(uiSource,/No fue posible cargar esta referencia visual\./);
});

test('viewer stylesheet stays out of global elevation, loads on demand and remains offline-cached',()=>{
  assert.doesNotMatch(indexHtml,/exercise-media-viewer\.css/);
  assert.doesNotMatch(indexHtml,/data-iberfit-exercise-media-viewer-style/);
  assert.match(uiSource,/const VIEWER_STYLE_HREF='\/src\/m26\/library\/exercise-media-viewer\.css'/);
  assert.match(uiSource,/function ensureExerciseMediaViewerStyle\(/);
  assert.match(uiSource,/documentLike\.createElement\('link'\)/);
  assert.match(uiSource,/data-iberfit-exercise-media-viewer-style/);
  assert.match(uiSource,/await ensureExerciseMediaViewerStyle\(documentLike\)/);
  assert.match(uiSource,/VIEWER_STYLE_TIMEOUT_MS=1200/);
  assert.match(swSource,/\/src\/m26\/library\/exercise-media-viewer\.css/);
  assert.match(viewerCss,/object-fit:contain/);
  assert.match(viewerCss,/aspect-ratio:4\/5/);
  assert.match(viewerCss,/min-width:44px/);
  assert.match(viewerCss,/min-height:44px/);
  assert.match(viewerCss,/safe-area-inset-top/);
  assert.match(viewerCss,/safe-area-inset-bottom/);
  assert.match(viewerCss,/@media\(max-width:719px\)/);
  assert.match(viewerCss,/width:100vw/);
  assert.match(viewerCss,/height:100dvh/);
});
