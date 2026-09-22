#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MODEL='@cf/black-forest-labs/flux-2-klein-4b';
const RAW_WIDTH=1024;
const RAW_HEIGHT=1600;
const PILOT_TARGETS=Object.freeze([
  'IBF-DOMINADA-PRONADA',
  'IBF-BUENOS-DIAS-CON-BARRA',
  'IBF-APERTURAS-CON-MANCUERNAS',
]);

const PHASES=Object.freeze({
  'IBF-DOMINADA-PRONADA':Object.freeze({
    start:'Strict active hang from a fixed overhead pull-up bar with a pronated overhand grip slightly wider than shoulder width. Elbows extended, scapulae engaged without shrugging, legs quiet and vertical, no kipping.',
    final:'Top position of the same strict pronated pull-up. Chest close to the same bar, elbows driven down and back, shoulders depressed, trunk controlled and vertical, no swinging or kipping.',
  }),
  'IBF-BUENOS-DIAS-CON-BARRA':Object.freeze({
    start:'Standing tall with a straight barbell securely across the upper back/trapezius, feet about hip width, knees softly bent, torso upright, neutral spine and symmetrical grip.',
    final:'Same barbell fixed across the upper back while performing a hip hinge. Hips travel backward, torso inclines forward about 40-55 degrees, spine stays neutral, knees remain softly flexed, feet planted and bar never rolls onto the neck.',
  }),
  'IBF-APERTURAS-CON-MANCUERNAS':Object.freeze({
    start:'Supine on a flat bench with feet planted, one dumbbell in each hand above the chest, palms facing each other, elbows softly bent about 10-20 degrees and shoulders stable.',
    final:'Same flat bench and body position while both arms open symmetrically to the sides in a controlled dumbbell fly. Elbow bend stays almost unchanged, dumbbells finish around chest level, shoulders stay down and there is no pressing motion.',
  }),
});

function arg(name){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:null;}
function exact(value,label){const normalized=String(value||'').trim();if(!normalized)throw new Error(`${label}_REQUIRED`);return normalized;}
function seedFor(id,phase){const digest=crypto.createHash('sha256').update(`${id}:${phase}:iberfit-exercise-media-system-v1-pilot`).digest();return digest.readUInt32BE(0)&0x7fffffff;}
function detectMime(bytes){
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';
  if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';
  throw new Error('IMAGE_TYPE_UNSUPPORTED');
}
function extensionFor(mime){return mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg';}
function extractImage(payload){
  const candidates=[payload?.result?.image,payload?.image,payload?.result?.result?.image,payload?.result?.result,payload?.result];
  for(const candidate of candidates){
    if(typeof candidate!=='string'||candidate.length<128)continue;
    const bytes=Buffer.from(candidate,'base64');
    if(bytes.length>128)return bytes;
  }
  throw new Error('IMAGE_MISSING');
}
function catalogRows(raw){if(Array.isArray(raw))return raw;if(Array.isArray(raw?.exercises))return raw.exercises;if(Array.isArray(raw?.data))return raw.data;throw new Error('CATALOG_INVALID');}
function readExercise(file,id){const exercise=catalogRows(JSON.parse(fs.readFileSync(file,'utf8'))).find((item)=>String(item?.id||'')===id);if(!exercise)throw new Error(`EXERCISE_NOT_FOUND:${id}`);return exercise;}
function promptFor(exercise,phase){
  const contract=PHASES[exercise.id];
  if(!contract)throw new Error(`PILOT_TARGET_NOT_ALLOWED:${exercise.id}`);
  const phaseText=contract[phase];
  if(!phaseText)throw new Error(`PHASE_INVALID:${phase}`);
  return [
    'Create ONE realistic premium exercise-library photograph for IBERFIT. Exactly one adult male athlete and one continuous scene.',
    'Image 0 is the approved IBERFIT male identity reference ONLY. Preserve face, hair, beard, age, complexion and natural athletic build. Do not copy its pose.',
    'Image 1 is a strict abstract pose/equipment guide for this exact phase. Match its body orientation, support points, joint relationships and equipment placement. Ignore its drawing style and colors.',
    'The athlete wears a completely plain black short-sleeve technical shirt, plain black shorts and plain black training shoes. Render NO logo, NO letters, NO symbols, NO watermark and NO brand anywhere. IBERFIT branding is composited deterministically after generation.',
    'Environment: premium dark green/charcoal gym, realistic commercial fitness photography, warm cream highlights and restrained gold details. No neon, no generic AI glow, no poster look, no infographic and no text.',
    'Keep the full athlete, every relevant joint, both hands/feet and all load/support equipment visible. Subject should remain centered enough for a later narrow crop without losing biomechanically important content.',
    'Reserve clean background breathing room near the upper outer corners; do not place critical body parts or equipment there unless the exercise itself requires it.',
    `Exercise: ${exercise.name_es||exercise.name||exercise.id}. Pattern: ${exercise.pattern||''}. Equipment: ${exercise.equipment||''}.`,
    `Required ${phase.toUpperCase()} phase: ${phaseText}`,
    'Biomechanics must be anatomically possible and safe. No duplicated limbs, extra fingers, malformed bars/dumbbells/bench, hidden grip, impossible joint angles or background people.',
    'Do not show both phases. Do not create split screen. Do not add anatomy graphics. Do not add arrows. Do not add labels. Do not add any branding.',
  ].join('\n');
}
async function main(){
  const id=exact(arg('--exercise-id'),'EXERCISE_ID');
  const phase=exact(arg('--phase'),'PHASE');
  const catalog=exact(arg('--catalog'),'CATALOG');
  const athleteRef=exact(arg('--athlete-ref'),'ATHLETE_REF');
  const poseRef=exact(arg('--pose-ref'),'POSE_REF');
  const outDir=exact(arg('--out-dir'),'OUT_DIR');
  if(!PILOT_TARGETS.includes(id))throw new Error(`PILOT_TARGET_NOT_ALLOWED:${id}`);
  if(!['start','final'].includes(phase))throw new Error(`PHASE_INVALID:${phase}`);
  const proxy=exact(process.env.IBERFIT_AI_PROXY_URL,'IBERFIT_AI_PROXY_URL').replace(/\/+$/,'')+'/generate';
  const token=exact(process.env.IBERFIT_AI_PROXY_TOKEN,'IBERFIT_AI_PROXY_TOKEN');
  const exercise=readExercise(catalog,id);
  const athleteBytes=fs.readFileSync(athleteRef);
  const poseBytes=fs.readFileSync(poseRef);
  const prompt=promptFor(exercise,phase);
  const form=new FormData();
  form.append('model',MODEL);
  form.append('prompt',prompt);
  form.append('width',String(RAW_WIDTH));
  form.append('height',String(RAW_HEIGHT));
  form.append('guidance','5');
  form.append('seed',String(seedFor(id,phase)));
  form.append('input_image_0',new Blob([athleteBytes],{type:'image/png'}),'iberfit-athlete-reference.png');
  form.append('input_image_1',new Blob([poseBytes],{type:'image/png'}),'iberfit-pose-guide.png');
  const response=await fetch(proxy,{method:'POST',headers:{authorization:`Bearer ${token}`},body:form,redirect:'error'});
  if(!response.ok)throw new Error(`GENERATE_HTTP_${response.status}:${(await response.text()).slice(0,1000)}`);
  const payload=await response.json();
  if(payload?.ok!==true)throw new Error(`GENERATE_PROXY_FAILED:${JSON.stringify(payload).slice(0,1200)}`);
  const image=extractImage(payload);
  const mime=detectMime(image);
  fs.mkdirSync(outDir,{recursive:true});
  const file=path.join(outDir,`${id}-${phase}${extensionFor(mime)}`);
  fs.writeFileSync(file,image);
  const metadata={
    schema:'iberfit.exercise.media.system-v1.phase-candidate.v1',
    exercise_id:id,
    phase,
    model:payload.model||MODEL,
    fallback:Boolean(payload.fallback),
    width:RAW_WIDTH,
    height:RAW_HEIGHT,
    mime,
    seed:seedFor(id,phase),
    prompt_sha256:crypto.createHash('sha256').update(prompt).digest('hex'),
    pose_reference:path.basename(poseRef),
    generated_at:new Date().toISOString(),
    publishable:false,
  };
  fs.writeFileSync(`${file}.json`,`${JSON.stringify(metadata,null,2)}\n`);
  console.log(JSON.stringify({ok:true,file,...metadata}));
}
main().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exit(1);});
