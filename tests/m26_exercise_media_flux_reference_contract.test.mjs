import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const generator=await readFile(new URL('../scripts/exercise-media/auto-factory-generate.mjs',import.meta.url),'utf8');
const helper=await readFile(new URL('../scripts/exercise-media/prepare-model-reference.py',import.meta.url),'utf8');

test('Flux multi-reference inputs are normalized below 512x512 before generation',()=>{
  assert.match(generator,/MAX_MODEL_REFERENCE_DIMENSION=511/);
  assert.match(generator,/prepareModelReference\(/);
  assert.match(generator,/prepare-model-reference\.py/);
  assert.match(generator,/athleteModelRef/);
  assert.match(generator,/continuityModelRef/);
  assert.match(generator,/input_image_0.*athleteModelRef/s);
  assert.match(generator,/input_image_1.*continuityModelRef/s);
  assert.match(helper,/MAX_DIMENSION = 511/);
  assert.match(helper,/args\.max_size >= 512/);
  assert.match(helper,/width >= 512 or height >= 512/);
});

test('full-resolution START remains the QA source while only its derivative reaches Flux',()=>{
  assert.match(generator,/startFile:continuityRef/);
  assert.match(generator,/continuity_source_sha256/);
  assert.match(generator,/continuity_model_reference_sha256/);
  assert.match(generator,/reference_max_dimension:MAX_MODEL_REFERENCE_DIMENSION/);
});
