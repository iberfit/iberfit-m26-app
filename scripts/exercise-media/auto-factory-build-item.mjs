#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SYSTEM_V1='iberfit.exercise.media.system.v1';
const STYLE='iberfit-premium-movement-pair-v1';
const BUCKET='iberfit-exercise-media';
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function exact(v,n){const s=String(v||'').trim();if(!s)throw new Error(`${n}_REQUIRED`);return s;}
function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
async function main(){
  const claim=JSON.parse(fs.readFileSync(exact(arg('--claim'),'CLAIM'),'utf8'));const plan=JSON.parse(fs.readFileSync(exact(arg('--plan'),'PLAN'),'utf8'));const meta=JSON.parse(fs.readFileSync(exact(arg('--meta'),'META'),'utf8'));const biomech=JSON.parse(fs.readFileSync(exact(arg('--qa-biomechanics'),'QA_BIOMECHANICS'),'utf8'));const visual=JSON.parse(fs.readFileSync(exact(arg('--qa-visual'),'QA_VISUAL'),'utf8'));const filePath=exact(arg('--file'),'FILE');const outPath=exact(arg('--out'),'OUT');const exercise=claim?.claim?.exercise;const id=exercise?.id;if(!id||plan.exercise_id!==id||meta.exercise_id!==id||biomech.exercise_id!==id||visual.exercise_id!==id)throw new Error('BUILD_ITEM_ID_MISMATCH');if(biomech.pass!==true||visual.pass!==true||biomech.mode!=='biomechanics'||visual.mode!=='visual')throw new Error('BUILD_ITEM_QA_NOT_APPROVED');
  const bytes=fs.readFileSync(filePath);const digest=sha(bytes);if(meta?.delivery?.sha256!==digest||meta?.delivery?.width!==640||meta?.delivery?.height!==800)throw new Error('BUILD_ITEM_DELIVERY_PROOF_INVALID');const filename=`${id}-system-v1-${digest.slice(0,12)}.webp`;const storagePath=`${id}/${filename}`;
  const item={exercise_id:id,human_approved:false,publishable:true,approval:{method:'automatic_dual_gate_v1',scopes:['visual','biomechanics'],automatic_qa:'passed',visual_system:SYSTEM_V1,anatomy_inferred:Boolean(plan.anatomy_inferred),planner_confidence:Number(plan.planner_confidence),biomechanics_confidence:Number(biomech.confidence),visual_confidence:Number(visual.confidence)},proof:{identity_master_sha256:meta.identity_master_sha256,official_isotipo_sha256:meta?.branding?.official_isotipo_sha256,master_sha256:meta?.master?.sha256,delivery_sha256:digest,qa_biomechanics_sha256:sha(fs.readFileSync(exact(arg('--qa-biomechanics'),'QA_BIOMECHANICS'))),qa_visual_sha256:sha(fs.readFileSync(exact(arg('--qa-visual'),'QA_VISUAL'))},media:{schema:'iberfit.exercise.visual.v1',style:STYLE,visualSystem:SYSTEM_V1,bucket:BUCKET,published:true,clientVisible:true,coachVisible:true,qa:{biomechanics:'approved',visual:'approved'},movement:{path:storagePath,mime:'image/webp',width:640,height:800,sha256:digest}}};
  fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,`${JSON.stringify(item,null,2)}\n`);console.log(JSON.stringify({ok:true,exercise_id:id,path:storagePath,sha256:digest,anatomy_inferred:Boolean(plan.anatomy_inferred)}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
