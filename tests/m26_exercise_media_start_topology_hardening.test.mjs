import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {
  hasHardMovementPlanGuard,
  supportObservationPass,
  supportPairObservationPass,
} from '../scripts/exercise-media/auto-factory-movement-guard.mjs';

const generatorUrl=new URL('../scripts/exercise-media/auto-factory-generate.mjs',import.meta.url);
const qaUrl=new URL('../scripts/exercise-media/auto-factory-qa.mjs',import.meta.url);
const generator=await readFile(generatorUrl,'utf8');
const qa=await readFile(qaUrl,'utf8');
const movementGuard=await readFile(new URL('../scripts/exercise-media/auto-factory-movement-guard.mjs',import.meta.url),'utf8');
const bear={id:'IBF-BEAR-CRAWL',name_es:'Bear crawl',pattern:'locomoción',equipment:'sin equipo'};
const validSupport={palms_on_floor:2,forefeet_on_floor:2,knees_weight_bearing:false,hip_height_relation:'near_shoulders',torso_relation:'approximately_parallel',lunge_or_squat:false};

test('Bear Crawl support observations fail closed deterministically',()=>{
  assert.equal(hasHardMovementPlanGuard(bear),true);
  assert.equal(supportObservationPass(bear,validSupport),true);
  assert.equal(supportObservationPass(bear,{...validSupport,hip_height_relation:'below_shoulders'}),false);
  assert.equal(supportObservationPass(bear,{...validSupport,lunge_or_squat:true}),false);
  assert.equal(supportObservationPass(bear,{...validSupport,knees_weight_bearing:true}),false);
  assert.equal(supportObservationPass(bear,{...validSupport,forefeet_on_floor:1}),false);
  assert.equal(supportPairObservationPass(bear,{start:validSupport,final:validSupport}),true);
  assert.equal(supportPairObservationPass(bear,{start:validSupport,final:{...validSupport,torso_relation:'upright'}}),false);
});

test('START has bounded independent QA before becoming FINAL continuity',()=>{
  assert.match(generator,/const START_REPAIR_ATTEMPTS=1/);
  assert.match(generator,/async function validateStartPhase/);
  assert.match(generator,/START_PHASE_QA_FAILED/);
  assert.match(generator,/archiveRejectedPhase\(generated\.file,outDir,exercise\.id,'start',attempt-1\)/);
  assert.match(generator,/already generated and QA-approved START phase continuity reference/);
  assert.match(generator,/supportObservationPass/);
  assert.match(generator,/support_topology/);
});

test('final raw and biomechanics QA derive Bear Crawl topology from structured observations',()=>{
  assert.match(generator,/supportPairObservationPass/);
  assert.match(generator,/supportPairObservationInstruction/);
  assert.match(qa,/supportPairObservationPass/);
  assert.match(qa,/supportPairObservationInstruction/);
  assert.match(qa,/support_topology/);
  assert.match(movementGuard,/A squat, crouch, lunge or kneeling pose is not a crawl/);
});

test('hardening remains scoped to the existing Bear Crawl hard movement guard',()=>{
  assert.equal(hasHardMovementPlanGuard({id:'IBF-FARMERS-WALK',name_es:'Caminata del granjero',pattern:'locomoción'}),false);
  assert.equal(supportObservationPass({id:'IBF-FARMERS-WALK'},null),true);
});

test('generator and final QA remain syntactically valid Node modules',()=>{
  for(const url of [generatorUrl,qaUrl]){
    const checked=spawnSync(process.execPath,['--check',fileURLToPath(url)],{encoding:'utf8'});
    assert.equal(checked.status,0,checked.stderr||checked.stdout);
  }
});
