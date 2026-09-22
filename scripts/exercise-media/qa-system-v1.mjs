#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const MIN_CONFIDENCE=0.92;
const BIOMECHANICS=Object.freeze({
  'IBF-DOMINADA-PRONADA':'Left/start must show a strict active hang from a fixed overhead bar with pronated grip and extended elbows. Right/final must show the top of the same strict pull-up with chest near bar, elbows down/back and no kipping or swing.',
  'IBF-BUENOS-DIAS-CON-BARRA':'Left/start must be upright with barbell securely across upper back. Right/final must show a real hip hinge with hips back, neutral spine, torso clearly inclined, softly bent knees and bar fixed on upper back rather than neck.',
  'IBF-APERTURAS-CON-MANCUERNAS':'Both phases must be supine on the same flat bench. Left/start has dumbbells above chest with soft fixed elbow bend. Right/final opens arms laterally in a controlled fly around chest level without turning into a press.',
});
function arg(name){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:null;}
function exact(value,label){const normalized=String(value||'').trim();if(!normalized)throw new Error(`${label}_REQUIRED`);return normalized;}
function rows(raw){if(Array.isArray(raw))return raw;if(Array.isArray(raw?.exercises))return raw.exercises;if(Array.isArray(raw?.data))return raw.data;throw new Error('CATALOG_INVALID');}
function extractText(payload){
  const result=payload?.result??payload;
  const candidates=[result?.response,result?.answer,result?.content,result?.result?.response,result?.result?.answer,result?.result?.content];
  for(const value of candidates)if(typeof value==='string'&&value.trim())return value.trim();
  if(Array.isArray(result?.choices))for(const choice of result.choices){const value=choice?.message?.content??choice?.text;if(typeof value==='string'&&value.trim())return value.trim();}
  throw new Error('QA_TEXT_MISSING');
}
function parseJson(value){
  const cleaned=String(value).replace(/<think>[\s\S]*?<\/think>/giu,' ').replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'').trim();
  try{return JSON.parse(cleaned);}catch{}
  const start=cleaned.indexOf('{');const end=cleaned.lastIndexOf('}');
  if(start>=0&&end>start)return JSON.parse(cleaned.slice(start,end+1));
  throw new Error('QA_JSON_INVALID');
}
async function main(){
  const id=exact(arg('--exercise-id'),'EXERCISE_ID');
  const imagePath=exact(arg('--image'),'IMAGE');
  const metaPath=exact(arg('--meta'),'META');
  const outPath=exact(arg('--out'),'OUT');
  const catalogPath=exact(arg('--catalog'),'CATALOG');
  const contract=BIOMECHANICS[id];if(!contract)throw new Error(`QA_CONTRACT_MISSING:${id}`);
  const exercise=rows(JSON.parse(fs.readFileSync(catalogPath,'utf8'))).find((item)=>String(item?.id||'')===id);
  if(!exercise)throw new Error(`EXERCISE_NOT_FOUND:${id}`);
  const metadata=JSON.parse(fs.readFileSync(metaPath,'utf8'));
  if(metadata?.schema!=='iberfit.exercise.media.system-v1.pilot-candidate.v1'||metadata.exercise_id!==id)throw new Error('PILOT_METADATA_INVALID');
  if(metadata.master?.width!==1280||metadata.master?.height!==1600)throw new Error('PILOT_MASTER_DIMENSIONS_INVALID');
  if(metadata.delivery?.width!==640||metadata.delivery?.height!==800)throw new Error('PILOT_DELIVERY_DIMENSIONS_INVALID');
  if(metadata.publishable!==false||metadata.human_approval_required!==true)throw new Error('PILOT_PUBLICATION_GUARD_INVALID');
  const proxy=exact(process.env.IBERFIT_AI_PROXY_URL,'IBERFIT_AI_PROXY_URL').replace(/\/+$/,'')+'/qa';
  const token=exact(process.env.IBERFIT_AI_PROXY_TOKEN,'IBERFIT_AI_PROXY_TOKEN');
  const bytes=fs.readFileSync(imagePath);
  const dataUri=`data:image/webp;base64,${bytes.toString('base64')}`;
  const primary=Array.isArray(exercise.primary_muscles)?exercise.primary_muscles:[];
  const secondary=Array.isArray(exercise.secondary_muscles)?exercise.secondary_muscles:[];
  const rubric=[
    'You are the strict senior visual QA reviewer for IBERFIT Exercise Media System v1. Judge the supplied pixels only; do not reward attractiveness if instruction is ambiguous.',
    `Exercise ID: ${id}. Exercise-specific biomechanics: ${contract}`,
    `Canonical muscle targets: primary=${primary.join(', ')}; secondary=${secondary.join(', ')}.`,
    'System-v1 composition is mandatory: one 4:5 portrait visual with start phase on the left and final phase on the right, but NO baked Inicio/Final labels and NO exercise name or technical copy in pixels.',
    'The same approved adult male identity, plain black kit, same environment/equipment/camera language should read across both phases. Reject duplicated limbs, malformed equipment, hidden critical joints, impossible anatomy, wrong exercise or wrong phase relationship.',
    'A compact analytical anatomy inset must be clearly present in the upper-left, visually secondary, roughly 12-16% of total image width, with primary muscles emphasized more strongly than secondary muscles and no text or decoration.',
    'A small official IBERFIT isotipo should appear naturally on the shirt in each phase. A single subtle wall watermark may appear only when it does not obscure movement. Reject any extra brand word, invented logo, random symbol, equipment branding, shoe branding, shorts branding or standalone corner logo.',
    'Visual language must be premium dark green/charcoal with warm cream and restrained gold, realistic, sober and human: no neon, no SaaS/AI glow, no poster blocks.',
    'All relevant hands, feet, joints, bar/dumbbells/bench and support contacts must remain visible enough to understand the exercise at compact card size.',
    'Return ONLY JSON with exactly these keys: {"exercise_match":boolean,"phase_order":boolean,"equipment_match":boolean,"same_identity":boolean,"biomechanics":"pass|fail|uncertain","critical_body_visible":boolean,"no_baked_text":boolean,"anatomy_inset_present":boolean,"anatomy_upper_left":boolean,"anatomy_scale":"pass|fail|uncertain","muscle_target_match":boolean,"shirt_isotipo_placement":"pass|fail|uncertain","wall_watermark_compliant":boolean,"no_unapproved_branding":boolean,"premium_visual_language":"pass|fail|uncertain","compact_readability":"pass|fail|uncertain","visual_quality":"pass|fail|uncertain","confidence":number,"issues":[string]}. Confidence 0..1.',
  ].join('\n');
  const body={messages:[{role:'system',content:'Output one complete JSON object only. Be strict, visual and evidence-based.'},{role:'user',content:[{type:'image_url',image_url:{url:dataUri}},{type:'text',text:rubric}]}],temperature:0,stream:false,max_completion_tokens:1800,reasoning_effort:'medium',response_format:{type:'json_object'}};
  const response=await fetch(proxy,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error'});
  if(!response.ok)throw new Error(`QA_HTTP_${response.status}:${(await response.text()).slice(0,900)}`);
  const payload=await response.json();if(payload?.ok!==true)throw new Error(`QA_PROXY_FAILED:${JSON.stringify(payload).slice(0,1200)}`);
  const review=parseJson(extractText(payload));
  const blockers=[];
  for(const key of ['exercise_match','phase_order','equipment_match','same_identity','critical_body_visible','no_baked_text','anatomy_inset_present','anatomy_upper_left','muscle_target_match','wall_watermark_compliant','no_unapproved_branding'])if(review[key]!==true)blockers.push(key);
  for(const key of ['biomechanics','anatomy_scale','shirt_isotipo_placement','premium_visual_language','compact_readability','visual_quality'])if(review[key]!=='pass')blockers.push(key);
  if(!Number.isFinite(Number(review.confidence))||Number(review.confidence)<MIN_CONFIDENCE)blockers.push('confidence');
  const output={schema:'iberfit.exercise.media.system-v1.qa.v1',exercise_id:id,review,decision:{pass:blockers.length===0,blocking:blockers,minConfidence:MIN_CONFIDENCE},human_approval_required:true,publishable:false,reviewed_at:new Date().toISOString()};
  fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,`${JSON.stringify(output,null,2)}\n`);
  console.log(JSON.stringify(output));if(blockers.length)process.exit(2);
}
main().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exit(1);});
