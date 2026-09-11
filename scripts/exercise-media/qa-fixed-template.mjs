#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS={
  'IBF-APERTURAS-CON-MANCUERNAS':'Left/start: dumbbells above chest, elbows softly bent. Right/final: arms opened laterally in a controlled dumbbell fly with same elbow bend, shoulders stable. Both phases supine on the same flat bench.',
  'IBF-DOMINADA-PRONADA':'Left/start: strict dead/active hang from fixed overhead bar with pronated grip, arms extended. Right/final: strict pull-up top position with chest close to bar, elbows down/back, no kipping.',
  'IBF-BUENOS-DIAS-CON-BARRA':'Left/start: upright standing with barbell across upper back. Right/final: clear hip hinge with hips back, neutral spine, torso inclined forward, knees softly bent, bar remaining fixed on upper back.',
  'IBF-PAJAROS-CON-MANCUERNAS':'Left/start: stable hip hinge, dumbbells hanging below shoulders. Right/final: reverse fly with both upper arms raised laterally near shoulder line, elbows softly bent, no torso swing.',
  'IBF-PULLOVER-CON-MANCUERNA':'Left/start: supine on flat bench with one dumbbell held by both hands above chest. Right/final: same dumbbell moved behind head in controlled arc with softly bent elbows and no excessive lumbar arch.'
};
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function exact(v,n){const s=String(v||'').trim();if(!s)throw new Error(n+'_REQUIRED');return s;}
function extractText(payload){
  const p=(payload&&payload.result)!=null?payload.result:payload;
  const c=[p&&p.response,p&&p.answer,p&&p.content,p&&p.result&&p.result.response,p&&p.result&&p.result.answer,p&&p.result&&p.result.content];
  for(const v of c)if(typeof v==='string'&&v.trim())return v.trim();
  const choices=p&&p.choices;
  if(Array.isArray(choices))for(const ch of choices){const v=(ch&&ch.message&&ch.message.content)||(ch&&ch.text);if(typeof v==='string'&&v.trim())return v.trim();}
  throw new Error('QA_TEXT_MISSING');
}
function parseJson(s){
  const cleaned=String(s).replace(/<think>[\s\S]*?<\/think>/giu,' ').replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'').trim();
  try{return JSON.parse(cleaned);}catch{}
  const a=cleaned.indexOf('{'),b=cleaned.lastIndexOf('}');
  if(a>=0&&b>a)return JSON.parse(cleaned.slice(a,b+1));
  throw new Error('QA_JSON_INVALID');
}
async function main(){
  const id=exact(arg('--exercise-id'),'EXERCISE_ID');
  const imagePath=exact(arg('--image'),'IMAGE');
  const outPath=exact(arg('--out'),'OUT');
  const contract=CONTRACTS[id]; if(!contract)throw new Error('QA_CONTRACT_MISSING:'+id);
  const proxy=exact(process.env.IBERFIT_AI_PROXY_URL,'IBERFIT_AI_PROXY_URL').replace(/\/+$/,'')+'/qa';
  const token=exact(process.env.IBERFIT_AI_PROXY_TOKEN,'IBERFIT_AI_PROXY_TOKEN');
  const bytes=fs.readFileSync(imagePath);
  const dataUri='data:image/webp;base64,'+bytes.toString('base64');
  const rubric=[
    'You are a strict senior strength-and-conditioning visual QA reviewer for the IBERFIT exercise library. Judge pixels only.',
    'Exercise ID: '+id+'. Exercise-specific biomechanics: '+contract,
    'The approved fixed visual template is mandatory: one 640x800 vertical 4:5 image, exactly two equal vertical halves, left is Inicio and right is Final, a subtle center divider, small Inicio/Final labels low in each half, and a small anatomical muscle inset near the upper-right area. No side panel, no bottom panel, no title, no slogan, no poster blocks.',
    'Exactly the same adult male identity should appear in both phases with plain black clothing. Any readable brand word, invented logo, monogram, random letter, watermark or symbol generated inside the exercise photograph is a failure. The official IBERFIT isotype is applied separately by the app and should not be hallucinated in the photo.',
    'Relevant hands, feet, joints and equipment must be visible enough to judge. Reject impossible anatomy, duplicated limbs, malformed equipment, unsafe technique, wrong exercise, wrong phase order, or a merely attractive image with incorrect mechanics.',
    'Return ONLY JSON with exactly these keys: {"exercise_match":boolean,"phase_order":boolean,"equipment_match":boolean,"same_identity":boolean,"biomechanics":"pass|fail|uncertain","anatomy_integrity":boolean,"critical_body_visible":boolean,"fixed_layout_match":boolean,"anatomy_inset_present":boolean,"no_unapproved_branding":boolean,"visual_quality":"pass|fail|uncertain","confidence":number,"issues":[string]}. Confidence 0..1.'
  ].join('\n');
  const body={messages:[{role:'system',content:'Output one complete JSON object only. Be strict and evidence-based.'},{role:'user',content:[{type:'image_url',image_url:{url:dataUri}},{type:'text',text:rubric}]}],temperature:0,stream:false,max_completion_tokens:1600,reasoning_effort:'medium',response_format:{type:'json_object'}};
  const res=await fetch(proxy,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error'});
  if(!res.ok)throw new Error('QA_HTTP_'+res.status+':'+(await res.text()).slice(0,700));
  const payload=await res.json();
  if(!payload||payload.ok!==true)throw new Error('QA_PROXY_FAILED:'+JSON.stringify(payload).slice(0,700));
  const review=parseJson(extractText(payload));
  const blockers=[];
  for(const k of ['exercise_match','phase_order','equipment_match','same_identity','anatomy_integrity','critical_body_visible','fixed_layout_match','anatomy_inset_present','no_unapproved_branding'])if(review[k]!==true)blockers.push(k);
  if(review.biomechanics!=='pass')blockers.push('biomechanics');
  if(review.visual_quality!=='pass')blockers.push('visual_quality');
  if(Number(review.confidence)<0.90)blockers.push('confidence');
  const output={schema:'iberfit.exercise.fixed-template-qa.v1',exercise_id:id,review,decision:{pass:blockers.length===0,blocking:blockers},publishable:false,reviewed_at:new Date().toISOString()};
  fs.mkdirSync(path.dirname(outPath),{recursive:true});
  fs.writeFileSync(outPath,JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(output));
  if(blockers.length)process.exit(2);
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
