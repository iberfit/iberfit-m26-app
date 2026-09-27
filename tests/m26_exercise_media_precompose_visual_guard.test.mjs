import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const generator=await readFile(new URL('../scripts/exercise-media/auto-factory-generate.mjs',import.meta.url),'utf8');
const composer=await readFile(new URL('../scripts/exercise-media/compose-system-v1-auto.py',import.meta.url),'utf8');

function functionRegion(source,startMarker,endMarker){
  const start=source.indexOf(startMarker);
  assert.ok(start>=0,`${startMarker} must exist`);
  const end=endMarker?source.indexOf(endMarker,start):source.length;
  assert.ok(end>start,`${startMarker} region must be bounded`);
  return source.slice(start,end);
}

test('raw START and START/FINAL pair reject generated branding before composition',()=>{
  const startQa=functionRegion(generator,'async function validateStartPhase','async function validateRawPair');
  const pairQa=functionRegion(generator,'async function validateRawPair','async function main');
  for(const region of [startQa,pairQa]){
    assert.match(region,/no_unapproved_branding/,'raw QA must require an explicit brand-purity boolean');
    assert.match(region,/brand-free before composition/,'raw QA must reject branding before deterministic composition');
    assert.match(region,/shirt, shorts, shoes, equipment or background/,'brand purity must cover every generated surface');
    assert.match(region,/official IBERFIT isotipo is added only after this gate/i,'raw QA must distinguish generated branding from approved deterministic branding');
  }
  assert.match(generator,/START_REPAIR_ATTEMPTS=1/,'START repair bound must remain unchanged');
  assert.match(generator,/FINAL_REPAIR_ATTEMPTS=1/,'FINAL repair bound must remain unchanged');
});

test('anatomy renderer makes primary targets perceptually dominant while secondary targets remain restrained',()=>{
  const alpha=composer.match(/PRIMARY=\(\d+,\d+,\d+,(\d+)\);SECONDARY=\(\d+,\d+,\d+,(\d+)\)/);
  assert.ok(alpha,'primary and secondary anatomy colors must expose deterministic alpha values');
  const primaryAlpha=Number(alpha[1]);
  const secondaryAlpha=Number(alpha[2]);
  assert.ok(primaryAlpha>=245,'primary targets must stay visually strong');
  assert.ok(secondaryAlpha<=primaryAlpha*0.45,'secondary targets must remain clearly subordinate at delivery scale');
  assert.match(composer,/for m in secondary:[\s\S]{0,220}mark\(d,s,SECONDARY\)[\s\S]{0,220}for m in primary:[\s\S]{0,220}mark\(d,s,PRIMARY\)/,'primary overlays must be rendered after secondary overlays so overlap resolves in favor of primary targets');
});
