const VISUAL_SCHEMA='iberfit.exercise.visual.v1';
const VISUAL_STYLE='iberfit-premium-movement-pair-v1';
const MEDIA_KINDS=new Set(['movement','thumbnail','start','end','demo']);
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

function text(value=''){return String(value??'').trim();}
function list(value){return [...new Set((Array.isArray(value)?value:[]).map(text).filter(Boolean))];}
function positiveInt(value){const n=Number(value);return Number.isInteger(n)&&n>0?n:null;}
function ensureExerciseId(exercise){const id=text(exercise?.id);if(!SAFE_ID.test(id))throw new Error('IBERFIT_EXERCISE_VISUAL_ID_INVALID');return id;}
function ensurePath(id,path){const value=text(path);if(!value||value.startsWith('/')||value.includes('..')||!value.startsWith(`${id}/`))throw new Error('IBERFIT_EXERCISE_VISUAL_PATH_INVALID');return value;}
function asset(id,kind,raw={}){
  if(!MEDIA_KINDS.has(kind))throw new Error('IBERFIT_EXERCISE_VISUAL_KIND_INVALID');
  const path=ensurePath(id,raw.path);
  const mime=text(raw.mime||raw.mime_type||'image/webp');
  if(!['image/webp','image/png','image/jpeg','video/webm'].includes(mime))throw new Error('IBERFIT_EXERCISE_VISUAL_MIME_INVALID');
  return Object.freeze({kind,path,mime,width:positiveInt(raw.width),height:positiveInt(raw.height),sha256:text(raw.sha256)||null});
}

export function buildExerciseVisualBrief(exercise={}){
  const id=ensureExerciseId(exercise);
  const name=text(exercise.name_es||exercise.name)||id;
  const primary=list(exercise.primary_muscles);
  const secondary=list(exercise.secondary_muscles);
  const cues=list(exercise.cues);
  const instructions=list(exercise.instructions_es);
  return Object.freeze({
    schema:VISUAL_SCHEMA,
    style:VISUAL_STYLE,
    exerciseId:id,
    exerciseName:name,
    composition:Object.freeze({
      type:'movement_pair',
      showStartAndEndTogether:true,
      labelsOnImage:false,
      titleOnImage:false,
      watermark:false,
      anatomicalInset:true,
      anatomicalInsetPlacement:'discreet_corner',
      background:'same_dark_premium_iberfit_gym',
      camera:'full_body_three_quarter_side_instructional',
    }),
    athlete:Object.freeze({
      identity:'approved_iberfit_male_v1',
      continuityRequired:true,
      outfit:'fitted_black_training_kit',
      branding:'one_small_real_iberfit_isotype_left_chest_only',
      noWordmark:true,
      noInventedLogos:true,
    }),
    palette:Object.freeze({environment:['charcoal','black'],accent:['iberfit_gold','subtle_approved_green'],lighting:'cinematic_instructional'}),
    biomechanics:Object.freeze({pattern:text(exercise.pattern),equipment:text(exercise.equipment),instructions,cues,strict:true}),
    muscles:Object.freeze({primary,secondary,highlightPrimary:true,highlightSecondary:'subtle'}),
    negative:Object.freeze(['no text labels','no position initial/final captions','no duplicated logos','no invented brand marks','no cropped hands or feet','no impossible joints','no misleading equipment path']),
  });
}

export function buildExerciseMediaManifest(exercise={},assets={},options={}){
  const id=ensureExerciseId(exercise);
  if(!assets?.movement)throw new Error('IBERFIT_EXERCISE_VISUAL_MOVEMENT_REQUIRED');
  const movement=asset(id,'movement',assets.movement);
  const optional={};
  for(const kind of ['thumbnail','start','end','demo'])if(assets[kind])optional[kind]=asset(id,kind,assets[kind]);
  return Object.freeze({
    schema:VISUAL_SCHEMA,
    style:VISUAL_STYLE,
    revision:positiveInt(options.revision)||1,
    bucket:text(options.bucket)||'iberfit-exercise-media',
    movement,
    ...optional,
    muscles:Object.freeze({primary:list(exercise.primary_muscles),secondary:list(exercise.secondary_muscles)}),
    generatedAt:text(options.generatedAt)||new Date().toISOString(),
    qa:Object.freeze({biomechanics:text(options.biomechanicsStatus)||'pending',visual:text(options.visualStatus)||'pending'}),
  });
}

export function validateExerciseMediaManifest(exercise={},manifest={}){
  const id=ensureExerciseId(exercise);
  const errors=[];
  if(manifest?.schema!==VISUAL_SCHEMA)errors.push('schema');
  if(manifest?.style!==VISUAL_STYLE)errors.push('style');
  if(text(manifest?.bucket)!=='iberfit-exercise-media')errors.push('bucket');
  try{asset(id,'movement',manifest?.movement||{});}catch{errors.push('movement');}
  for(const kind of ['thumbnail','start','end','demo'])if(manifest?.[kind]){try{asset(id,kind,manifest[kind]);}catch{errors.push(kind);}}
  if(manifest?.qa?.biomechanics!=='approved')errors.push('qa.biomechanics');
  if(manifest?.qa?.visual!=='approved')errors.push('qa.visual');
  return Object.freeze({ok:errors.length===0,errors:Object.freeze([...new Set(errors)])});
}

export const IBERFIT_EXERCISE_VISUAL=Object.freeze({schema:VISUAL_SCHEMA,style:VISUAL_STYLE,bucket:'iberfit-exercise-media'});
