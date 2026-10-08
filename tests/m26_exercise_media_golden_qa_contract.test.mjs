import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../scripts/exercise-media/',import.meta.url);
const golden=JSON.parse(await readFile(new URL('golden-library-pattern-v1.json',root),'utf8'));
const composer=await readFile(new URL('compose-system-v1-auto.py',root),'utf8');
const automatic=await readFile(new URL('auto-factory-qa.mjs',root),'utf8');
const pilot=await readFile(new URL('qa-system-v1.mjs',root),'utf8');

test('Golden Pattern has exactly the approved phase labels and upper-right anatomy',()=>{
  assert.equal(golden.layout.phase_labels.required,true);
  assert.equal(golden.layout.phase_labels.start,'Inicio');
  assert.equal(golden.layout.phase_labels.final,'Final');
  assert.equal(golden.layout.phase_labels.extra_text_forbidden,true);
  assert.equal(golden.layout.anatomy_inset.corner,'upper-right');
  assert.match(composer,/ANATOMY_X,ANATOMY_Y=MASTER_W-ANATOMY_W-36,42/);
  assert.match(composer,/draw_phase_label\(rgba,'Inicio',0\);draw_phase_label\(rgba,'Final',PANEL_W\)/);
});

test('automatic QA requires labels and upper-right anatomy, forbids extra text',()=>{
  assert.match(automatic,/phase_labels_correct/);
  assert.match(automatic,/no_extra_baked_text/);
  assert.match(automatic,/anatomy_upper_right/);
  assert.match(automatic,/required small Inicio label on START and Final label on FINAL/);
  assert.doesNotMatch(automatic,/anatomy_upper_left|no_baked_text|no text labels|no exercise name, Inicio\/Final/);
  assert.match(automatic,/inferred\?0\.985:0\.97/);
  assert.match(automatic,/keys\.every\(k=>checks\[k\]===true\)/);
});

test('pilot QA shares the same strict Golden Pattern visual contract',()=>{
  assert.match(pilot,/phase_labels_correct/);
  assert.match(pilot,/no_extra_baked_text/);
  assert.match(pilot,/anatomy_upper_right/);
  assert.doesNotMatch(pilot,/anatomy_upper_left|no_baked_text|NO baked Inicio\/Final labels/);
  assert.match(pilot,/human_approval_required:true,publishable:false/);
});
