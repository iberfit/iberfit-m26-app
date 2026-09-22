import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const workflow=await readFile(new URL('../.github/workflows/exercise-media-system-v1-pilot.yml',import.meta.url),'utf8');
const generator=await readFile(new URL('../scripts/exercise-media/generate-system-v1-phase.mjs',import.meta.url),'utf8');
const composer=await readFile(new URL('../scripts/exercise-media/compose-system-v1.py',import.meta.url),'utf8');
const qa=await readFile(new URL('../scripts/exercise-media/qa-system-v1.mjs',import.meta.url),'utf8');
const contract=JSON.parse(await readFile(new URL('../scripts/exercise-media/contract.json',import.meta.url),'utf8'));
const visual=contract.media_contract.visual_system;

const targets=['IBF-DOMINADA-PRONADA','IBF-BUENOS-DIAS-CON-BARRA','IBF-APERTURAS-CON-MANCUERNAS'];

test('system v1 pilot is intentionally limited to three contrasting movement families',()=>{
  for(const id of targets){assert.match(workflow,new RegExp(id));assert.match(generator,new RegExp(id));assert.match(qa,new RegExp(id));}
  assert.doesNotMatch(workflow,/IBF-PAJAROS-CON-MANCUERNAS|IBF-PULLOVER-CON-MANCUERNA/);
});

test('pilot generates a true 1280x1600 master and deterministic 640x800 derivative without baked labels',()=>{
  assert.match(generator,/const RAW_WIDTH=1024;/);
  assert.match(generator,/const RAW_HEIGHT=1600;/);
  assert.match(composer,/MASTER_W,MASTER_H=1280,1600/);
  assert.match(composer,/DELIVERY_W,DELIVERY_H=640,800/);
  assert.doesNotMatch(composer,/draw\.text\(/);
  assert.match(composer,/'phase_labels_in_pixels':False/);
  assert.match(composer,/'embedded_text':False/);
  assert.equal(visual.phase_labels_in_pixels,false);
  assert.equal(visual.embedded_text,false);
});

test('official isotipo and anatomy placement remain locked to the current visual-system contract',()=>{
  assert.match(composer,new RegExp(visual.approved_identity_reference.official_isotipo_sha256));
  assert.match(workflow,/public\/isotipo-iberfit\.png/);
  assert.match(composer,/ANATOMY_WIDTH=180/);
  const percent=180/1280*100;
  assert.ok(percent>=visual.anatomy_inset.width_percent_min&&percent<=visual.anatomy_inset.width_percent_max);
  assert.match(composer,/'corner':'upper-left'/);
  assert.match(composer,/'style':'analytical-anatomical-plate'/);
});

test('automated QA is strict and candidates cannot self-publish',()=>{
  assert.match(qa,/const MIN_CONFIDENCE=0\.92/);
  assert.match(qa,/human_approval_required:true/);
  assert.match(qa,/publishable:false/);
  assert.match(generator,/publishable:false/);
  assert.match(composer,/'human_approval_required':True/);
  assert.match(composer,/'publishable':False/);
});

test('pilot workflow is isolated generation evidence only and never publishes media or production',()=>{
  assert.match(workflow,/pages project create/);
  assert.match(workflow,/pages project delete/);
  assert.match(workflow,/Conservar candidatos System v1/);
  assert.doesNotMatch(workflow,/publish\.mjs|publish-approved-via-broker|iberfit_finalize_exercise_media_v1|IBERFIT_ALLOW_PROD_MEDIA_PUBLISH|supabase\.co/);
});
