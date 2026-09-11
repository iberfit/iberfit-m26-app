import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');

test('fixed exercise-media template is locked to published 640x800 geometry',()=>{
  const compose=read('scripts/exercise-media/compose-fixed-template.py');
  assert.match(compose,/W,H=640,800/);
  assert.match(compose,/im\.size==\(HALF,H\)/);
  assert.match(compose,/HALF=W\/\/2/);
  assert.match(compose,/ANATOMY_BOX=\(360,0,640,180\)/);
  assert.match(compose,/LABEL_Y=610/);
  assert.match(compose,/label\(draw,'Inicio',HALF\/\/2\)/);
  assert.match(compose,/label\(draw,'Final',HALF\+HALF\/\/2\)/);
  assert.match(compose,/'app_overlay_asset':'\/public\/isotipo-iberfit\.png'/);
  assert.match(compose,/'ai_generated_branding':False/);
});

test('phase generator uses identity + geometry refs without asking AI to invent branding',()=>{
  const gen=read('scripts/exercise-media/generate-fixed-phase.mjs');
  assert.match(gen,/NO logo, NO symbol, NO letters, NO numbers, NO brand name, NO watermark/);
  assert.match(gen,/Exactly one athlete in the requested single phase/);
  assert.match(gen,/input_image_0/);
  assert.match(gen,/input_image_1/);
  assert.match(gen,/POSE_REF/);
  assert.match(gen,/strict abstract POSE AND EQUIPMENT GEOMETRY guide/);
  assert.doesNotMatch(gen,/logoReference/);
});

test('workflow verifies the exact official master and isotype before generation',()=>{
  const wf=read('.github/workflows/exercise-media-fixed-template-batch.yml');
  assert.match(wf,/b74f8de6b50e484fa11b5d6c928b681d4b63451ad5909d81630123603e44e0bb/);
  assert.match(wf,/d4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa/);
  assert.match(wf,/public\/isotipo-iberfit\.png/);
  for(const id of [
    'IBF-APERTURAS-CON-MANCUERNAS',
    'IBF-DOMINADA-PRONADA',
    'IBF-BUENOS-DIAS-CON-BARRA',
    'IBF-PAJAROS-CON-MANCUERNAS',
    'IBF-PULLOVER-CON-MANCUERNA'
  ]) assert.match(wf,new RegExp(id));
});
