import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const catalogPath=path.join(root,'baseline_m25_2','exercise-catalog-m25.json');
const repdbPath=path.join(root,'public','vendor','repdb','free.json');
const outputPath=path.join(root,'public','vendor','repdb','iberfit-canonical-media-map-v1.json');
const reportPath=path.join(root,'recovery','RC31_REPDB_CANONICAL_MEDIA_REPORT.json');
const imageRoot=path.join(root,'public','vendor','repdb','images','flat');

const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
const repdb=JSON.parse(fs.readFileSync(repdbPath,'utf8')).exercises;

if(!Array.isArray(catalog)||catalog.length!==367)throw new Error(`RC31_MEDIA_CATALOG_COUNT:${catalog?.length}`);
if(!Array.isArray(repdb)||repdb.length!==400)throw new Error(`RC31_MEDIA_REPDB_COUNT:${repdb?.length}`);

function fold(value){
  return String(value??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/&/g,' y ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const STOPWORDS=new Set([
  'a','al','con','contra','de','del','desde','el','en','la','las','los','para','por','sin','sobre','un','una','y',
  'and','at','by','for','from','in','of','on','the','to','with',
]);

const POSITION_WORDS=new Set([
  'acostado','acostada','alternado','alternada','apoyado','apoyada','arrodillado','arrodillada',
  'de pie','decubito','inclinado','inclinada','lateral','prono','prona','sentado','sentada','supino','supina',
  'standing','seated','lying','kneeling','prone','supine','alternating','supported',
]);

const EQUIPMENT_GROUPS=Object.freeze({
  bodyweight:['bodyweight','peso corporal','sin equipo','sin material','calistenia'],
  band:['band','banded','banda','bandas','miniband','minibanda','superband','superbanda','elastica','elastico'],
  dumbbell:['dumbbell','dumbbells','mancuerna','mancuernas'],
  barbell:['barbell','barra','barra olimpica'],
  kettlebell:['kettlebell','kettlebells','pesa rusa','pesas rusas'],
  cable:['cable','polea','poleas'],
  suspension:['trx','suspension','suspension trainer','anillas','rings'],
  machine:['machine','maquina','multipower','smith','prensa'],
  ball:['ball','balon','pelota','fitball'],
  landmine:['landmine'],
  plate:['plate','disco','discos'],
  sled:['sled','trineo'],
  rope:['rope','cuerda'],
  bench:['bench','banco'],
});

function words(value,{stripPosition=false,stripEquipment=false}={}){
  let tokens=fold(value).split(' ').filter((token)=>token&&!STOPWORDS.has(token));
  if(stripPosition)tokens=tokens.filter((token)=>!POSITION_WORDS.has(token));
  if(stripEquipment){
    const equipmentTokens=new Set(Object.values(EQUIPMENT_GROUPS).flatMap((items)=>items.flatMap((item)=>fold(item).split(' '))));
    tokens=tokens.filter((token)=>!equipmentTokens.has(token));
  }
  return tokens.map((token)=>{
    if(token.length>4&&token.endsWith('es'))return token.slice(0,-2);
    if(token.length>3&&token.endsWith('s'))return token.slice(0,-1);
    return token;
  });
}

function key(value,options){return [...new Set(words(value,options))].sort().join(' ');}

function equipmentGroups(value,record={}){
  const source=fold([
    value,
    record.equipment,
    record.is_bodyweight?'bodyweight':'',
  ].filter(Boolean).join(' '));
  const found=[];
  for(const [group,terms] of Object.entries(EQUIPMENT_GROUPS)){
    if(terms.some((term)=>source.includes(fold(term))))found.push(group);
  }
  return found;
}

function equipmentCompatibility(catalogExercise,repExercise){
  const left=equipmentGroups(catalogExercise.equipment,catalogExercise);
  const right=equipmentGroups(repExercise.equipment,repExercise);
  if(!left.length&&!right.length)return 'unknown';
  if(left.some((item)=>right.includes(item)))return 'exact';
  if(left.includes('bodyweight')&&repExercise.is_bodyweight===true)return 'exact';
  if(!right.length||!left.length)return 'unknown';
  return 'mismatch';
}

function dice(a,b){
  const left=new Set(a),right=new Set(b);
  if(!left.size||!right.size)return 0;
  let common=0;
  for(const token of left)if(right.has(token))common++;
  return (2*common)/(left.size+right.size);
}

function catalogueNames(exercise){
  return [
    exercise.id?.replace(/^IBF-/,'').replaceAll('-',' '),
    exercise.name_es,
    exercise.name_source,
    exercise.name,
    ...(Array.isArray(exercise.aliases)?exercise.aliases:[]),
  ].filter(Boolean);
}

function repdbNames(exercise){
  return [
    exercise.id?.replaceAll('-',' '),
    exercise.name,
    exercise.name_es,
    exercise.name_en,
  ].filter(Boolean);
}

const REPDB_MUSCLE_ES=Object.freeze({
  abductors:'Abductores',
  adductors:'Aductores',
  anterior_deltoid:'Hombros',
  biceps_brachii:'Bíceps',
  brachialis:'Bíceps',
  brachioradialis:'Antebrazos y agarre',
  calves:'Pantorrilla',
  erector_spinae:'Espalda',
  forearm_extensors:'Antebrazos y agarre',
  forearm_flexors:'Antebrazos y agarre',
  gastrocnemius:'Pantorrilla',
  gluteus_maximus:'Glúteos',
  gluteus_medius:'Glúteos',
  gluteus_minimus:'Glúteos',
  hamstrings:'Isquiotibiales',
  hip_flexors:'Flexores de cadera',
  iliopsoas:'Flexores de cadera',
  latissimus_dorsi:'Espalda',
  lateral_deltoid:'Hombros',
  obliques:'Zona media',
  pectoralis_major:'Pectoral',
  posterior_deltoid:'Hombros',
  quadriceps:'Cuádriceps',
  rectus_abdominis:'Zona media',
  rhomboids:'Espalda',
  serratus_anterior:'Pectoral y cintura escapular',
  soleus:'Pantorrilla',
  trapezius:'Espalda',
  transverse_abdominis:'Zona media',
  triceps_brachii:'Tríceps',
  upper_trapezius:'Espalda',
});

function mappedMuscleGroup(catalogExercise,repExercise,visible){
  if(visible){
    for(const muscle of repExercise.primary_muscles||[]){
      if(REPDB_MUSCLE_ES[muscle])return REPDB_MUSCLE_ES[muscle];
    }
  }
  const fallback=catalogExercise.primary_muscles?.[0]||catalogExercise.pattern||'Otros';
  return String(fallback||'Otros');
}

const repMeta=repdb.map((exercise)=>({
  exercise,
  names:repdbNames(exercise),
  exactKeys:new Set(repdbNames(exercise).map((name)=>key(name))),
  coreKeys:new Set(repdbNames(exercise).map((name)=>key(name,{stripPosition:true,stripEquipment:true}))),
}));

function scoreCandidate(catalogExercise,candidate){
  const names=catalogueNames(catalogExercise);
  const exactKeys=names.map((name)=>key(name));
  const coreKeys=names.map((name)=>key(name,{stripPosition:true,stripEquipment:true}));
  const equipment=equipmentCompatibility(catalogExercise,candidate.exercise);

  const exact=exactKeys.some((value)=>value&&candidate.exactKeys.has(value));
  const coreExact=coreKeys.some((value)=>value&&candidate.coreKeys.has(value));

  let similarity=0;
  for(const left of coreKeys){
    const leftWords=left.split(' ').filter(Boolean);
    for(const right of candidate.coreKeys){
      similarity=Math.max(similarity,dice(leftWords,right.split(' ').filter(Boolean)));
    }
  }

  const substring=coreKeys.some((left)=>left.length>=5&&[...candidate.coreKeys].some((right)=>right.includes(left)||left.includes(right)));
  let score=similarity*100+(coreExact?20:0)+(exact?60:0)+(substring?8:0);
  if(equipment==='exact')score+=12;
  if(equipment==='mismatch')score-=28;

  return {score,exact,coreExact,similarity,equipment};
}

function qualityFor(match){
  if(match.exact&&match.equipment!=='mismatch')return {
    quality:'A · Coincidencia exacta',
    coachVisible:true,
    clientVisible:true,
  };
  if(match.coreExact&&match.equipment==='exact'&&match.similarity>=.82)return {
    quality:'B · Equivalencia visual probable',
    coachVisible:true,
    clientVisible:true,
  };
  if(match.similarity>=.62&&match.equipment!=='mismatch')return {
    quality:'C · Candidata para revisión Coach',
    coachVisible:true,
    clientVisible:false,
  };
  return {
    quality:'D · Sin imagen aprobada',
    coachVisible:false,
    clientVisible:false,
  };
}

const items=[];
const qualityCounts={};
const missingFiles=[];

for(const exercise of catalog){
  const ranked=repMeta
    .map((candidate)=>({...candidate,...scoreCandidate(exercise,candidate)}))
    .sort((a,b)=>b.score-a.score);

  const best=ranked[0];
  const decision=qualityFor(best);
  const source=best.exercise;
  const variants=decision.coachVisible?source.images?.flat||[]:[];
  const imageSlug=source.image_alias||source.id;
  const imagePaths=variants.map((variant)=>`/public/vendor/repdb/images/flat/${imageSlug}-${variant}.webp`);

  for(const mediaPath of imagePaths){
    const file=path.join(root,mediaPath.replace(/^\//,''));
    if(!fs.existsSync(file))missingFiles.push({exerciseId:exercise.id,repdbId:source.id,mediaPath});
  }

  qualityCounts[decision.quality]=(qualityCounts[decision.quality]||0)+1;
  items.push({
    iberfit_id:exercise.id,
    muscle_group:mappedMuscleGroup(exercise,source,decision.coachVisible),
    iberfit_name_es:exercise.name_es,
    repdb_id:decision.coachVisible?source.id:null,
    repdb_name_es:decision.coachVisible?(source.name_es||source.name||null):null,
    repdb_name_en:decision.coachVisible?(source.name_en||null):null,
    image_mode:variants.length===1?'main':variants.length===2?'start_peak':'none',
    image_paths:imagePaths,
    quality:decision.quality,
    score:Number(best.score.toFixed(2)),
    coach_visible:decision.coachVisible,
    client_visible:decision.clientVisible,
    equipment_status:best.equipment,
    match_similarity:Number(best.similarity.toFixed(4)),
    review_note:decision.clientVisible?'':'Revisar técnica, material y variante antes de aprobar para Cliente.',
  });
}

if(missingFiles.length)throw new Error(`RC31_MEDIA_MISSING_FILES:${JSON.stringify(missingFiles.slice(0,8))}`);
if(new Set(items.map((item)=>item.iberfit_id)).size!==367)throw new Error('RC31_MEDIA_CANONICAL_IDS_NOT_UNIQUE');

const coachVisible=items.filter((item)=>item.coach_visible).length;
const clientVisible=items.filter((item)=>item.client_visible).length;

if(coachVisible<20)throw new Error(`RC31_MEDIA_COACH_COVERAGE_TOO_LOW:${coachVisible}`);
if(clientVisible<10)throw new Error(`RC31_MEDIA_CLIENT_COVERAGE_TOO_LOW:${clientVisible}`);

const manifest={
  schemaVersion:3,
  release:'IBERFIT_M26_RC31_CANONICAL_MEDIA_MAP_V1',
  generatedAt:new Date().toISOString(),
  catalog:{
    kind:'IBERFIT_CANONICAL_M25_2',
    count:catalog.length,
    idsPreserved:true,
  },
  source:{
    provider:'RepDB',
    tier:'Free',
    exerciseCount:repdb.length,
    attributionText:'Exercise data by RepDB (repdb.co)',
    attributionUrl:'https://repdb.co/free-exercise-dataset',
  },
  policy:{
    clientUsesOnlyApprovedMedia:true,
    coachMaySeeReviewCandidates:true,
    missingMediaPreferredOverIncorrectMedia:true,
    canonicalExerciseIdsPreserved:true,
    brandOverlay:{
      asset:'/public/isotipo-iberfit.png',
      mode:'runtime_css_overlay',
      destructive:false,
    },
  },
  summary:{
    catalogExercises:catalog.length,
    coachVisible,
    clientVisible,
    withoutCoachMedia:catalog.length-coachVisible,
    withoutClientMedia:catalog.length-clientVisible,
    qualityCounts,
  },
  items,
};

fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(outputPath,`${JSON.stringify(manifest,null,2)}\n`);
fs.writeFileSync(reportPath,`${JSON.stringify({
  ok:true,
  generatedAt:manifest.generatedAt,
  sourceCommit:process.env.RC31_SOURCE_COMMIT||null,
  ...manifest.summary,
  missingFiles:[],
},null,2)}\n`);

console.log(JSON.stringify(manifest.summary,null,2));
