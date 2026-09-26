import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const item=await readFile(new URL('../scripts/exercise-media/auto-factory-build-item.mjs',import.meta.url),'utf8');
const broker=await readFile(new URL('../supabase/functions/iberfit-exercise-media-auto-factory-v1/index.ts',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/exercise-media-auto-factory.yml',import.meta.url),'utf8');
const approvedPublisher=await readFile(new URL('../scripts/exercise-media/publish-approved-via-broker.mjs',import.meta.url),'utf8');
const approvedWorkflow=await readFile(new URL('../.github/workflows/exercise-media-publish-approved.yml',import.meta.url),'utf8');
const spec=await readFile(new URL('../scripts/exercise-media/EXERCISE_MEDIA_SYSTEM_V1.md',import.meta.url),'utf8');

test('automatic candidates remain fail closed until explicit human approval',()=>{
  assert.match(spec,/human approval plus existing automated QA/);
  assert.match(item,/human_approved:false,publishable:false/);
  assert.match(item,/published:false,clientVisible:false,coachVisible:false/);
  assert.match(workflow,/Register candidate awaiting human approval/);
  assert.match(workflow,/action:"review"/);
  assert.doesNotMatch(workflow,/action=publish/);
  assert.match(broker,/IBERFIT_AUTO_FACTORY_DIRECT_PUBLISH_DISABLED/);
  assert.match(broker,/if\(action==="review"\)return await markReview/);
  assert.match(broker,/item\?\.human_approved!==false\|\|item\?\.publishable!==false/);
  assert.match(broker,/media\?\.published!==false/);
  assert.match(broker,/media\?\.clientVisible!==false\|\|media\?\.coachVisible!==false/);
});

test('production publication remains isolated behind the human-owner approval publisher',()=>{
  assert.match(approvedPublisher,/item\?\.human_approved!==true\|\|item\?\.publishable!==true/);
  assert.match(approvedPublisher,/a\.method!=='human_owner_approval'/);
  assert.match(approvedPublisher,/scopes\.includes\('visual'\)/);
  assert.match(approvedPublisher,/scopes\.includes\('biomechanics'\)/);
  assert.match(approvedWorkflow,/PUBLISH_APPROVED_MEDIA_PROD/);
  assert.match(approvedWorkflow,/publish-approved-via-broker\.mjs/);
});
