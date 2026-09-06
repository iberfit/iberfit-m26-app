#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildExerciseVisualBrief } from '../../src/m26/exercises/catalog.js';

export const CLOUDFLARE_IMAGE_MODEL='@cf/black-forest-labs/flux-2-klein-4b';
export const DEFAULT_WIDTH=768;
export const DEFAULT_HEIGHT=960;
const SAFE_EXERCISE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SAFE_ACCOUNT_ID=/^[A-Fa-f0-9]{32}$/u;
const MAX_REFERENCE_BYTES=2_000_000;

function exactId(value){
  const id=String(value??'');
  if(!id||id!==id.trim()||!SAFE_EXERCISE_ID.test(id))throw new Error('IBERFIT_GENERATOR_EXERCISE_ID_INVALID');
  return id;
}

export function deterministicSeed(exerciseId,style='iberfit-premium-movement-pair-v1'){
  const id=exactId(exerciseId);
  const digest=crypto.createHash('sha256').update(`${style}:${id}`).digest();
  return digest.readUInt32BE(0)&0x7fffffff;
}

function list(value){return (Array.isArray(value)?value:[]).map((item)=>String(item||'').trim()).filter(Boolean);}
function line(value,fallback='ninguno'){const out=String(value??'').replace(/\s+/gu,' ').trim();return out||fallback;}

export function buildCloudflareImagePrompt(exercise,{hasAthleteReference=false,hasLogoReference=false}={}){
  const brief=buildExerciseVisualBrief(exercise);
  const instructions=list(brief.biomechanics.instructions).slice(0,6).join('; ')||'seguir biomecánica estándar segura del ejercicio';
  const cues=list(exercise?.cues).slice(0,6).join('; ')||'control postural y recorrido técnico';
  const primary=list(brief.muscles.primary).join(', ')||'músculos principales del ejercicio';
  const secondary=list(brief.muscles.secondary).join(', ')||'sin secundarios destacados';
  const identity=hasAthleteReference
    ?'Use input image 0 ONLY as the canonical IBERFIT male athlete, outfit and dark premium gym identity/style reference. Preserve the same adult man; do not copy the reference pose.'
    :'Use one consistent adult male athlete: late 20s to 30s, short dark-brown hair, trimmed beard, light/olive skin, athletic muscular but realistic proportions.';
  const branding=hasLogoReference
    ?'Input image 1 is the exact official IBERFIT gold isotype. If it can be reproduced faithfully, place ONE small isotype on the athlete left chest. Never generate the word IBERFIT or any other letters.'
    :'No brand reference was supplied: leave the shirt plain black. Do NOT invent a logo, symbol, brand name or lettering.';

  return [
    'Create ONE clean premium fitness-instruction photograph for the IBERFIT exercise library, vertical 4:5.',
    identity,
    branding,
    'Same visual language: fitted black short-sleeve technical shirt, black athletic shorts, black training shoes, premium charcoal/black gym, subtle green architectural accent light, cinematic instructional lighting, realistic photography.',
    `Exercise: ${line(brief.exerciseName)}.`,
    `Movement pattern: ${line(brief.biomechanics.pattern)}. Equipment: ${line(brief.biomechanics.equipment)}.`,
    `Required execution: ${instructions}. Coaching cues: ${cues}.`,
    `Primary muscles: ${primary}. Secondary muscles: ${secondary}.`,
    'Show the technically most informative movement phase, full body and all relevant equipment visible, slight three-quarter side instructional camera angle. Feet, hands and the complete load/cable/machine path must be visible when relevant.',
    'Biomechanics are strict: anatomically possible joints, neutral and exercise-appropriate spine, correct grip and stance, realistic balance/support, correct machine setup and cable/bar path, no unsafe or misleading posture.',
    'Keep the main photograph clean. NO title, NO exercise name, NO captions, NO arrows, NO start/end labels, NO panels, NO footer, NO buttons, NO poster, NO infographic, NO watermark, NO random text.',
    'A tiny tasteful anatomy inset in one unobtrusive corner is permitted only if it does not cover the athlete or equipment; highlight primary muscles and secondary muscles subtly; no anatomical text labels.',
    'No duplicated person, no extra limbs/fingers, no cropped critical hands/feet, no impossible equipment geometry, no exaggerated bodybuilder proportions, no invented logos or lettering.',
  ].join('\n');
}

function mimeFor(filePath){
  const ext=path.extname(filePath).toLowerCase();
  if(ext==='.png')return 'image/png';
  if(ext==='.webp')return 'image/webp';
  if(ext==='.jpg'||ext==='.jpeg')return 'image/jpeg';
  throw new Error(`IBERFIT_GENERATOR_REFERENCE_TYPE_INVALID:${ext}`);
}

export function readReference(filePath){
  if(!filePath)return null;
  const resolved=path.resolve(filePath);
  const bytes=fs.readFileSync(resolved);
  if(!bytes.length||bytes.length>MAX_REFERENCE_BYTES)throw new Error('IBERFIT_GENERATOR_REFERENCE_SIZE_INVALID');
  return {bytes,mime:mimeFor(resolved),name:path.basename(resolved)};
}

function cloudflareEndpoint(accountId,model=CLOUDFLARE_IMAGE_MODEL){
  const account=String(accountId||'').trim();
  if(!SAFE_ACCOUNT_ID.test(account))throw new Error('IBERFIT_GENERATOR_CLOUDFLARE_ACCOUNT_INVALID');
  if(model!==CLOUDFLARE_IMAGE_MODEL)throw new Error('IBERFIT_GENERATOR_MODEL_NOT_ALLOWED');
  return `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`;
}

function safeProxyEndpoint(value,pathName){
  const raw=String(value||'').trim();
  if(!raw)return null;
  let url;try{url=new URL(raw);}catch{throw new Error('IBERFIT_GENERATOR_PROXY_URL_INVALID');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('IBERFIT_GENERATOR_PROXY_URL_INVALID');
  url.pathname=url.pathname.replace(/\/+$/u,'')+pathName;
  return url.href;
}

function imageFromCloudflarePayload(payload){
  const base64=payload?.result?.image??payload?.image??payload?.result;
  if(typeof base64!=='string'||base64.length<32)throw new Error('IBERFIT_GENERATOR_IMAGE_MISSING');
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length<128)throw new Error('IBERFIT_GENERATOR_IMAGE_INVALID');
  return bytes;
}

function detectMime(bytes){
  if(bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return 'image/png';
  if(bytes[0]===0xff&&bytes[1]===0xd8)return 'image/jpeg';
  if(bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return 'image/webp';
  return 'application/octet-stream';
}
function extensionFor(mime){return mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg';}

export async function generateCloudflareExerciseImage({
  exercise,
  accountId,
  apiToken,
  proxyUrl=null,
  proxyToken=null,
  fetchImpl=globalThis.fetch,
  athleteReference=null,
  logoReference=null,
  width=DEFAULT_WIDTH,
  height=DEFAULT_HEIGHT,
  seed=deterministicSeed(exercise?.id),
}={}){
  if(typeof fetchImpl!=='function')throw new Error('IBERFIT_GENERATOR_FETCH_UNAVAILABLE');
  const proxy=safeProxyEndpoint(proxyUrl,'/generate');
  const token=String(proxy?proxyToken:apiToken||'').trim();
  if(token.length<20)throw new Error(proxy?'IBERFIT_GENERATOR_PROXY_TOKEN_REQUIRED':'IBERFIT_GENERATOR_CLOUDFLARE_TOKEN_REQUIRED');
  const id=exactId(exercise?.id);
  const w=Number(width),h=Number(height);
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<256||h<256||w>1920||h>1920||Math.abs(w/h-0.8)>0.001)throw new Error('IBERFIT_GENERATOR_DIMENSIONS_INVALID');

  const prompt=buildCloudflareImagePrompt(exercise,{hasAthleteReference:Boolean(athleteReference),hasLogoReference:Boolean(logoReference)});
  const form=new FormData();
  form.append('prompt',prompt);
  form.append('width',String(w));
  form.append('height',String(h));
  form.append('seed',String(seed));
  if(athleteReference)form.append('input_image_0',new Blob([athleteReference.bytes],{type:athleteReference.mime}),athleteReference.name||'athlete-reference');
  if(logoReference)form.append('input_image_1',new Blob([logoReference.bytes],{type:logoReference.mime}),logoReference.name||'iberfit-isotype-reference');

  const response=await fetchImpl(proxy||cloudflareEndpoint(accountId),{
    method:'POST',
    headers:{authorization:`Bearer ${token}`},
    body:form,
    redirect:'error',
  });
  if(!response?.ok){
    let detail='';try{detail=(await response.text()).slice(0,600);}catch{}
    throw new Error(`IBERFIT_GENERATOR_CLOUDFLARE_HTTP_${response?.status||0}:${detail}`);
  }
  const contentType=String(response.headers?.get?.('content-type')||'').toLowerCase();
  let bytes;
  if(contentType.startsWith('image/'))bytes=Buffer.from(await response.arrayBuffer());
  else bytes=imageFromCloudflarePayload(await response.json());
  const mime=detectMime(bytes);
  if(!mime.startsWith('image/'))throw new Error('IBERFIT_GENERATOR_IMAGE_TYPE_INVALID');
  return Object.freeze({exerciseId:id,model:CLOUDFLARE_IMAGE_MODEL,width:w,height:h,seed,mime,bytes,prompt,transport:proxy?'workers_ai_binding':'rest_api'});
}

function catalogRecords(raw){
  const records=Array.isArray(raw)?raw:raw?.exercises??raw?.data;
  if(!Array.isArray(records))throw new Error('IBERFIT_GENERATOR_CATALOG_INVALID');
  return records;
}
function arg(argv,name){const i=argv.indexOf(name);return i>=0?argv[i+1]:null;}

export async function runCli(argv=process.argv.slice(2)){
  const catalogPath=arg(argv,'--catalog')||'baseline_m25_2/exercise-catalog-m25.json';
  const exerciseId=exactId(arg(argv,'--exercise-id')||'bw-squat');
  const outDir=path.resolve(arg(argv,'--out-dir')||'recovery/exercise-media-smoke');
  const athletePath=arg(argv,'--athlete-ref');
  const logoPath=arg(argv,'--logo-ref');
  const raw=JSON.parse(fs.readFileSync(path.resolve(catalogPath),'utf8'));
  const exercise=catalogRecords(raw).find((item)=>String(item?.id||'')===exerciseId);
  if(!exercise)throw new Error(`IBERFIT_GENERATOR_EXERCISE_NOT_FOUND:${exerciseId}`);
  const result=await generateCloudflareExerciseImage({
    exercise,
    accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken:process.env.CLOUDFLARE_API_TOKEN,
    proxyUrl:process.env.IBERFIT_AI_PROXY_URL,
    proxyToken:process.env.IBERFIT_AI_PROXY_TOKEN,
    athleteReference:readReference(athletePath),
    logoReference:readReference(logoPath),
  });
  fs.mkdirSync(outDir,{recursive:true});
  const extension=extensionFor(result.mime);
  const imagePath=path.join(outDir,`${exerciseId}-candidate${extension}`);
  fs.writeFileSync(imagePath,result.bytes);
  const metadata={
    schema:'iberfit.exercise.generation-candidate.v1',
    exercise_id:exerciseId,
    name_es:exercise.name_es||exercise.name||exerciseId,
    model:result.model,
    transport:result.transport,
    width:result.width,height:result.height,seed:result.seed,mime:result.mime,
    image:path.basename(imagePath),
    references:{athlete:Boolean(athletePath),official_isotype:Boolean(logoPath)},
    qa:{biomechanics:'pending',visual:'pending'},
    publishable:false,
    generated_at:new Date().toISOString(),
    prompt_sha256:crypto.createHash('sha256').update(result.prompt).digest('hex'),
  };
  fs.writeFileSync(path.join(outDir,`${exerciseId}-candidate.json`),`${JSON.stringify(metadata,null,2)}\n`);
  console.log(JSON.stringify({ok:true,exerciseId,image:imagePath,model:result.model,seed:result.seed,transport:result.transport}));
  return {result,metadata,imagePath};
}

const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';
if(invoked===import.meta.url){runCli().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});}
