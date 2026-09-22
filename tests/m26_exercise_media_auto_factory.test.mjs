import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const workflow=await readFile(new URL('../.github/workflows/exercise-media-auto-factory.yml',import.meta.url),'utf8');
const broker=await readFile(new URL('../supabase/functions/iberfit-exercise-media-auto-factory-v1/index.ts',import.meta.url),'utf8');
const planner=await readFile(new URL('../scripts/exercise-media/auto-factory-plan.mjs',import.meta.url),'utf8');
const composer=await readFile(new URL('../scripts/exercise-media/compose-system-v1-auto.py',import.meta.url),'utf8');
const qa=await readFile(new URL('../scripts/exercise-media/auto-factory-qa.mjs',import.meta.url),'utf8');
const item=await readFile(new URL('../scripts/exercise-media/auto-factory-build-item.mjs',import.meta.url),'utf8');

const ISOTIPO='d4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa';
const MASTER='b74f8de6b50e484fa11b5d6c928b681d4b63451ad5909d81630123603e44e0bb';

test('auto factory is manual on Canary and scheduler is intentionally external',()=>{
  assert.match(workflow,/on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\bschedule\s*:/);
  assert.match(workflow,/concurrency:[\s\S]*iberfit-exercise-media-auto-factory/);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('broker is pinned to exact repository, Canary ref and workflow OIDC identity',()=>{
  assert.match(broker,/EXPECTED_REPOSITORY="iberfit\/iberfit-m26-app"/);
  assert.match(broker,/EXPECTED_REPOSITORY_ID="1306074388"/);
  assert.match(broker,/EXPECTED_REF="refs\/heads\/canary\/rc74-4"/);
  assert.match(broker,/exercise-media-auto-factory\.yml@refs\/heads\/canary\/rc74-4/);
  assert.match(broker,/AUDIENCE="iberfit-exercise-media-auto-factory"/);
  assert.doesNotMatch(broker,/"schedule"/);
});

test('automatic publication is stricter for inferred anatomy and never impersonates human approval',()=>{
  assert.match(broker,/BASE_MIN_CONFIDENCE=0\.97/);
  assert.match(broker,/INFERRED_ANATOMY_MIN_CONFIDENCE=0\.985/);
  assert.match(item,/human_approved:false/);
  assert.match(item,/method:'automatic_dual_gate_v1'/);
  assert.match(broker,/item\?\.human_approved!==false/);
  assert.match(broker,/automatic_dual_gate_v1/);
  assert.match(broker,/qaBiomechanics,"biomechanics"/);
  assert.match(broker,/qaVisual,"visual"/);
});

test('official identity and branding hashes remain deterministic',()=>{
  assert.match(workflow,new RegExp(ISOTIPO));
  assert.match(workflow,new RegExp(MASTER));
  assert.match(broker,new RegExp(ISOTIPO));
  assert.match(broker,new RegExp(MASTER));
  assert.match(composer,new RegExp(ISOTIPO));
  assert.match(composer,new RegExp(MASTER));
  assert.match(composer,/generated_branding':False/);
});

test('planner uses a closed anatomy vocabulary and generic targets require higher confidence',()=>{
  for(const muscle of ['core','glúteos','aductores','cuádriceps','isquiotibiales','bíceps','dorsal ancho','romboides','tríceps','oblicuos','erectores espinales','deltoides anterior','deltoides posterior','deltoides','serrato','pectoral'])assert.match(planner,new RegExp(muscle));
  assert.match(planner,/GENERIC=new Set\(\['movilidad','global','músculo objetivo'\]\)/);
  assert.match(planner,/inferred\?0\.985:0\.96/);
});

test('dual QA and final media remain fail closed and System v1 tagged',()=>{
  assert.match(qa,/mode==='biomechanics'/);
  assert.match(qa,/mode==='visual'/);
  assert.match(qa,/inferred\?0\.985:0\.97/);
  assert.match(item,/visualSystem:SYSTEM_V1/);
  assert.match(item,/qa:\{biomechanics:'approved',visual:'approved'\}/);
  assert.match(broker,/media\?\.visualSystem!==SYSTEM_V1/);
  assert.match(broker,/IBERFIT_AUTO_FACTORY_FILE_SHA_MISMATCH/);
  assert.match(broker,/IBERFIT_AUTO_FACTORY_FILE_DIMENSIONS_INVALID/);
});

test('one workflow run claims only one exercise and failures are quarantined',()=>{
  assert.equal((workflow.match(/\"action\":\"claim\"/g)||[]).length,1);
  assert.match(workflow,/Quarantine failed claimed exercise/);
  assert.match(broker,/MAX_ATTEMPTS=3/);
  assert.match(broker,/status:blocked\?"blocked":"failed"/);
});
