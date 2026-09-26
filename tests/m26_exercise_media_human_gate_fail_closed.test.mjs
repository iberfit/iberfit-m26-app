import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const item=await readFile(new URL('../scripts/exercise-media/auto-factory-build-item.mjs',import.meta.url),'utf8');
const broker=await readFile(new URL('../supabase/functions/iberfit-exercise-media-auto-factory-v1/index.ts',import.meta.url),'utf8');
const spec=await readFile(new URL('../scripts/exercise-media/EXERCISE_MEDIA_SYSTEM_V1.md',import.meta.url),'utf8');

test('automatic candidates fail closed before human approval',()=>{
  assert.match(spec,/human approval plus existing automated QA/);
  assert.match(item,/human_approved:false,publishable:false/);
  assert.match(item,/published:false,clientVisible:false,coachVisible:false/);
  assert.match(broker,/item\?\.human_approved!==false\|\|item\?\.publishable!==true/);
  assert.match(broker,/media\?\.published!==true/);
});
