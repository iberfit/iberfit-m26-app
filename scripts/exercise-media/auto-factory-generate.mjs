#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fetchWithTransientRetry} from './auto-factory-fetch.mjs';
import {extractStructuredResponse} from './auto-factory-structured-response.mjs';

const MODEL='@cf/black-forest-labs/flux-2-klein-4b';
const RAW_WIDTH=1024;
const RAW_HEIGHT=1600;
const FINAL_REPAIR_ATTEMPTS=1;
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function exact(v,n){const s=String(v||'').trim();if(!s)throw new Error(`${n}_REQUIRED`);return s;}
function seedFor(id,phase){const digest=crypto.createHash('sha256').update(`${id}:${phase}:iberfit-auto-factory-v1`).digest();return digest.readUInt32BE(0)&0x7fffffff;}
function detectMime(bytes){if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';throw new Error('IMAGE_TYPE_UNSUPPORTED');}
function ext(mime){return mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg';}
function extractImage(payload){for(const v of [payload?.result?.image,payload?.image,payload?.result?.result?.image,payload?.result?.result,payload?.result]){if(typeof v==='string'&&v.length>128){const b=Buffer.from(v,'base64');if(b.length>128)return b;}}throw new Error('IMAGE_MISSING');}
function findStartReference(outDir,id){for(const name of fs.readdirSync(outDir)){if(name.startsWith(`${id}-start.`)&&!name.endsWith('.json'))return path.join(outDir,name);}return null;}
function dataUri(file){const bytes=fs.readFileSync(file);return`data:${detectMime(bytes)};base64,${bytes.toString('base64')}`;}
function equipmentVisualGuard(exercise){
  const descriptor=`${exercise?.name_es||''} ${exercise?.equipment||''}`.toLowerCase();
  if(/rueda abdominal|ab wheel|ab roller/u.test(descriptor))return 'Equipment geometry lock: use exactly ONE standard compact ab roller: one small wheel about 25-35 cm in diameter with one straight axle through the center and short handles protruding equally from both sides. Both hands stay on the side handles. It is not a wheelchair, not a cable reel, not a barbell plate, not two large wheels and not any oversized circular apparatus.';
  return `Equipment geometry lock: use the ordinary commercial form of "${exercise?.equipment||'the named equipment'}" at realistic human scale. Do not enlarge, duplicate, merge or redesign the equipment; required handles and support points must remain physically plausible.`;
}
function archiveRejectedFinal(file,outDir,exerciseId,attempt){
  if(!file||!fs.existsSync(file))return;
  const rejectedDir=path.join(outDir,'rejected');fs.mkdirSync(rejectedDir,{recursive:true});const extension=path.extname(file);const archived=path.join(rejectedDir,`${exerciseId}-final-attempt-${attempt}${extension}`);fs.copyFileSync(file,archived);const meta=`${file}.json`;if(fs.existsSync(meta))fs.copyFileSync(meta,`${archived}.json`);fs.rmSync(file,{force:true});fs.rmSync(meta,{force:true});
}
async function validateRawPair({claim,plan,startFile,finalFile,outDir,proxy,token,reviewAttempt=0}){
  const exercise=claim.claim.exercise;const inferred=Boolean(plan.anatomy_inferred);const minConfidence=inferred?0.985:0.97;
  const keys=['start_matches_plan','final_matches_plan','same_identity','same_scene_and_camera','equipment_continuity','grip_support_continuity','critical_body_visible','no_portrait_or_rest_pose'];
  const rubric=[
    'You are the fail-closed raw phase reviewer for IBERFIT Exercise Media System v1. Judge the two generated photographs before any branding or composition.',
    'Image 1 is START. Image 2 is FINAL. They must depict the exact same exercise, athlete, scene, camera language and equipment setup while changing only the movement phase required by the plan.',
    `Exercise=${exercise.name_es}; equipment=${exercise.equipment}; pattern=${exercise.pattern}.`,
    `Planned START=${plan.start}`,
    `Planned FINAL=${plan.final}`,
    `Canonical cues=${(exercise.cues||[]).join(' | ')}. Precautions=${(exercise.precautions||[]).join(' | ')}.`,
    'Reject if either image becomes a portrait/rest pose, loses or invents equipment, drops required handles/supports, changes cable routing or machine geometry, hides critical joints, changes athlete identity, or no longer matches the exact planned phase.',
    'For cable or resistance exercises, visible grip/contact and physically plausible connection to the resistance source must persist in every phase where the plan requires it.',
    'Confidence calibration is mandatory and evidence-based. Use 0.99-1.00 only when every required relationship is clearly visible and unambiguous; 0.97-0.98 for valid phases with only minor non-critical visual uncertainty; <=0.96 when any phase, grip, equipment connection, identity, joint relationship or scene continuity requires guessing. Do not default to 0.95.',
    `Return ONLY JSON: {${keys.map(k=>`"${k}":boolean`).join(',')},"confidence":number,"issues":[string]}.`
  ].join('\n');
  const body={messages:[{role:'system',content:'Output exactly one JSON object. Be adversarial and fail ambiguity.'},{role:'user',content:[{type:'image_url',image_url:{url:dataUri(startFile)}},{type:'image_url',image_url:{url:dataUri(finalFile)}},{type:'text',text:rubric}]}],temperature:0,stream:false,max_completion_tokens:2200,chat_template_kwargs:{enable_thinking:false,preserve_thinking:false},response_format:{type:'json_object'}};
  const response=await fetchWithTransientRetry(proxy.replace(/\/generate$/,'/qa'),{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error'},{label:'RAW_PHASE_QA'});if(!response.ok)throw new Error(`RAW_PHASE_QA_HTTP_${response.status}:${(await response.text()).slice(0,900)}`);
  const payload=await response.json();if(payload?.ok!==true)throw new Error(`RAW_PHASE_QA_PROXY_FAILED:${JSON.stringify(payload).slice(0,1200)}`);const review=extractStructuredResponse(payload,{missingError:'RAW_PHASE_QA_RESPONSE_MISSING',invalidError:'RAW_PHASE_QA_JSON_INVALID'});
  const checks={};for(const key of keys)checks[key]=review[key]===true;const confidence=Number(review.confidence);const pass=keys.every(k=>checks[k]===true)&&Number.isFinite(confidence)&&confidence>=minConfidence;const output={schema:'iberfit.exercise.media.auto.raw-phase-qa.v1',exercise_id:exercise.id,pass,confidence:Number.isFinite(confidence)?confidence:0,min_confidence:minConfidence,checks,issues:Array.isArray(review.issues)?review.issues.map(String).slice(0,12):[],anatomy_inferred:inferred,review_attempt:reviewAttempt,reviewed_at:new Date().toISOString()};const serialized=`${JSON.stringify(output,null,2)}\n`;fs.writeFileSync(path.join(outDir,'raw-phase-qa.json'),serialized);fs.writeFileSync(path.join(outDir,`raw-phase-qa-attempt-${reviewAttempt}.json`),serialized);return output;
}
async function main(){
  const claim=JSON.parse(fs.readFileSync(exact(arg('--claim'),'CLAIM'),'utf8'));const plan=JSON.parse(fs.readFileSync(exact(arg('--plan'),'PLAN'),'utf8'));const phase=exact(arg('--phase'),'PHASE');const athleteRef=exact(arg('--athlete-ref'),'ATHLETE_REF');const outDir=exact(arg('--out-dir'),'OUT_DIR');
  if(!['start','final'].includes(phase))throw new Error('PHASE_INVALID');const exercise=claim?.claim?.exercise;if(!exercise?.id||plan?.exercise_id!==exercise.id)throw new Error('CLAIM_PLAN_ID_MISMATCH');
  const proxy=exact(process.env.IBERFIT_AI_PROXY_URL,'IBERFIT_AI_PROXY_URL').replace(/\/+$/,'')+'/generate';const token=exact(process.env.IBERFIT_AI_PROXY_TOKEN,'IBERFIT_AI_PROXY_TOKEN');const phaseText=String(plan?.[phase]||'').trim();if(phaseText.length<40)throw new Error('PHASE_PLAN_INVALID');fs.mkdirSync(outDir,{recursive:true});
  const continuityRef=phase==='final'?findStartReference(outDir,exercise.id):null;if(phase==='final'&&!continuityRef)throw new Error('FINAL_CONTINUITY_REFERENCE_MISSING');
  const generateOnce=async(repairAttempt=0,repairIssues=[])=>{
    const repairInstruction=phase==='final'&&repairAttempt>0?`REPAIR PASS ${repairAttempt}: strict raw QA rejected the previous FINAL. Correct every listed defect while preserving the approved START scene, identity, camera and valid equipment geometry. Previous QA issues: ${repairIssues.join(' | ')}. This is a repair, not a stylistic variation. Make the required FINAL movement phase unmistakably different from START while keeping every required grip and support connected.`:'';
    const prompt=[
      'Create ONE realistic premium exercise-library photograph for IBERFIT. Exactly one adult male athlete and one continuous scene. Vertical 1024x1600.',
      'Input image 0 is the approved IBERFIT male identity reference ONLY. Preserve the same face, hair, beard, age, complexion and natural athletic build. Do not copy its pose.',
      phase==='final'?'Input image 1 is the already generated START phase continuity reference. Preserve the same gym scene, camera language, athlete scale, clothing, equipment, cable/machine geometry, attachment points and grip/support setup. Change the body position and equipment displacement as much as the required FINAL phase demands. The FINAL must clearly show the completed movement, not a near-START pose.':'Generate the START phase as the canonical continuity scene for the later FINAL phase.',
      repairInstruction,
      'The athlete wears a completely plain black short-sleeve technical shirt, plain black shorts and plain black training shoes. NO logo, NO letters, NO symbol, NO brand, NO watermark anywhere. Branding is composited later from the exact official repository asset.',
      'Environment: premium dark green and charcoal gym, realistic commercial photography, warm cream highlights and restrained gold architectural details. No neon, no generic AI glow, no poster design, no infographic and no text.',
      `Camera language: ${plan.camera}. Keep the entire athlete, relevant hands, feet, joints, support points and all equipment visible. Leave useful background breathing room, especially toward the upper corners, without compromising biomechanics.`,
      `Exercise: ${exercise.name_es}. Pattern: ${exercise.pattern}. Intent: ${exercise.intent}. Equipment: ${exercise.equipment}.`,
      equipmentVisualGuard(exercise),
      `Required ${phase.toUpperCase()} phase: ${phaseText}`,
      `Technique cues: ${(exercise.cues||[]).join(' | ')}. Precautions: ${(exercise.precautions||[]).join(' | ')}.`,
      'This is an exercise demonstration, never a portrait or rest pose. Any grip, cable, handle, machine contact or support required by the phase must remain visibly connected and physically plausible. Never fold or cross the arms as a casual pose unless the canonical exercise explicitly requires that action.',
      'Biomechanics must be anatomically possible, controlled and safe. No duplicated limbs, extra fingers, malformed equipment, impossible joint angles, hidden grip/support or background people.',
      'Do not show both phases. Do not split the frame. Do not add anatomy diagrams, arrows, labels or any branding.'
    ].filter(Boolean).join('\n');
    const seed=repairAttempt>0?seedFor(exercise.id,`${phase}-repair-${repairAttempt}`):seedFor(exercise.id,phase);const bytes=fs.readFileSync(athleteRef);const form=new FormData();form.append('model',MODEL);form.append('prompt',prompt);form.append('width',String(RAW_WIDTH));form.append('height',String(RAW_HEIGHT));form.append('guidance','5');form.append('seed',String(seed));form.append('input_image_0',new Blob([bytes],{type:'image/png'}),'iberfit-approved-athlete.png');if(continuityRef){const continuityBytes=fs.readFileSync(continuityRef);form.append('input_image_1',new Blob([continuityBytes],{type:detectMime(continuityBytes)}),'iberfit-start-continuity-reference');}
    const response=await fetchWithTransientRetry(proxy,{method:'POST',headers:{authorization:`Bearer ${token}`},body:form,redirect:'error'},{label:`GENERATE_${phase.toUpperCase()}${repairAttempt?`_REPAIR_${repairAttempt}`:''}`});if(!response.ok)throw new Error(`GENERATE_HTTP_${response.status}:${(await response.text()).slice(0,1000)}`);const payload=await response.json();if(payload?.ok!==true)throw new Error(`GENERATE_PROXY_FAILED:${JSON.stringify(payload).slice(0,1200)}`);
    const image=extractImage(payload),mime=detectMime(image);const file=path.join(outDir,`${exercise.id}-${phase}${ext(mime)}`);fs.writeFileSync(file,image);const metadata={schema:'iberfit.exercise.media.auto.phase.v1',exercise_id:exercise.id,phase,model:payload.model||MODEL,fallback:Boolean(payload.fallback),width:RAW_WIDTH,height:RAW_HEIGHT,mime,seed,prompt_sha256:crypto.createHash('sha256').update(prompt).digest('hex'),continuity_reference_sha256:continuityRef?crypto.createHash('sha256').update(fs.readFileSync(continuityRef)).digest('hex'):null,repair_attempt:repairAttempt,publishable:false};fs.writeFileSync(`${file}.json`,`${JSON.stringify(metadata,null,2)}\n`);console.log(JSON.stringify({ok:true,file,...metadata}));return{file,metadata};
  };
  if(phase==='start'){await generateOnce(0,[]);return;}
  let generated=null;let review=null;let repairIssues=[];
  for(let attempt=0;attempt<=FINAL_REPAIR_ATTEMPTS;attempt+=1){
    if(attempt>0&&generated)archiveRejectedFinal(generated.file,outDir,exercise.id,attempt-1);
    generated=await generateOnce(attempt,repairIssues);review=await validateRawPair({claim,plan,startFile:continuityRef,finalFile:generated.file,outDir,proxy,token,reviewAttempt:attempt});if(review.pass)return;repairIssues=review.issues;
  }
  const failed=review?Object.entries(review.checks).filter(([,ok])=>ok!==true).map(([key])=>key).join(',')||'confidence':'unknown';throw new Error(`RAW_PHASE_QA_FAILED:${review?.confidence??0}:${failed}`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
