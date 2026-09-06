#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CLOUDFLARE_QA_MODEL='@cf/moondream/moondream3.1-9B-A2B';
export const DEFAULT_SMOKE_EXERCISE_ID='IBF-ABDUCCION-DE-CADERA-LATERAL';
const SAFE_EXERCISE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SAFE_ACCOUNT_ID=/^[A-Fa-f0-9]{32}$/u;
const MAX_IMAGE_BYTES=12_000_000;

function exactId(value){const id=String(value??'');if(!id||id!==id.trim()||!SAFE_EXERCISE_ID.test(id))throw new Error('IBERFIT_QA_EXERCISE_ID_INVALID');return id;}
function list(value){return (Array.isArray(value)?value:[]).map((v)=>String(v||'').trim()).filter(Boolean);}
function arg(argv,name){const i=argv.indexOf(name);return i>=0?argv[i+1]:null;}
function mimeFor(filePath){const ext=path.extname(filePath).toLowerCase();if(ext==='.png')return'image/png';if(ext==='.webp')return'image/webp';if(ext==='.jpg'||ext==='.jpeg')return'image/jpeg';throw new Error('IBERFIT_QA_IMAGE_TYPE_INVALID');}
function endpoint(accountId){const account=String(accountId||'').trim();if(!SAFE_ACCOUNT_ID.test(account))throw new Error('IBERFIT_QA_CLOUDFLARE_ACCOUNT_INVALID');return `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${CLOUDFLARE_QA_MODEL}`;}
function proxyEndpoint(value){const raw=String(value||'').trim();if(!raw)return null;let url;try{url=new URL(raw);}catch{throw new Error('IBERFIT_QA_PROXY_URL_INVALID');}if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('IBERFIT_QA_PROXY_URL_INVALID');url.pathname=url.pathname.replace(/\/+$/u,'')+'/qa';return url.href;}

export function exerciseSpecificQaContract(exercise={}){
  if(String(exercise?.id||'').trim()!=='IBF-ABDUCCION-DE-CADERA-LATERAL')return '';
  return [
    'EXERCISE-SPECIFIC QA CONTRACT for standing bodyweight hip abduction:',
    'exercise_match and phase_progression may be true ONLY if the END pose clearly shows one entire leg moving laterally away from the body midline from the HIP, with an obvious air gap from the support leg. A change mainly in the arms or hands is an automatic exercise_match=false and phase_progression=false.',
    'biomechanics may be pass ONLY if the support leg is stable, moving knee remains approximately extended, pelvis stays level, trunk remains upright without compensatory side lean/rotation, and the moving leg travels in the frontal plane rather than forward/backward.',
    'critical_body_visible may be true ONLY if both hips, both knees, both ankles and both shoes/feet are visible enough to judge the start and end positions, including the support foot and the laterally displaced moving foot.',
    'equipment_match may be true only with no band, cable, machine, ankle weight or other exercise equipment.',
    'clean_no_text must be false for any readable letters, wordmark, sleeve text, captions or decorative lettering. A single tiny non-text IBERFIT isotype on the left chest of each pose is allowed and is not text.',
  ].join(' ');
}

export function buildQaQuestion(exercise={}){
  const id=exactId(exercise.id);
  const specificContract=exerciseSpecificQaContract(exercise);
  return [
    'You are a strict senior strength-and-conditioning biomechanics reviewer. Inspect the supplied IBERFIT exercise photograph only.',
    `Canonical exercise ID: ${id}. Name: ${String(exercise.name_es||exercise.name||id)}.`,
    `Pattern: ${String(exercise.pattern||'')}. Equipment: ${String(exercise.equipment||'')}.`,
    `Primary muscles: ${list(exercise.primary_muscles).join(', ')}. Secondary: ${list(exercise.secondary_muscles).join(', ')}.`,
    `Instructions: ${list(exercise.instructions_es).slice(0,6).join('; ')}.`,
    `Cues: ${list(exercise.cues).slice(0,6).join('; ')}.`,
    specificContract,
    'IBERFIT image rules: the movement asset must contain exactly two depictions of the SAME adult male athlete showing a clear start/end movement pair, with consistent identity, outfit, camera language, equipment setup and dark premium gym. Both relevant bodies and equipment must be visible. There must be no title, captions, arrows, start/end labels, panels, footer, watermark, wordmark or random letters. A small anatomy inset is allowed only if unobtrusive.',
    'Judge the ACTUAL visible start phase, end/peak phase and progression between them. Both phases must be technically plausible for the named exercise. Reject if the image shows only one phase, more than two athlete depictions, two different-looking athletes, impossible joints, unsafe alignment, wrong equipment, inconsistent setup/path, cropped critical body parts, or if the two poses do not communicate the requested movement.',
    'Branding is fail-closed: branding_safe may be true only when there are no invented words/letters/logos and any visible chest mark is small and visually consistent across the two poses. Do not approve merely because the image looks attractive.',
    'Return ONLY one JSON object, no markdown and no prose, with exactly these keys:',
    '{"exercise_match":boolean,"equipment_match":boolean,"movement_pair":boolean,"same_athlete_identity":boolean,"phase_progression":boolean,"biomechanics":"pass|fail|uncertain","anatomy_integrity":boolean,"critical_body_visible":boolean,"clean_no_text":boolean,"branding_safe":boolean,"visual_quality":"pass|fail|uncertain","confidence":number,"issues":[string]}',
    'confidence must be from 0 to 1. Any uncertainty about either movement phase or progression must be biomechanics="uncertain". Invented words/logos/letters make branding_safe=false. Visible titles/captions/arrows/panels/labels make clean_no_text=false. Whenever any boolean is false or any quality field is not pass, add a short concrete visual reason to issues.',
  ].filter(Boolean).join('\n');
}

function nestedAnswer(value,depth=0){
  if(depth>5||value===null||value===undefined)return null;
  if(typeof value==='string')return value.trim()||null;
  if(typeof value!=='object'||Array.isArray(value))return null;
  for(const key of ['answer','response','result','output','data']){
    if(!(key in value))continue;
    const found=nestedAnswer(value[key],depth+1);
    if(found)return found;
  }
  return null;
}
function extractAnswer(payload){
  const value=nestedAnswer(payload);
  if(!value){
    const keys=payload&&typeof payload==='object'&&!Array.isArray(payload)?Object.keys(payload).slice(0,12).join(','):'non_object';
    throw new Error(`IBERFIT_QA_ANSWER_MISSING:${keys}`);
  }
  return value;
}
export function parseQaAnswer(answer){
  let text=String(answer||'').trim();
  text=text.replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'').trim();
  const first=text.indexOf('{'),last=text.lastIndexOf('}');
  if(first<0||last<=first)throw new Error('IBERFIT_QA_JSON_INVALID');
  let raw;try{raw=JSON.parse(text.slice(first,last+1));}catch{throw new Error('IBERFIT_QA_JSON_INVALID');}
  const biomechanics=['pass','fail','uncertain'].includes(raw.biomechanics)?raw.biomechanics:'uncertain';
  const visualQuality=['pass','fail','uncertain'].includes(raw.visual_quality)?raw.visual_quality:'uncertain';
  const confidence=Number(raw.confidence);
  return Object.freeze({
    exercise_match:raw.exercise_match===true,
    equipment_match:raw.equipment_match===true,
    movement_pair:raw.movement_pair===true,
    same_athlete_identity:raw.same_athlete_identity===true,
    phase_progression:raw.phase_progression===true,
    biomechanics,
    anatomy_integrity:raw.anatomy_integrity===true,
    critical_body_visible:raw.critical_body_visible===true,
    clean_no_text:raw.clean_no_text===true,
    branding_safe:raw.branding_safe===true,
    visual_quality:visualQuality,
    confidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):0,
    issues:Object.freeze(list(raw.issues).slice(0,12)),
  });
}

export function decideQa(report,{minimumConfidence=0.92}={}){
  const blocking=[];
  if(report.exercise_match!==true)blocking.push('exercise_match');
  if(report.equipment_match!==true)blocking.push('equipment_match');
  if(report.movement_pair!==true)blocking.push('movement_pair');
  if(report.same_athlete_identity!==true)blocking.push('same_athlete_identity');
  if(report.phase_progression!==true)blocking.push('phase_progression');
  if(report.biomechanics!=='pass')blocking.push('biomechanics');
  if(report.anatomy_integrity!==true)blocking.push('anatomy_integrity');
  if(report.critical_body_visible!==true)blocking.push('critical_body_visible');
  if(report.clean_no_text!==true)blocking.push('clean_no_text');
  if(report.branding_safe!==true)blocking.push('branding_safe');
  if(report.visual_quality!=='pass')blocking.push('visual_quality');
  if(report.confidence<minimumConfidence)blocking.push('confidence');
  return Object.freeze({pass:blocking.length===0,decision:blocking.length===0?'auto_qa_pass':'blocked',blocking:Object.freeze(blocking),biomechanicsStatus:blocking.length===0?'approved':'pending',visualStatus:blocking.length===0?'approved':'pending',publishable:false});
}

export async function reviewCloudflareExerciseImage({exercise,imageBytes,mime,accountId,apiToken,proxyUrl=null,proxyToken=null,fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('IBERFIT_QA_FETCH_UNAVAILABLE');
  exactId(exercise?.id);
  const bytes=Buffer.isBuffer(imageBytes)?imageBytes:Buffer.from(imageBytes||[]);
  if(bytes.length<128||bytes.length>MAX_IMAGE_BYTES)throw new Error('IBERFIT_QA_IMAGE_SIZE_INVALID');
  const imageMime=String(mime||'');if(!['image/png','image/jpeg','image/webp'].includes(imageMime))throw new Error('IBERFIT_QA_IMAGE_TYPE_INVALID');
  const proxy=proxyEndpoint(proxyUrl);
  const token=String(proxy?proxyToken:apiToken||'').trim();if(token.length<20)throw new Error(proxy?'IBERFIT_QA_PROXY_TOKEN_REQUIRED':'IBERFIT_QA_CLOUDFLARE_TOKEN_REQUIRED');
  const response=await fetchImpl(proxy||endpoint(accountId),{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({task:'query',image:`data:${imageMime};base64,${bytes.toString('base64')}`,question:buildQaQuestion(exercise),reasoning:false,temperature:0,max_tokens:1100,stream:false}),
    redirect:'error',
  });
  if(!response?.ok){let detail='';try{detail=(await response.text()).slice(0,600);}catch{}throw new Error(`IBERFIT_QA_CLOUDFLARE_HTTP_${response?.status||0}:${detail}`);}
  const payload=await response.json();
  const modelPayload=proxy?(payload?.result??payload):payload;
  const report=parseQaAnswer(extractAnswer(modelPayload));
  return Object.freeze({report,decision:decideQa(report),transport:proxy?'workers_ai_binding':'rest_api'});
}

function catalogRecords(raw){const records=Array.isArray(raw)?raw:raw?.exercises??raw?.data;if(!Array.isArray(records))throw new Error('IBERFIT_QA_CATALOG_INVALID');return records;}
export async function runCli(argv=process.argv.slice(2)){
  const catalogPath=arg(argv,'--catalog')||'baseline_m25_2/exercise-catalog-m25.json';
  const exerciseId=exactId(arg(argv,'--exercise-id')||DEFAULT_SMOKE_EXERCISE_ID);
  const imagePath=arg(argv,'--image');if(!imagePath)throw new Error('IBERFIT_QA_IMAGE_REQUIRED');
  const outPath=path.resolve(arg(argv,'--out')||'recovery/exercise-media-smoke/qa-report.json');
  const raw=JSON.parse(fs.readFileSync(path.resolve(catalogPath),'utf8'));
  const exercise=catalogRecords(raw).find((item)=>String(item?.id||'')===exerciseId);
  if(!exercise)throw new Error(`IBERFIT_QA_EXERCISE_NOT_FOUND:${exerciseId}`);
  const resolved=path.resolve(imagePath),bytes=fs.readFileSync(resolved),mime=mimeFor(resolved);
  const reviewed=await reviewCloudflareExerciseImage({exercise,imageBytes:bytes,mime,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_API_TOKEN,proxyUrl:process.env.IBERFIT_AI_PROXY_URL,proxyToken:process.env.IBERFIT_AI_PROXY_TOKEN});
  fs.mkdirSync(path.dirname(outPath),{recursive:true});
  const output={schema:'iberfit.exercise.visual-qa.v1',exercise_id:exerciseId,model:CLOUDFLARE_QA_MODEL,transport:reviewed.transport,review:reviewed.report,decision:reviewed.decision,reviewed_at:new Date().toISOString()};
  fs.writeFileSync(outPath,`${JSON.stringify(output,null,2)}\n`);
  console.log(JSON.stringify({ok:true,exerciseId,decision:reviewed.decision.decision,confidence:reviewed.report.confidence,transport:reviewed.transport,out:outPath}));
  if(!reviewed.decision.pass)process.exitCode=2;
  return output;
}

const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';
if(invoked===import.meta.url){runCli().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});}
