import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=(name)=>readFile(new URL(`../.github/workflows/${name}`,import.meta.url),'utf8');

test('default branch registers the exact human-regeneration dispatch target',async()=>{
  const [registry,scheduler]=await Promise.all([
    workflow('exercise-media-human-regeneration.yml'),
    workflow('exercise-media-regeneration-scheduler.yml'),
  ]);
  assert.match(registry,/^on:\s*\n\s+workflow_dispatch:/mu);
  assert.match(scheduler,/actions\/workflows\/exercise-media-human-regeneration\.yml\/dispatches/u);
  assert.match(scheduler,/\{\"ref\":\"canary\/rc74-4\"\}/u);
  assert.match(registry,/IBERFIT_MEDIA_REGEN_DEFAULT_BRANCH_EXECUTION_FORBIDDEN/u);
  assert.match(registry,/exit 1/u);
  assert.doesNotMatch(registry,/id-token:\s*write/u);
  assert.doesNotMatch(registry,/AUTO_FACTORY_URL|action:[ ]*claim|action:[ ]*publish/u);
});
