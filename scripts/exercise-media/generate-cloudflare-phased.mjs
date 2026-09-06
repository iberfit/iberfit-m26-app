#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CLOUDFLARE_IMAGE_MODEL, deterministicSeed, readReference} from './generate-cloudflare.mjs';

export const PHASE_WIDTH=512;
export const PHASE_HEIGHT=1280;
export const SUPPORTED_PHASED_EXERCISE_ID='IBF-ABDUCCION-DE-CADERA-LATERAL';
const SAFE_EXERCISE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

function exactId(value){
  const id=String(value??'');
  if(!id||id!==id.trim()||!SAFE_EXERCISE_ID.test(id))throw new Error('IBERFIT_PHASED_EXERCISE_ID_INVALID');
  return id;
}
function arg(argv,name){const i=argv.indexOf(name);return i>=0?argv[i+1]:null;}
function safeProxyEndpoint(value){
  const raw=String(value||'').trim();
  let url;try{url=new URL(raw);}catch{throw new Error('IBERFIT_PHASED_PROXY_URL_INVALID');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('IBERFIT_PHASED_PROXY_URL_INVALID');
  url.pathname=url.pathname.replace(/\/+$/u,'')+'/generate';
  return url.href;
}
function imageFromPayload(payload){
  const base64=payload?.result?.image??payload?.image??payload?.result;
  if(typeof base64!=='string'||base64.length<32)throw new Error('IBERFIT_PHASED_IMAGE_MISSING');
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length<128)throw new Error('IBERFIT_PHASED_IMAGE_INVALID');
  return bytes;
}
function detectMime(bytes){
  if(bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';
  if(bytes[0]===0xff&&bytes[1]===0xd8)return'image/jpeg';
  if(bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';
  throw new Error('IBERFIT_PHASED_IMAGE_TYPE_INVALID');
}
function extFor(mime){return mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg';}

export function phaseSeed(exerciseId){
  return deterministicSeed(exactId(exerciseId),'iberfit-premium-single-phase-v2');
}

export function buildPhasePrompt(exercise={},phase='start',{hasAthleteReference=false}={}){
  const id=exactId(exercise.id);
  if(id!==SUPPORTED_PHASED_EXERCISE_ID)throw new Error(`IBERFIT_PHASED_EXERCISE_NOT_SUPPORTED:${id}`);
  if(!['start','end'].includes(phase))throw new Error('IBERFIT_PHASED_PHASE_INVALID');
  const identity=hasAthleteReference
    ?'Input image 0 is ONLY the canonical IBERFIT male FACE/IDENTITY reference. Preserve the same face, hair, beard, age and complexion. Ignore and do not copy any pose, arms, exercise, crop, shirt text or graphics from the reference.'
    :'Use one adult male athlete with short dark-brown hair, trimmed beard, light/olive skin and realistic athletic proportions.';
  const common=[
    'Create ONE realistic premium fitness-instruction photograph. EXACTLY ONE adult male athlete, no duplicate person and no inset.',
    identity,
    'Vertical narrow full-body framing. Camera is FRONT-FACING and level, not side view. Entire head, both hips, both knees, both ankles and both shoes are visible with floor beneath the feet.',
    'Same fixed IBERFIT visual language: plain fitted black short-sleeve technical shirt, plain black athletic shorts, black training shoes, premium charcoal/black gym, subtle green architectural accent light, cinematic but clear instructional lighting.',
    'The shirt must be completely PLAIN BLACK: NO logo, NO word, NO letters, NO sleeve mark, NO decorative symbol. Branding will be composited later from the official asset.',
    'No title, captions, arrows, labels, panels, anatomy inset, muscle diagram, watermark, poster, infographic, text or extra people.',
    'Exercise is STANDING BODYWEIGHT HIP ABDUCTION, a lower-body movement in the FRONTAL PLANE. No band, cable, machine, ankle weight, bench or other exercise equipment.',
    'Keep pelvis level, trunk upright, shoulders level, support foot flat, arms relaxed naturally at the sides, hands away from the legs. Never grab or touch either leg.',
  ];
  if(phase==='start'){
    common.push(
      'START PHASE ONLY: stand tall on BOTH feet, legs straight and parallel at approximately hip width, both feet pointing forward, weight balanced evenly, arms hanging relaxed at the sides.',
      'Do not raise either leg. Do not flex either hip or knee. This image is only the neutral starting position for standing hip abduction.'
    );
  }else{
    common.push(
      'END/PEAK PHASE ONLY: stand tall on the LEFT support leg while the RIGHT leg stays STRAIGHT and moves unmistakably SIDEWAYS to the athlete’s RIGHT in the frontal plane by about 30 degrees.',
      'The moving RIGHT foot must be clearly displaced HORIZONTALLY OUT TO THE SIDE of the body, creating a large visible air gap from the LEFT support leg. The moving foot remains below hip height and toes point mostly forward.',
      'ABSOLUTE NEGATIVES: NO forward leg raise, NO high knee, NO marching, NO front kick, NO knee-to-chest, NO hip-flexion pose, NO bent raised knee, NO rear kick, NO crossed leg, NO side lunge, NO hand contact with the moving leg.',
      'The visible action must be isolated RIGHT HIP ABDUCTION. The torso stays vertical and the pelvis stays level without leaning or rotation.'
    );
  }
  return common.join('\n');
}

export async function generateCloudflareExercisePhase({exercise,phase,athleteReference,proxyUrl,proxyToken,fetchImpl=globalThis.fetch,width=PHASE_WIDTH,height=PHASE_HEIGHT,seed=phaseSeed(exercise?.id)}={}){
  if(typeof fetchImpl!=='function')throw new Error('IBERFIT_PHASED_FETCH_UNAVAILABLE');
  const id=exactId(exercise?.id);
  if(id!==SUPPORTED_PHASED_EXERCISE_ID)throw new Error(`IBERFIT_PHASED_EXERCISE_NOT_SUPPORTED:${id}`);
  if(!['start','end'].includes(phase))throw new Error('IBERFIT_PHASED_PHASE_INVALID');
  const token=String(proxyToken||'').trim();if(token.length<20)throw new Error('IBERFIT_PHASED_PROXY_TOKEN_REQUIRED');
  const w=Number(width),h=Number(height);
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<256||h<512||w>1024||h>1920||w>=h)throw new Error('IBERFIT_PHASED_DIMENSIONS_INVALID');
  const prompt=buildPhasePrompt(exercise,phase,{hasAthleteReference:Boolean(athleteReference)});
  const form=new FormData();
  form.append('prompt',prompt);
  form.append('width',String(w));
  form.append('height',String(h));
  form.append('seed',String(seed));
  if(athleteReference)form.append('input_image_0',new Blob([athleteReference.bytes],{type:athleteReference.mime}),athleteReference.name||'athlete-identity-reference');
  const response=await fetchImpl(safeProxyEndpoint(proxyUrl),{method:'POST',headers:{authorization:`Bearer ${token}`},body:form,redirect:'error'});
  if(!response?.ok){let detail='';try{detail=(await response.text()).slice(0,600);}catch{}throw new Error(`IBERFIT_PHASED_CLOUDFLARE_HTTP_${response?.status||0}:${detail}`);}
  const contentType=String(response.headers?.get?.('content-type')||'').toLowerCase();
  let bytes;if(contentType.startsWith('image/'))bytes=Buffer.from(await response.arrayBuffer());else bytes=imageFromPayload(await response.json());
  const mime=detectMime(bytes);
  return Object.freeze({exerciseId:id,phase,model:CLOUDFLARE_IMAGE_MODEL,width:w,height:h,seed,mime,bytes,prompt,transport:'workers_ai_binding'});
}

function catalogRecords(raw){const records=Array.isArray(raw)?raw:raw?.exercises??raw?.data;if(!Array.isArray(records))throw new Error('IBERFIT_PHASED_CATALOG_INVALID');return records;}

export async function runCli(argv=process.argv.slice(2)){
  const catalogPath=arg(argv,'--catalog')||'baseline_m25_2/exercise-catalog-m25.json';
  const exerciseId=exactId(arg(argv,'--exercise-id')||SUPPORTED_PHASED_EXERCISE_ID);
  const athletePath=arg(argv,'--athlete-ref');if(!athletePath)throw new Error('IBERFIT_PHASED_ATHLETE_REFERENCE_REQUIRED');
  const outDir=path.resolve(arg(argv,'--out-dir')||'recovery/exercise-media-phases');
  const raw=JSON.parse(fs.readFileSync(path.resolve(catalogPath),'utf8'));
  const exercise=catalogRecords(raw).find((item)=>String(item?.id||'')===exerciseId);
  if(!exercise)throw new Error(`IBERFIT_PHASED_EXERCISE_NOT_FOUND:${exerciseId}`);
  const athleteReference=readReference(athletePath);
  const seed=phaseSeed(exerciseId);
  const outputs=[];
  for(const phase of ['start','end']){
    const generated=await generateCloudflareExercisePhase({exercise,phase,athleteReference,proxyUrl:process.env.IBERFIT_AI_PROXY_URL,proxyToken:process.env.IBERFIT_AI_PROXY_TOKEN,seed});
    fs.mkdirSync(outDir,{recursive:true});
    const file=path.join(outDir,`${exerciseId}-${phase}${extFor(generated.mime)}`);
    fs.writeFileSync(file,generated.bytes);
    outputs.push({phase,file,mime:generated.mime,width:generated.width,height:generated.height,seed:generated.seed});
  }
  const metadata={schema:'iberfit.exercise.phased-generation.v1',exercise_id:exerciseId,model:CLOUDFLARE_IMAGE_MODEL,transport:'workers_ai_binding',seed,athlete_reference:true,phases:outputs.map((x)=>({phase:x.phase,file:path.basename(x.file),mime:x.mime,width:x.width,height:x.height})),generated_at:new Date().toISOString()};
  fs.writeFileSync(path.join(outDir,`${exerciseId}-phases.json`),`${JSON.stringify(metadata,null,2)}\n`);
  console.log(JSON.stringify({ok:true,exerciseId,seed,phases:outputs.map((x)=>x.file)}));
  return {metadata,outputs};
}

const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';
if(invoked===import.meta.url){runCli().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});}
