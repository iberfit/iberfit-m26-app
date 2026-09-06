#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildExerciseVisualBrief } from '../../src/m26/exercises/catalog.js';

export const CLOUDFLARE_IMAGE_MODEL='@cf/black-forest-labs/flux-2-klein-4b';
export const DEFAULT_WIDTH=768;
export const DEFAULT_HEIGHT=960;
export const DEFAULT_SMOKE_EXERCISE_ID='IBF-ABDUCCION-DE-CADERA-LATERAL';
const SAFE_EXERCISE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SAFE_ACCOUNT_ID=/^[A-Fa-f0-9]{32}$/u;
const MAX_REFERENCE_BYTES=2_000_000;
const MAX_REFERENCE_DIMENSION=512;

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
    ?'Use input image 0 ONLY as the canonical IBERFIT male athlete, outfit and dark premium gym identity/style reference. Preserve the same adult man in both required movement phases; do not copy the reference pose.'
    :'Use one consistent adult male athlete identity in both movement phases: late 20s to 30s, short dark-brown hair, trimmed beard, light/olive skin, athletic muscular but realistic proportions.';
  const branding=hasLogoReference
    ?'Input image 1 is the exact official IBERFIT gold isotype. Reproduce it faithfully only as a very small mark on the left chest of the black shirt in each required pose; never place it elsewhere and never generate the word IBERFIT or any other letters.'
    :'No brand reference was supplied: leave both shirts plain black. Do NOT invent a logo, symbol, brand name or lettering.';

  return [
    'Create ONE clean premium fitness-instruction photograph for the IBERFIT exercise library, vertical 4:5, containing a clear start/end movement pair.',
    identity,
    branding,
    'Use the same visual language in both phases: fitted black short-sleeve technical shirt, black athletic shorts, black training shoes, premium charcoal/black gym, subtle green architectural accent light, cinematic instructional lighting, realistic photography.',
    `Exercise: ${line(brief.exerciseName)}.`,
    `Movement pattern: ${line(brief.biomechanics.pattern)}. Equipment: ${line(brief.biomechanics.equipment)}.`,
    `Required execution: ${instructions}. Coaching cues: ${cues}.`,
    `Primary muscles: ${primary}. Secondary muscles: ${secondary}.`,
    'Show exactly TWO full-body depictions of the SAME athlete in one clean composition: start position on the left and end or peak-contraction position on the right. Use the same equipment setup, camera language, scale, outfit and gym. Do not add start/end labels. The two poses must make the movement progression obvious by body position alone.',
    'Both movement phases must be biomechanically correct. Keep feet, hands and all relevant equipment visible. Use a slight three-quarter side instructional camera angle and enough spacing that neither pose overlaps or crops the other.',
    'Biomechanics are strict: anatomically possible joints, neutral and exercise-appropriate spine, correct grip and stance, realistic balance/support, correct machine setup and cable/bar path, no unsafe or misleading posture.',
    'Keep the main photograph clean. NO title, NO exercise name, NO captions, NO arrows, NO start/end labels, NO panels, NO footer, NO buttons, NO poster, NO infographic, NO watermark, NO random text.',
    'A tiny tasteful anatomy inset in one unobtrusive corner is permitted only if it does not cover either movement phase or equipment; highlight primary muscles and secondary muscles subtly; no anatomical text labels.',
    'Exactly two required pose depictions only: no third athlete, no background people, no extra limbs/fingers, no fused or duplicated body parts, no cropped critical hands/feet, no impossible equipment geometry, no exaggerated bodybuilder proportions, no invented logos or lettering.',
  ].join('\n');
}

function mimeFor(filePath){
  const ext=path.extname(filePath).toLowerCase();
  if(ext==='.png')return 'image/png';
  if(ext==='.webp')return 'image/webp';
  if(ext==='.jpg'||ext==='.jpeg')return 'image/jpeg';
  throw new Error(`IBERFIT_GENERATOR_REFERENCE_TYPE_INVALID:${ext}`);
}

function jpegDimensions(bytes){
  if(bytes.length<12||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  for(let offset=2;offset+9<bytes.length;offset+=1){
    if(bytes[offset]!==0xff||!sof.has(bytes[offset+1]))continue;
    const size=bytes.readUInt16BE(offset+2);
    const precision=bytes[offset+4];
    const height=bytes.readUInt16BE(offset+5);
    const width=bytes.readUInt16BE(offset+7);
    const components=bytes[offset+9];
    if(size>=8&&(precision===8||precision===12)&&width>0&&height>0&&components>0&&components<=4)return {width,height};
  }
  return null;
}

function webpDimensions(bytes){
  if(bytes.length<30||bytes.subarray(0,4).toString('ascii')!=='RIFF'||bytes.subarray(8,12).toString('ascii')!=='WEBP')return null;
  const chunk=bytes.subarray(12,16).toString('ascii');
  if(chunk==='VP8X')return {width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};
  if(chunk==='VP8 '&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a){
    return {width:bytes.readUInt16LE(26)&0x3fff,height:bytes.readUInt16LE(28)&0x3fff};
  }
  if(chunk==='VP8L'&&bytes[20]===0x2f){
    const b0=bytes[21],b1=bytes[22],b2=bytes[23],b3=bytes[24];
    return {width:1+(((b1&0x3f)<<8)|b0),height:1+(((b3&0x0f)<<10)|(b2<<2)|((b1&0xc0)>>6))};
  }
  return null;
}

export function referenceDimensions(bytes,mime){
  let dimensions=null;
  if(mime==='image/png'&&bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))dimensions={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  else if(mime==='image/jpeg')dimensions=jpegDimensions(bytes);
  else if(mime==='image/webp')dimensions=webpDimensions(bytes);
  if(!dimensions||!Number.isInteger(dimensions.width)||!Number.isInteger(dimensions.height)||dimensions.width<1||dimensions.height<1)throw new Error('IBERFIT_GENERATOR_REFERENCE_DIMENSIONS_INVALID');
  if(dimensions.width>MAX_REFERENCE_DIMENSION||dimensions.height>MAX_REFERENCE_DIMENSION)throw new Error(`IBERFIT_GENERATOR_REFERENCE_DIMENSIONS_TOO_LARGE:${dimensions.width}x${dimensions.height}`);
  return Object.freeze(dimensions);
}

export function readReference(filePath){
  if(!filePath)return null;
  const resolved=path.resolve(filePath);
  const bytes=fs.readFileSync(resolved);
  if(!bytes.length||bytes.length>MAX_REFERENCE_BYTES)throw new Error('IBERFIT_GENERATOR_REFERENCE_SIZE_INVALID');
  const mime=mimeFor(resolved);
  let dimensions;
  try{dimensions=referenceDimensions(bytes,mime);}catch(error){throw new Error(`${error instanceof Error?error.message:String(error)}:${path.basename(resolved)}`);}
  return {bytes,mime,name:path.basename(resolved),...dimensions};
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
  const seedValue=Number(seed);
  if(!Number.isInteger(seedValue)||seedValue<0||seedValue>0x7fffffff)throw new Error('IBERFIT_GENERATOR_SEED_INVALID');

  const prompt=buildCloudflareImagePrompt(exercise,{hasAthleteReference:Boolean(athleteReference),hasLogoReference:Boolean(logoReference)});
  const form=new FormData();
  form.append('prompt',prompt);
  form.append('width',String(w));
  form.append('height',String(h));
  form.append('seed',String(seedValue));
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
  return Object.freeze({exerciseId:id,model:CLOUDFLARE_IMAGE_MODEL,width:w,height:h,seed:seedValue,mime,bytes,prompt,transport:proxy?'workers_ai_binding':'rest_api'});
}

function catalogRecords(raw){
  const records=Array.isArray(raw)?raw:raw?.exercises??raw?.data;
  if(!Array.isArray(records))throw new Error('IBERFIT_GENERATOR_CATALOG_INVALID');
  return records;
}
function arg(argv,name){const i=argv.indexOf(name);return i>=0?argv[i+1]:null;}

export async function runCli(argv=process.argv.slice(2)){
  const catalogPath=arg(argv,'--catalog')||'baseline_m25_2/exercise-catalog-m25.json';
  const exerciseId=exactId(arg(argv,'--exercise-id')||DEFAULT_SMOKE_EXERCISE_ID);
  const outDir=path.resolve(arg(argv,'--out-dir')||'recovery/exercise-media-smoke');
  const athletePath=arg(argv,'--athlete-ref');
  const logoPath=arg(argv,'--logo-ref');
  const raw=JSON.parse(fs.readFileSync(path.resolve(catalogPath),'utf8'));
  const exercise=catalogRecords(raw).find((item)=>String(item?.id||'')===exerciseId);
  if(!exercise)throw new Error(`IBERFIT_GENERATOR_EXERCISE_NOT_FOUND:${exerciseId}`);
  const athleteReference=readReference(athletePath);
  const logoReference=readReference(logoPath);
  const result=await generateCloudflareExerciseImage({
    exercise,
    accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken:process.env.CLOUDFLARE_API_TOKEN,
    proxyUrl:process.env.IBERFIT_AI_PROXY_URL,
    proxyToken:process.env.IBERFIT_AI_PROXY_TOKEN,
    athleteReference,
    logoReference,
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
    composition:'movement_pair',
    width:result.width,height:result.height,seed:result.seed,mime:result.mime,
    image:path.basename(imagePath),
    references:{
      athlete:Boolean(athletePath),
      official_isotype:Boolean(logoPath),
      athlete_dimensions:athleteReference?{width:athleteReference.width,height:athleteReference.height}:null,
      isotype_dimensions:logoReference?{width:logoReference.width,height:logoReference.height}:null,
    },
    qa:{biomechanics:'pending',visual:'pending'},
    publishable:false,
    generated_at:new Date().toISOString(),
    prompt_sha256:crypto.createHash('sha256').update(result.prompt).digest('hex'),
  };
  fs.writeFileSync(path.join(outDir,`${exerciseId}-candidate.json`),`${JSON.stringify(metadata,null,2)}\n`);
  console.log(JSON.stringify({ok:true,exerciseId,image:imagePath,model:result.model,seed:result.seed,transport:result.transport,composition:metadata.composition}));
  return {result,metadata,imagePath};
}

const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';
if(invoked===import.meta.url){runCli().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});}
