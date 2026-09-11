#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MODEL='@cf/black-forest-labs/flux-2-klein-4b';
const WIDTH=640;
const HEIGHT=800;

const PHASES={
  'IBF-APERTURAS-CON-MANCUERNAS':{
    start:'Lying supine on a flat bench, feet planted, one dumbbell in each hand directly above the chest, palms facing each other, elbows softly bent about 10-20 degrees, shoulders depressed and stable.',
    final:'Lying supine on the same flat bench, feet planted, arms opened symmetrically out to the sides in a controlled dumbbell fly, elbows still softly bent, dumbbells approximately level with the chest, shoulders not shrugged, no pressing motion.'
  },
  'IBF-DOMINADA-PRONADA':{
    start:'Hanging from a fixed overhead pull-up bar with a pronated overhand grip slightly wider than shoulder width, elbows extended, shoulders active but not shrugged, legs quiet and vertical, no kipping.',
    final:'At the top of a strict pronated pull-up on the same bar, chest close to the bar, elbows driven down and back, shoulders depressed, body controlled and vertical, no swinging or kipping.'
  },
  'IBF-BUENOS-DIAS-CON-BARRA':{
    start:'Standing tall with a straight barbell securely across the upper back/trapezius, feet about hip width, knees softly bent, torso upright, neutral spine, hands gripping the bar symmetrically.',
    final:'Same barbell fixed across the upper back while performing a hip hinge: hips pushed backward, torso inclined forward about 40-55 degrees, neutral spine, knees only softly flexed, feet planted, bar not rolling onto the neck.'
  },
  'IBF-PAJAROS-CON-MANCUERNAS':{
    start:'Standing with a stable hip hinge and neutral spine, one dumbbell in each hand hanging beneath the shoulders, elbows softly bent, neck neutral, feet planted.',
    final:'Same hinged position while raising both dumbbells out to the sides in a reverse fly until upper arms are approximately in line with the shoulders, elbows softly bent, scapulae retracted, no torso swing.'
  },
  'IBF-PULLOVER-CON-MANCUERNA':{
    start:'Lying supine along a flat bench with feet planted, holding one dumbbell securely with both hands above the chest, elbows softly bent, shoulders set and ribs controlled.',
    final:'Same bench position with the single dumbbell moved in a controlled arc behind the head, elbows softly bent and fixed, upper arms near the ears without excessive lumbar arch, shoulders stable.'
  }
};

function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function exact(value,label){const s=String(value||'').trim();if(!s)throw new Error(`${label}_REQUIRED`);return s;}
function seedFor(id,phase,attempt){const d=crypto.createHash('sha256').update(`${id}:${phase}:${attempt}:fixed-template-v1`).digest();return d.readUInt32BE(0)&0x7fffffff;}
function detectMime(bytes){
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';
  if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';
  throw new Error('IMAGE_TYPE_UNSUPPORTED');
}
function ext(m){return m==='image/png'?'.png':m==='image/webp'?'.webp':'.jpg';}
function extractImage(payload){
  const candidates=[
    payload?.result?.image,
    payload?.image,
    payload?.result?.result?.image,
    payload?.result?.result,
    payload?.result
  ];
  for(const v of candidates){
    if(typeof v==='string'&&v.length>128){
      const b=Buffer.from(v,'base64');
      if(b.length>128)return b;
    }
  }
  throw new Error('IMAGE_MISSING');
}
function readCatalog(file,id){
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  const rows=Array.isArray(raw)?raw:(raw.exercises||raw.data||[]);
  const exercise=rows.find(x=>String(x?.id||'')===id);
  if(!exercise)throw new Error(`EXERCISE_NOT_FOUND:${id}`);
  return exercise;
}
function promptFor(exercise,phase){
  const id=exercise.id;
  const contract=PHASES[id];
  if(!contract)throw new Error(`PHASE_CONTRACT_MISSING:${id}`);
  const phaseText=contract[phase];
  if(!phaseText)throw new Error(`PHASE_INVALID:${phase}`);
  return [
    'Create ONE realistic premium exercise-library photograph. Exactly ONE adult male athlete and ONE continuous photograph. Vertical 4:5.',
    'Input image 0 is the approved IBERFIT male identity reference ONLY. Preserve the same face, hair, beard, age, complexion and natural non-bodybuilder build. Do not copy the reference pose.',
    'The athlete wears a completely plain black short-sleeve technical shirt, plain black shorts and plain black training shoes. NO logo, NO symbol, NO letters, NO numbers, NO brand name, NO watermark anywhere on clothing, equipment, walls or image.',
    'Environment: premium dark charcoal gym, black equipment, subtle warm-gold and restrained green architectural accent light, realistic commercial photography, no poster design, no infographic, no text.',
    'Composition is critical because this image will be mechanically cropped into one half of a fixed IBERFIT 640x800 template. Keep the entire athlete and every relevant hand, foot and piece of equipment inside the CENTRAL 50 PERCENT of the image width, with generous empty dark-gym margin on both sides. Do not crop head, hands, weights or feet.',
    `Exercise: ${exercise.name_es||id}. Movement pattern: ${exercise.pattern||''}. Equipment: ${exercise.equipment||''}.`,
    `Required ${phase==='start'?'START':'FINAL'} phase: ${phaseText}`,
    'Biomechanics must be clearly correct and anatomically possible. Neutral and exercise-appropriate spine, realistic joint angles, correct grip/support, no duplicated limbs, no extra fingers, no malformed equipment, no background people.',
    'Do not show both phases. Do not create a split screen. Do not add anatomical diagrams. Do not add labels. Do not add arrows. Do not add any branding. Exactly one athlete in the requested single phase.'
  ].join('\n');
}
async function main(){
  const id=exact(arg('--exercise-id'),'EXERCISE_ID');
  const phase=exact(arg('--phase'),'PHASE');
  const catalog=exact(arg('--catalog'),'CATALOG');
  const athlete=exact(arg('--athlete-ref'),'ATHLETE_REF');
  const outDir=exact(arg('--out-dir'),'OUT_DIR');
  const attempt=Number(arg('--attempt')||1);
  if(!['start','final'].includes(phase))throw new Error('PHASE_INVALID');
  if(!Number.isInteger(attempt)||attempt<1||attempt>9)throw new Error('ATTEMPT_INVALID');
  const proxy=exact(process.env.IBERFIT_AI_PROXY_URL,'IBERFIT_AI_PROXY_URL').replace(/\/+$/,'')+'/generate';
  const token=exact(process.env.IBERFIT_AI_PROXY_TOKEN,'IBERFIT_AI_PROXY_TOKEN');
  const exercise=readCatalog(catalog,id);
  const bytes=fs.readFileSync(athlete);
  const form=new FormData();
  form.append('model',MODEL);
  form.append('prompt',promptFor(exercise,phase));
  form.append('width',String(WIDTH));
  form.append('height',String(HEIGHT));
  form.append('guidance','4.5');
  form.append('seed',String(seedFor(id,phase,attempt)));
  form.append('input_image_0',new Blob([bytes],{type:'image/png'}),'iberfit-athlete-reference.png');
  const res=await fetch(proxy,{method:'POST',headers:{authorization:`Bearer ${token}`},body:form,redirect:'error'});
  if(!res.ok)throw new Error(`GENERATE_HTTP_${res.status}:${(await res.text()).slice(0,700)}`);
  const payload=await res.json();
  if(payload?.ok!==true)throw new Error(`GENERATE_PROXY_FAILED:${JSON.stringify(payload).slice(0,700)}`);
  const image=extractImage(payload);
  const mime=detectMime(image);
  fs.mkdirSync(outDir,{recursive:true});
  const file=path.join(outDir,`${id}-${phase}-a${attempt}${ext(mime)}`);
  fs.writeFileSync(file,image);
  fs.writeFileSync(file+'.json',JSON.stringify({
    schema:'iberfit.exercise.phase-candidate.v1',
    exercise_id:id,phase,attempt,model:payload.model||MODEL,mime,width:WIDTH,height:HEIGHT,
    seed:seedFor(id,phase,attempt),prompt_sha256:crypto.createHash('sha256').update(promptFor(exercise,phase)).digest('hex'),
    generated_at:new Date().toISOString(),publishable:false
  },null,2)+'\n');
  console.log(JSON.stringify({ok:true,id,phase,attempt,file,mime,bytes:image.length}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
