import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const workflow=await readFile(new URL('../.github/workflows/exercise-media-auto-factory.yml',import.meta.url),'utf8');
const remoteGates=await readFile(new URL('../.github/workflows/remote-gates.yml',import.meta.url),'utf8');
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

test('broker is pinned to exact repository, Canary ref and action-scoped workflow identities',()=>{
  assert.match(broker,/EXPECTED_REPOSITORY="iberfit\/iberfit-m26-app"/);
  assert.match(broker,/EXPECTED_REPOSITORY_ID="1306074388"/);
  assert.match(broker,/EXPECTED_REF="refs\/heads\/canary\/rc74-4"/);
  assert.match(broker,/EXPECTED_PROCESS_WORKFLOW_REF="iberfit\/iberfit-m26-app\/\.github\/workflows\/exercise-media-auto-factory\.yml@refs\/heads\/canary\/rc74-4"/);
  assert.match(broker,/EXPECTED_PROBE_WORKFLOW_REF="iberfit\/iberfit-m26-app\/\.github\/workflows\/remote-gates\.yml@refs\/heads\/canary\/rc74-4"/);
  assert.match(broker,/AUDIENCE="iberfit-exercise-media-auto-factory"/);
  assert.match(broker,/IBERFIT_AUTO_FACTORY_PROCESS_WORKFLOW_FORBIDDEN/);
  assert.match(broker,/IBERFIT_AUTO_FACTORY_PROBE_WORKFLOW_FORBIDDEN/);
  assert.doesNotMatch(broker,/"schedule"/);
});

test('registered remote gate isolates OIDC probe permissions and cannot claim fail or publish',()=>{
  assert.match(remoteGates,/workflow_dispatch:[\s\S]*confirmation:/);
  assert.match(remoteGates,/exercise-media-broker-probe:/);
  assert.match(remoteGates,/inputs\.confirmation == 'EXERCISE_MEDIA_BROKER_PROBE'/);
  assert.match(remoteGates,/github\.ref == 'refs\/heads\/canary\/rc74-4'/);
  assert.equal((remoteGates.match(/id-token:\s*write/g)||[]).length,1);
  assert.match(remoteGates,/exercise-media-broker-probe:[\s\S]*permissions:[\s\S]*id-token:\s*write/);
  assert.match(remoteGates,/\{"action":"probe"\}/);
  assert.doesNotMatch(remoteGates,/\{"action":"claim"\}/);
  assert.doesNotMatch(remoteGates,/action=publish/);
  assert.doesNotMatch(remoteGates,/\{action:"fail"/);
  assert.doesNotMatch(remoteGates,/CLOUDFLARE_API_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(broker,/if\(action==="probe"\)[\s\S]*EXPECTED_PROBE_WORKFLOW_REF/);
  assert.match(broker,/requireWorkflow\(claims,EXPECTED_PROCESS_WORKFLOW_REF,"IBERFIT_AUTO_FACTORY_PROCESS_WORKFLOW_FORBIDDEN"\)/);
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

test('proxy infrastructure is ready before claim so Cloudflare outages cannot consume exercise attempts',()=>{
  const proxyStart=workflow.indexOf('- name: Create isolated Workers AI proxy');
  const claimStart=workflow.indexOf('- name: Claim next missing System v1 exercise');
  assert.ok(proxyStart>=0,'proxy step must exist');
  assert.ok(claimStart>proxyStart,'proxy must be provisioned before an exercise is claimed');
  const proxyBlock=workflow.slice(proxyStart,claimStart);
  assert.match(proxyBlock,/for cf_attempt in 1 2 3 4; do/,'Cloudflare operations must have bounded retries');
  assert.match(proxyBlock,/api\.cloudflare\.com\/client\/v4\/accounts/,'ambiguous project-create failures must verify project existence');
  assert.match(proxyBlock,/IBERFIT_AI_PROXY_CREATED=true/,'created proxy must be registered for cleanup before later operations');
  assert.match(proxyBlock,/pages secret put/,'proxy secret setup must remain present');
  assert.match(proxyBlock,/pages deploy/,'proxy deployment must remain present');
});

test('claim prioritizes explicit anatomy while preserving stricter inferred-anatomy gates',()=>{
  assert.match(broker,/function hasGenericAnatomy\(exercise:any\)/);
  assert.match(broker,/Number\(hasGenericAnatomy\(a\)\)-Number\(hasGenericAnatomy\(b\)\)/,'explicit anatomy must sort before generic anatomy');
  assert.match(broker,/const inferredAnatomy=hasGenericAnatomy\(exercise\)/,'the same classifier must drive the higher-confidence publication gate');
  assert.match(broker,/INFERRED_ANATOMY_MIN_CONFIDENCE=0\.985/,'inferred anatomy threshold must remain unchanged');
});

test('planner and QA use explicit evidence-based confidence calibration without weakening thresholds',()=>{
  assert.match(planner,/Confidence calibration is mandatory and evidence-based/);
  assert.match(planner,/Do not default to 0\.95/);
  assert.match(planner,/0\.99-1\.00 only when the exact exercise, equipment, START\/FINAL relationship and required anatomy are all unambiguous/);
  assert.match(planner,/inferred\?0\.985:0\.96/,'planner thresholds must remain unchanged');
  assert.match(qa,/Confidence calibration is mandatory and evidence-based/);
  assert.match(qa,/Do not default to 0\.95/);
  assert.match(qa,/0\.99-1\.00 only when every required/);
  assert.match(qa,/inferred\?0\.985:0\.97/,'QA thresholds must remain unchanged');
  assert.match(qa,/keys\.every\(k=>checks\[k\]===true\)/,'all boolean QA checks must still pass');
});