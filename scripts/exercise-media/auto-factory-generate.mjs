#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MODEL='@cf/black-forest-labs/flux-2-klein-4b';
const RAW_WIDTH=1024;
const RAW_HEIGHT=1600;
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function exact(v,n){const s=String(v||'').trim();if(!s)throw new Error(`${n}_REQUIRED`);return s;}
function seedFor(id,phase){const digest=crypto.createHash('sha256').update(`${id}:${phase}:iberfit-auto-factory-v1`).digest();return digest.readUInt32BE(0)&0x7fffffff;}
function detectMime(bytes){if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';throw new Error('IMAGE_TYPE_UNSUPPORTED');}
function ext(mime){return mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg';}
function extractImage(payload){for(const v of [payload?.result?.image,payload?.image,payload?.result?.result?.image,payload?.result?.result,payload?.result]){if(typeof v==='string'&&v.length>128){const b=Buffer.from(v,'base64');if(b.length>128)return b;}}throw new Error('IMAGE_MISSING');}
async function main(){
  const claim=JSON.parse(fs.readFileSync(exact(arg('--claim'),'CLAIM'),'utf8'));const plan=JSON.parse(fs.readFileSync(exact(arg('--plan'),'PLAN'),'utf8'));const phase=exact(arg('--phase'),'PHASE');const athleteRef=exact(arg('--athlete-ref'),'ATHLETE_REF');const outDir=exact(arg('--out-dir'),'OUT_DIR');
  if(!['start','final'].includes(phase))throw new Error('PHASE_INVALID');const exercise=claim?.claim?.exercise;if(!exercise?.id||plan?.exercise_id!==exercise.id)throw new Error('CLAIM_PLAN_ID_MISMATCH');
  const proxy=exact(process.env.IBERFIT_AI_PROXY_URL,'IBERFIT_AI_PROXY_URL').replace(/\/+$/,'')+'/generate';const token=exact(process.env.IBERFIT_AI_PROXY_TOKEN,'IBERFIT_AI_PROXY_TOKEN');const phaseText=String(plan?.[phase]||'').trim();if(phaseText.length<40)throw new Error('PHASE_PLAN_INVALID');
  const prompt=[
    'Create ONE realistic premium exercise-library photograph for IBERFIT. Exactly one adult male athlete and one continuous scene. Vertical 1024x1600.',
    'Input image 0 is the approved IBERFIT male identity reference ONLY. Preserve the same face, hair, beard, age, complexion and natural athletic build. Do not copy its pose.',
    'The athlete wears a completely plain black short-sleeve technical shirt, plain black shorts and plain black training shoes. NO logo, NO letters, NO symbol, NO brand, NO watermark anywhere. Branding is composited later from the exact official repository asset.',
    'Environment: premium dark green and charcoal gym, realistic commercial photography, warm cream highlights and restrained gold architectural details. No neon, no generic AI glow, no poster design, no infographic and no text.',
    `Camera language: ${plan.camera}. Keep the entire athlete, relevant hands, feet, joints, support points and all equipment visible. Leave useful background breathing room, especially toward the upper corners, without compromising biomechanics.`,
    `Exercise: ${exercise.name_es}. Pattern: ${exercise.pattern}. Intent: ${exercise.intent}. Equipment: ${exercise.equipment}.`,
    `Required ${phase.toUpperCase()} phase: ${phaseText}`,
    `Technique cues: ${(exercise.cues||[]).join(' | ')}. Precautions: ${(exercise.precautions||[]).join(' | ')}.`,
    'Biomechanics must be anatomically possible, controlled and safe. No duplicated limbs, extra fingers, malformed equipment, impossible joint angles, hidden grip/support or background people.',
    'Do not show both phases. Do not split the frame. Do not add anatomy diagrams, arrows, labels or any branding.'
  ].join('\n');
  const bytes=fs.readFileSync(athleteRef);const form=new FormData();form.append('model',MODEL);form.append('prompt',prompt);form.append('width',String(RAW_WIDTH));form.append('height',String(RAW_HEIGHT));form.append('guidance','5');form.append('seed',String(seedFor(exercise.id,phase)));form.append('input_image_0',new Blob([bytes],{type:'image/png'}),'iberfit-approved-athlete.png');
  const response=await fetch(proxy,{method:'POST',headers:{authorization:`Bearer ${token}`},body:form,redirect:'error'});if(!response.ok)throw new Error(`GENERATE_HTTP_${response.status}:${(await response.text()).slice(0,1000)}`);const payload=await response.json();if(payload?.ok!==true)throw new Error(`GENERATE_PROXY_FAILED:${JSON.stringify(payload).slice(0,1200)}`);
  const image=extractImage(payload),mime=detectMime(image);fs.mkdirSync(outDir,{recursive:true});const file=path.join(outDir,`${exercise.id}-${phase}${ext(mime)}`);fs.writeFileSync(file,image);const metadata={schema:'iberfit.exercise.media.auto.phase.v1',exercise_id:exercise.id,phase,model:payload.model||MODEL,fallback:Boolean(payload.fallback),width:RAW_WIDTH,height:RAW_HEIGHT,mime,seed:seedFor(exercise.id,phase),prompt_sha256:crypto.createHash('sha256').update(prompt).digest('hex'),publishable:false};fs.writeFileSync(`${file}.json`,`${JSON.stringify(metadata,null,2)}\n`);console.log(JSON.stringify({ok:true,file,...metadata}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
