import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const builder=fileURLToPath(new URL('../scripts/exercise-media/auto-factory-build-item.mjs',import.meta.url));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function writeJson(file,value){fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`);}

test('automatic approval builder parses and produces an immutable publish item from approved QA',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-build-item-'));
  try{
    const id='IBF-BEAR-CRAWL';
    const delivery=Buffer.from('deterministic-system-v1-delivery-fixture');
    const digest=sha(delivery);
    const files={
      claim:path.join(dir,'claim.json'),
      plan:path.join(dir,'plan.json'),
      meta:path.join(dir,'metadata.json'),
      biomech:path.join(dir,'qa-biomechanics.json'),
      visual:path.join(dir,'qa-visual.json'),
      delivery:path.join(dir,'delivery.webp'),
      out:path.join(dir,'item.json'),
    };
    writeJson(files.claim,{claim:{exercise:{id}}});
    writeJson(files.plan,{exercise_id:id,anatomy_inferred:false,planner_confidence:0.99});
    writeJson(files.meta,{exercise_id:id,identity_master_sha256:'identity-proof',branding:{official_isotipo_sha256:'isotipo-proof'},master:{sha256:'master-proof'},delivery:{sha256:digest,width:640,height:800}});
    writeJson(files.biomech,{exercise_id:id,mode:'biomechanics',pass:true,confidence:0.97});
    writeJson(files.visual,{exercise_id:id,mode:'visual',pass:true,confidence:0.98});
    fs.writeFileSync(files.delivery,delivery);

    const run=spawnSync(process.execPath,[builder,'--claim',files.claim,'--plan',files.plan,'--meta',files.meta,'--qa-biomechanics',files.biomech,'--qa-visual',files.visual,'--file',files.delivery,'--out',files.out],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr||run.stdout);
    const item=JSON.parse(fs.readFileSync(files.out,'utf8'));
    assert.equal(item.exercise_id,id);
    assert.equal(item.human_approved,false);
    assert.equal(item.publishable,true);
    assert.equal(item.approval.method,'automatic_dual_gate_v1');
    assert.equal(item.approval.automatic_qa,'passed');
    assert.equal(item.proof.delivery_sha256,digest);
    assert.equal(item.proof.qa_biomechanics_sha256,sha(fs.readFileSync(files.biomech)));
    assert.equal(item.proof.qa_visual_sha256,sha(fs.readFileSync(files.visual)));
    assert.equal(item.media.movement.path,`${id}/${id}-system-v1-${digest.slice(0,12)}.webp`);
    assert.equal(item.media.movement.sha256,digest);
    assert.deepEqual(item.media.qa,{biomechanics:'approved',visual:'approved'});
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
