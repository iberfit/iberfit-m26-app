import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const helper=await readFile(new URL('../scripts/exercise-media/auto-factory-fetch.mjs',import.meta.url),'utf8');
const planner=await readFile(new URL('../scripts/exercise-media/auto-factory-plan.mjs',import.meta.url),'utf8');
const generator=await readFile(new URL('../scripts/exercise-media/auto-factory-generate.mjs',import.meta.url),'utf8');
const qa=await readFile(new URL('../scripts/exercise-media/auto-factory-qa.mjs',import.meta.url),'utf8');

test('auto factory retries only bounded transient transport failures',()=>{
  assert.match(helper,/DEFAULT_DELAYS_MS=Object\.freeze\(\[1000,2000,4000,8000\]\)/u);
  assert.match(helper,/const maxAttempts=delays\.length\+1/u);
  assert.match(helper,/TRANSIENT_STATUS=new Set\(\[[^\]]*408[^\]]*425[^\]]*429[^\]]*522[^\]]*\]\)/u);
  assert.match(helper,/response\.ok\|\|!TRANSIENT_STATUS\.has\(response\.status\)\|\|attempt===maxAttempts/u);
  assert.match(helper,/NETWORK_EXHAUSTED/u);
});

test('planner generation and QA share the same transient retry contract',()=>{
  for(const [name,source] of [['planner',planner],['generator',generator],['qa',qa]]){
    assert.match(source,/from '\.\/auto-factory-fetch\.mjs'/u,`${name} must import shared retry helper`);
    assert.match(source,/fetchWithTransientRetry\(/u,`${name} must use shared retry helper`);
    assert.doesNotMatch(source,/const response=await fetch\(/u,`${name} must not bypass shared retry helper`);
  }
});

test('retry hardening does not relax fail-closed semantic gates',()=>{
  assert.match(planner,/PLAN_CONFIDENCE_LOW/u);
  assert.match(generator,/IMAGE_MISSING/u);
  assert.match(qa,/if\(!pass\)process\.exit\(2\)/u);
  assert.match(qa,/inferred\?0\.985:0\.97/u);
});
