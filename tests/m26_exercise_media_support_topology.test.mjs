import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {isQuadrupedalLocomotion,movementSupportContract,quadrupedSupportObservationPass,quadrupedPairSupportObservationPass} from '../scripts/exercise-media/auto-factory-movement-contract.mjs';

const generatorUrl=new URL('../scripts/exercise-media/auto-factory-generate.mjs',import.meta.url);
const qaUrl=new URL('../scripts/exercise-media/auto-factory-qa.mjs',import.meta.url);
const generator=await readFile(generatorUrl,'utf8');
const qa=await readFile(qaUrl,'utf8');
const bear={name_es:'Bear crawl',pattern:'locomoción',equipment:'sin equipo',tags:['core','control']};

const validSupport={palms_on_floor:2,forefeet_on_floor:2,knees_weight_bearing:false,hip_height_relation:'near_shoulders',torso_relation:'approximately_parallel',lunge_or_squat:false};

test('bear crawl receives a strict quadruped support contract',()=>{
  assert.equal(isQuadrupedalLocomotion(bear),true);
  const contract=movementSupportContract(bear);
  assert.match(contract,/BOTH palms and BOTH forefeet\/toes/);
  assert.match(contract,/Knees hover 2-10 cm/);
  assert.match(contract,/Hips stay approximately level with the shoulders/);
  assert.match(contract,/Never depict a squat, deep crouch, lunge/);
  assert.equal(isQuadrupedalLocomotion({name_es:'Caminata del granjero',pattern:'locomoción',tags:['agarre']}),false);
});

test('deterministic support observation rejects the real crouch/lunge failure mode',()=>{
  assert.equal(quadrupedSupportObservationPass(bear,validSupport),true);
  assert.equal(quadrupedSupportObservationPass(bear,{...validSupport,hip_height_relation:'below_shoulders'}),false);
  assert.equal(quadrupedSupportObservationPass(bear,{...validSupport,lunge_or_squat:true}),false);
  assert.equal(quadrupedSupportObservationPass(bear,{...validSupport,knees_weight_bearing:true}),false);
  assert.equal(quadrupedSupportObservationPass(bear,{...validSupport,forefeet_on_floor:1}),false);
  assert.equal(quadrupedPairSupportObservationPass(bear,{start:validSupport,final:validSupport}),true);
  assert.equal(quadrupedPairSupportObservationPass(bear,{start:validSupport,final:{...validSupport,torso_relation:'upright'}}),false);
});

test('START is fail-closed and repairable before it becomes FINAL continuity reference',()=>{
  assert.match(generator,/START_REPAIR_ATTEMPTS=1/);
  assert.match(generator,/validateRawStart/);
  assert.match(generator,/RAW_START_QA_FAILED/);
  assert.match(generator,/support_topology/);
  assert.match(generator,/archiveRejectedPhase\(generated\.file,outDir,exercise\.id,'start'/);
  assert.match(generator,/already generated and QA-approved START phase continuity reference/);
  assert.match(generator,/Camera language is strictly/);
});

test('raw and final biomechanics gates derive quadruped topology from structured observations',()=>{
  assert.match(generator,/quadrupedSupportObservationPass/);
  assert.match(generator,/quadrupedPairSupportObservationPass/);
  assert.match(qa,/support_topology/);
  assert.match(qa,/quadrupedPairSupportObservationPass/);
  assert.match(qa,/A squat, crouch, lunge or kneeling pose is not a crawl/);
});

test('generator and final QA remain syntactically valid Node modules',()=>{
  for(const url of [generatorUrl,qaUrl]){
    const checked=spawnSync(process.execPath,['--check',fileURLToPath(url)],{encoding:'utf8'});
    assert.equal(checked.status,0,checked.stderr||checked.stdout);
  }
});
