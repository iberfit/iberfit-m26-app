import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('exercise imagery uses one canonical non-cropping 4:5 framing contract',async()=>{
  const [primitives,role,review]=await Promise.all([
    read('src/m26/design/primitives.css'),
    read('src/m26/design/role-surfaces.css'),
    read('src/m26/admin/media-review.css'),
  ]);
  assert.match(primitives,/\.m26-exercise-media-image\{[\s\S]*aspect-ratio:4\/5[\s\S]*object-fit:contain[\s\S]*object-position:50% 50%/u);
  assert.match(primitives,/\.m26-library-card \.m26-exercise-media-image,[\s\S]*\.m26-session-builder \.m26-exercise-media-image,[\s\S]*\.m26-session-live \.m26-exercise-media-image/u);
  assert.doesNotMatch(role,/\.m26-session-live-v2 \.m26-session-live-context > \.m26-exercise-media\{[^}]*overflow:hidden/u);
  assert.match(role,/\.m26-session-live-v2 \.m26-session-live-context > \.m26-exercise-media\{[\s\S]*max-height:none;[\s\S]*overflow:visible/u);
  assert.match(review,/\.m26-media-review-phase img[^}]*object-fit:contain/u);
  assert.match(review,/\.m26-media-inventory-thumb[^}]*aspect-ratio:4\/5[^}]*object-fit:contain/u);
  assert.doesNotMatch(review,/object-fit:cover/u);
});

test('exercise media framing remains responsive without horizontal overflow pressure',async()=>{
  const primitives=await read('src/m26/design/primitives.css');
  assert.match(primitives,/grid-template-columns:repeat\(auto-fit,minmax\(min\(10rem,100%\),1fr\)\)/u);
  assert.match(primitives,/@media\(max-width:520px\)[\s\S]*\.m26-exercise-media-frames\{[\s\S]*grid-template-columns:1fr/u);
  assert.match(primitives,/@media\(forced-colors:active\)[\s\S]*\.m26-exercise-media-image/u);
});
