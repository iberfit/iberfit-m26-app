#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const CLOUDFLARE_QA_MODEL='@cf/qwen/qwen3.8-27b';
export const DEFAULT_SMOKE_EXERCISE_ID='IBF-ABDUCCION-DE-CADERA-LATERAL';
const SAFE_EXERCISE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SAFE_ACCOUNT_ID=/^[A-Fa-f0-9]{32}$/u;
const MAX_IMAGE_BYTES=12_000_000;
const REQUIRED_QA_KEYS=['exercise_match','equipment_match','movement_pair','same_athlete_identity','phase_progression','biomechanics','anatomy_integrity','critical_body_visible','clean_no_text','branding_safe','visual_quality','confidence','issues'];

function exactId(value){const id=String(value??'');if(!id||id!==id.trim()||!SAFE_EXERCISE_ID.test(id))throw new Error('IBERFIT_QA_EXERCISE_ID_INVALID');return id;}
function list(value){return(Array.isArray(value)?value:[]).map((v)=>String(v||'').trim()).filter(Boolean);}
function arg(argv,name){const i=argv.indexOf(name);return i>=0?argv[i+1]:null;}
function mimeFor(filePath){const ext=path.extname(filePath).toLowerCase();if(ext==='.png')return'image/png';if(ext==='.webp')return'image/webp';if(ext==='.jpg'||ext==='.jpeg')return'image/jpeg';throw new Error('IBERFIT_QA_IMAGE_TYPE_INVALID');}
function endpoint(accountId){const account=String(accountId||'').trim();if(!SAFE_ACCOUNT_ID.test(account))throw new Error('IBERFIT_QA_CLOUDFLARE_ACCOUNT_INVALID');return`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${CLOUDFLARE_QA_MODEL}`;}
function proxyEndpoint(value){const raw=String(value||'').trim();if(!raw)return null;let url;try{url=new URL(raw);}catch{throw new Error('IBERFIT_QA_PROXY_URL_INVALID');}if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('IBERFIT_QA_PROXY_URL_INVALID');url.pathname=url.pathname.replace(/\/+$/u,'')+'/qa';return url.href;}

export function exerciseSpecificQaContract(exercise={}){
  if(String(exercise?.id||'').trim()!=='IBF-ABDUCCION-DE-CADERA-LATERAL')return'';
  return[
    'EXERCISE-SPECIFIC QA CONTRACT for STANDING BODYWEIGHT HIP ABDUCTION. Judge the pixels, not the exercise name.',
    'The LEFT image is the start phase. The RIGHT image is the end phase.',
    'START must show a neutral tall stance with both feet on the floor.',
    'END must show exactly ONE support foot on the floor and the opposite moving leg ABDUCTED LATERALLY in the frontal/coronal plane. The moving shoe must be visibly off the floor with a clear gap beneath it.',
    'The moving knee should stay extended or only naturally soft. The moving foot and knee must be displaced sideways from the body midline; a wider two-foot stance, toe tap, forward raise, march, front kick, knee-to-chest, crossed-leg pose or side lunge is NOT hip abduction.',
    'CORONAL DEPTH CHECK: the moving thigh and shin should retain normal apparent length with no strong foreshortening. The moving hip, knee and ankle must not visibly project toward the camera relative to the support leg.',
    'FOOT CHECK: the moving ankle should remain neutral with the shoe sole/tread facing down toward the floor, not toward the camera. A prominently visible moving-shoe sole/tread, toes lifted toward the lens, or a foreshortened moving leg is evidence of a forward/sagittal component and biomechanics MUST be fail.',
    'The pelvis should remain approximately level and the trunk upright without obvious lateral compensation. Arms remain passive and do not touch the moving leg.',
    'exercise_match and phase_progression are false if the end pose does not visibly contain this lateral single-leg abduction.',
    'biomechanics is fail if both end-phase shoes touch the floor, if the moving leg travels mainly forward/backward, if the moving shoe sole/tread prominently faces the camera, if the moving leg is visibly foreshortened, if the knee is prominently flexed/high, or if the hands assist the leg.',
    'critical_body_visible is true when the relevant hips, knees, ankles and both shoes are visible sufficiently to judge the movement. Do not claim cropping when both complete bodies and shoes are plainly visible.',
    'No exercise equipment is required.',
    'Branding rule: a tiny non-text gold IBERFIT isotype on the upper chest is permitted. It is NOT a wordmark and should not itself cause clean_no_text=false or branding_safe=false. Reject only actual readable words/letters, invented logos, extra symbols, watermarks, captions or labels.',
    'For this pilot, anatomy insets, diagrams and panels are forbidden.',
  ].join(' ');
}

export function buildQaQuestion(exercise={}){
  const id=exactId(exercise.id);const specific=exerciseSpecificQaContract(exercise);
  return[
    'Act as a strict senior strength-and-conditioning biomechanics reviewer. Inspect only the supplied image and return an evidence-based verdict.',
    `Canonical exercise ID: ${id}. Name: ${String(exercise.name_es||exercise.name||id)}.`,
    `Pattern: ${String(exercise.pattern||'')}. Equipment: ${String(exercise.equipment||'')}.`,
    `Primary muscles: ${list(exercise.primary_muscles).join(', ')}. Secondary: ${list(exercise.secondary_muscles).join(', ')}.`,
    `Instructions: ${list(exercise.instructions_es).slice(0,6).join('; ')}.`,
    `Cues: ${list(exercise.cues).slice(0,6).join('; ')}.`,specific,
    'General IBERFIT rules: exactly two depictions of the SAME adult male athlete, start on left and end on right, consistent outfit and premium dark gym. No extra people. Relevant body parts must be visible. No title, captions, arrows, labels, side panels, watermark, wordmark or random letters.',
    'Do not approve because the photograph is attractive. Do not reject for imagined defects that are not visibly present. Every issue must name a concrete visible defect.',
    'Return ONLY one JSON object with exactly these keys:',
    '{"exercise_match":boolean,"equipment_match":boolean,"movement_pair":boolean,"same_athlete_identity":boolean,"phase_progression":boolean,"biomechanics":"pass|fail|uncertain","anatomy_integrity":boolean,"critical_body_visible":boolean,"clean_no_text":boolean,"branding_safe":boolean,"visual_quality":"pass|fail|uncertain","confidence":number,"issues":[string]}',
    'confidence is 0..1. Use uncertain rather than guessing. If any boolean is false or quality field is not pass, add a concise visible reason to issues.',
  ].filter(Boolean).join('\n');
}

function extractAnswer(payload){
  const direct=[payload?.answer,payload?.response,payload?.result?.answer,payload?.result?.response,payload?.content,payload?.result?.content];
  for(const value of direct)if(typeof value==='string'&&value.trim())return value.trim();
  const choices=payload?.choices??payload?.result?.choices;
  if(Array.isArray(choices)){
    for(const choice of choices){
      const content=choice?.message?.content??choice?.text;
      if(typeof content==='string'&&content.trim())return content.trim();
      if(Array.isArray(content)){
        const joined=content.map((part)=>typeof part==='string'?part:part?.text||'').filter(Boolean).join('\n').trim();
        if(joined)return joined;
      }
    }
  }
  const keys=payload&&typeof payload==='object'?Object.keys(payload).slice(0,12).join(','):'non_object';
  throw new Error(`IBERFIT_QA_ANSWER_MISSING:${keys}`);
}

function reportShape(value){return value&&typeof value==='object'&&!Array.isArray(value)&&REQUIRED_QA_KEYS.every((key)=>Object.prototype.hasOwnProperty.call(value,key));}
function tryJson(value){
  const text=String(value??'').trim();if(!text)return null;
  try{
    const parsed=JSON.parse(text);
    if(reportShape(parsed))return parsed;
    if(typeof parsed==='string'&&parsed!==text)return tryJson(parsed);
  }catch{}
  return null;
}
function jsonObjectCandidates(text){
  const out=[];
  const fenced=/```(?:json)?\s*([\s\S]*?)```/giu;
  for(const match of text.matchAll(fenced))if(match[1])out.push(match[1].trim());
  const starts=[];const ends=[];
  for(let i=0;i<text.length;i+=1){if(text[i]==='{')starts.push(i);else if(text[i]==='}')ends.push(i);}
  for(let s=starts.length-1;s>=0;s-=1){
    const start=starts[s];
    for(let e=0;e<ends.length;e+=1){const end=ends[e];if(end<=start)continue;out.push(text.slice(start,end+1));}
  }
  return out;
}

export function parseQaAnswer(answer){
  let text=String(answer||'').trim();
  text=text.replace(/<think>[\s\S]*?<\/think>/giu,' ').replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'').trim();
  let raw=tryJson(text);
  if(!raw){for(const candidate of jsonObjectCandidates(text)){raw=tryJson(candidate);if(raw)break;}}
  if(!raw){const diagnostic=JSON.stringify(text.slice(0,700));throw new Error(`IBERFIT_QA_JSON_INVALID:${diagnostic}`);}
  const biomechanics=['pass','fail','uncertain'].includes(raw.biomechanics)?raw.biomechanics:'uncertain';const visualQuality=['pass','fail','uncertain'].includes(raw.visual_quality)?raw.visual_quality:'uncertain';const confidence=Number(raw.confidence);
  return Object.freeze({exercise_match:raw.exercise_match===true,equipment_match:raw.equipment_match===true,movement_pair:raw.movement_pair===true,same_athlete_identity:raw.same_athlete_identity===true,phase_progression:raw.phase_progression===true,biomechanics,anatomy_integrity:raw.anatomy_integrity===true,critical_body_visible:raw.critical_body_visible===true,clean_no_text:raw.clean_no_text===true,branding_safe:raw.branding_safe===true,visual_quality:visualQuality,confidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):0,issues:Object.freeze(list(raw.issues).slice(0,12))});
}

export function decideQa(report,{minimumConfidence=0.92}={}){
  const blocking=[];if(report.exercise_match!==true)blocking.push('exercise_match');if(report.equipment_match!==true)blocking.push('equipment_match');if(report.movement_pair!==true)blocking.push('movement_pair');if(report.same_athlete_identity!==true)blocking.push('same_athlete_identity');if(report.phase_progression!==true)blocking.push('phase_progression');if(report.biomechanics!=='pass')blocking.push('biomechanics');if(report.anatomy_integrity!==true)blocking.push('anatomy_integrity');if(report.critical_body_visible!==true)blocking.push('critical_body_visible');if(report.clean_no_text!==true)blocking.push('clean_no_text');if(report.branding_safe!==true)blocking.push('branding_safe');if(report.visual_quality!=='pass')blocking.push('visual_quality');if(report.confidence<minimumConfidence)blocking.push('confidence');return Object.freeze({pass:blocking.length===0,decision:blocking.length===0?'auto_qa_pass':'blocked',blocking:Object.freeze(blocking),biomechanicsStatus:blocking.length===0?'approved':'pending',visualStatus:blocking.length===0?'approved':'pending',publishable:false});
}

export function buildQwenQaBody({exercise,imageBytes,mime}){
  const bytes=Buffer.isBuffer(imageBytes)?imageBytes:Buffer.from(imageBytes||[]);const dataUri=`data:${mime};base64,${bytes.toString('base64')}`;
  return{
    messages:[
      {role:'system',content:'You are an exacting visual biomechanics auditor. Follow the user rubric literally. Output only one complete valid JSON object and never invent visual defects.'},
      {role:'user',content:[{type:'image_url',image_url:{url:dataUri}},{type:'text',text:buildQaQuestion(exercise)}]},
    ],
    temperature:0,
    stream:false,
    max_completion_tokens:1800,
    reasoning_effort:'medium',
    response_format:{type:'json_object'},
  };
}

export async function reviewCloudflareExerciseImage({exercise,imageBytes,mime,accountId,apiToken,proxyUrl=null,proxyToken=null,fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('IBERFIT_QA_FETCH_UNAVAILABLE');exactId(exercise?.id);const bytes=Buffer.isBuffer(imageBytes)?imageBytes:Buffer.from(imageBytes||[]);if(bytes.length<128||bytes.length>MAX_IMAGE_BYTES)throw new Error('IBERFIT_QA_IMAGE_SIZE_INVALID');const imageMime=String(mime||'');if(!['image/png','image/jpeg','image/webp'].includes(imageMime))throw new Error('IBERFIT_QA_IMAGE_TYPE_INVALID');const proxy=proxyEndpoint(proxyUrl);const token=String(proxy?proxyToken:apiToken||'').trim();if(token.length<20)throw new Error(proxy?'IBERFIT_QA_PROXY_TOKEN_REQUIRED':'IBERFIT_QA_CLOUDFLARE_TOKEN_REQUIRED');const body=buildQwenQaBody({exercise,imageBytes:bytes,mime:imageMime});
  const response=await fetchImpl(proxy||endpoint(accountId),{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error'});if(!response?.ok){let detail='';try{detail=(await response.text()).slice(0,900);}catch{}throw new Error(`IBERFIT_QA_CLOUDFLARE_HTTP_${response?.status||0}:${detail}`);}const payload=await response.json();const modelPayload=proxy?(payload?.result??payload):payload;const report=parseQaAnswer(extractAnswer(modelPayload));return Object.freeze({report,decision:decideQa(report),transport:proxy?'workers_ai_binding':'rest_api'});
}

function catalogRecords(raw){const records=Array.isArray(raw)?raw:raw?.exercises??raw?.data;if(!Array.isArray(records))throw new Error('IBERFIT_QA_CATALOG_INVALID');return records;}
export async function runCli(argv=process.argv.slice(2)){
  const catalogPath=arg(argv,'--catalog')||'baseline_m25_2/exercise-catalog-m25.json';const exerciseId=exactId(arg(argv,'--exercise-id')||DEFAULT_SMOKE_EXERCISE_ID);const imagePath=arg(argv,'--image');if(!imagePath)throw new Error('IBERFIT_QA_IMAGE_REQUIRED');const outPath=path.resolve(arg(argv,'--out')||'recovery/exercise-media-smoke/qa-report.json');const raw=JSON.parse(fs.readFileSync(path.resolve(catalogPath),'utf8'));const exercise=catalogRecords(raw).find((item)=>String(item?.id||'')===exerciseId);if(!exercise)throw new Error(`IBERFIT_QA_EXERCISE_NOT_FOUND:${exerciseId}`);const resolved=path.resolve(imagePath),bytes=fs.readFileSync(resolved),mime=mimeFor(resolved);const reviewed=await reviewCloudflareExerciseImage({exercise,imageBytes:bytes,mime,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_API_TOKEN,proxyUrl:process.env.IBERFIT_AI_PROXY_URL,proxyToken:process.env.IBERFIT_AI_PROXY_TOKEN});fs.mkdirSync(path.dirname(outPath),{recursive:true});const output={schema:'iberfit.exercise.visual-qa.v2',exercise_id:exerciseId,model:CLOUDFLARE_QA_MODEL,transport:reviewed.transport,review:reviewed.report,decision:reviewed.decision,reviewed_at:new Date().toISOString()};fs.writeFileSync(outPath,`${JSON.stringify(output,null,2)}\n`);console.log(JSON.stringify({ok:true,exerciseId,decision:reviewed.decision.decision,confidence:reviewed.report.confidence,transport:reviewed.transport,model:CLOUDFLARE_QA_MODEL,out:outPath}));if(!reviewed.decision.pass)process.exitCode=2;return output;
}

const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';if(invoked===import.meta.url){runCli().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});}
