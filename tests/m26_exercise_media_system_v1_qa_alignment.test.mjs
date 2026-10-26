import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const contract=JSON.parse(read('scripts/exercise-media/contract.json'));
const visual=contract.media_contract.visual_system;
const composer=read('scripts/exercise-media/compose-system-v1-auto.py');
const auto=read('scripts/exercise-media/auto-factory-qa.mjs');
const standalone=read('scripts/exercise-media/qa-system-v1.mjs');
const spec=read('scripts/exercise-media/EXERCISE_MEDIA_SYSTEM_V1.md');

test('Exercise Media visual QA uses the single canonical upper-right anatomy inset',()=>{
  assert.equal(visual.anatomy_inset.preferred_corner,'upper-right');
  assert.match(composer,/ANATOMY_X,ANATOMY_Y=MASTER_W-ANATOMY_W-36,42/u);
  assert.match(composer,/'corner':'upper-right'/u);
  for(const reviewer of [auto,standalone]){
    assert.match(reviewer,/anatomy_upper_right/u);
    assert.match(reviewer,/upper-right/u);
    assert.doesNotMatch(reviewer,/anatomy_upper_left|upper-left/u);
  }
  assert.match(spec,/8\. anatomy inset present, upper-right/u);
});

test('Both reviewers require only two deterministic compositor labels; reject all extra text',()=>{
  assert.equal(visual.phase_labels_in_pixels,true);
  assert.deepEqual(visual.allowed_embedded_text,['Inicio','Final']);
  assert.match(composer,/draw_phase_label\(rgba,'Inicio',0\);draw_phase_label\(rgba,'Final',PANEL_W\)/u);
  for(const reviewer of [auto,standalone]){
    assert.match(reviewer,/only_approved_phase_labels/u);
    assert.match(reviewer,/Inicio/u);
    assert.match(reviewer,/Final/u);
    assert.doesNotMatch(reviewer,/no_baked_text|NO baked Inicio\/Final|no text labels/u);
  }
  assert.match(spec,/10\. exactly the deterministic compositor labels/u);
});

test('Fail-closed mechanics, muscle checks, confidence and human approval are not weakened',()=>{
  assert.match(auto,/muscle_target_match/u);
  assert.match(standalone,/muscle_target_match/u);
  assert.match(auto,/minConfidence=inferred\?0\.985:0\.97/u);
  assert.match(auto,/if\(!pass\)process\.exit\(2\)/u);
  assert.match(standalone,/MIN_CONFIDENCE=0\.92/u);
  assert.match(standalone,/human_approval_required:true,publishable:false/u);
  assert.match(auto,/if\(mode==='biomechanics'&&hardSupport\)/u);
});
