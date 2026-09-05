import {localiseExerciseForDisplay} from './castellano.js';
const CATALOG_FETCH_TIMEOUT_MS=5_000;
const TRUSTED_EXERCISE_MEDIA_ORIGINS=new Set(['https://pjhmrhejsoofmouedavw.supabase.co','https://gjztkdwfmunnzhtvxrsu.supabase.co']);
function norm(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function stringList(value){return Object.freeze((Array.isArray(value)?value:[]).map((item)=>String(item||'').trim()).filter(Boolean));}
function freezeExercise(raw){raw=localiseExerciseForDisplay(raw);const id=String(raw?.id||'').trim(),name=String(raw?.name_es||'').trim();if(!id||!name)return null;return Object.freeze({...raw,id,name_es:name,pattern:String(raw.pattern||'').trim(),equipment:String(raw.equipment||'').trim(),difficulty:String(raw.difficulty||'').trim(),intent:String(raw.intent||'').trim(),primary_muscles:stringList(raw.primary_muscles),secondary_muscles:stringList(raw.secondary_muscles),cues:stringList(raw.cues),instructions_es:stringList(raw.instructions_es),precautions:stringList(raw.precautions),tags:stringList(raw.tags),aliases:stringList(raw.aliases)});}
export function createExerciseCatalog(records=[]){
 if(!Array.isArray(records))throw new Error('M26_EXERCISE_CATALOG_INVALID');const map=new Map();
 for(const raw of records){const ex=freezeExercise(raw);if(!ex)continue;if(map.has(ex.id))throw new Error(`M26_EXERCISE_DUPLICATE:${ex.id}`);map.set(ex.id,ex);}
 const list=Object.freeze([...map.values()]);
 const facets=Object.freeze({patterns:Object.freeze([...new Set(list.map(x=>x.pattern).filter(Boolean))].sort()),equipment:Object.freeze([...new Set(list.map(x=>x.equipment).filter(Boolean))].sort()),difficulty:Object.freeze([...new Set(list.map(x=>x.difficulty).filter(Boolean))].sort()),intent:Object.freeze([...new Set(list.map(x=>x.intent).filter(Boolean))].sort())});
 function search(query='',filters={}){const q=norm(query);return list.filter(ex=>{const hay=norm([ex.name_es,ex.pattern,ex.intent,ex.equipment,ex.difficulty,...ex.primary_muscles,...ex.secondary_muscles,...ex.tags,...ex.aliases].join(' '));if(q&&!hay.includes(q))return false;for(const [key,value] of Object.entries(filters||{})){if(value==null||value===''||(Array.isArray(value)&&!value.length))continue;const expected=Array.isArray(value)?value:[value];const actual=Array.isArray(ex[key])?ex[key].join(' '):ex[key];if(!expected.some(v=>norm(actual).includes(norm(v))))return false;}return true;});}
 return Object.freeze({count:list.length,list:()=>list,get:id=>map.get(String(id))||null,has:id=>map.has(String(id)),search,facets});
}
export function mergeExerciseCatalogRecords(baseCatalog,remoteRows=[],{mediaOrigin=''}={}){
 const base=Array.isArray(baseCatalog)?baseCatalog:typeof baseCatalog?.list==='function'?baseCatalog.list():[];
 if(!Array.isArray(remoteRows))throw new Error('M26_EXERCISE_REMOTE_CATALOG_INVALID');
 const origin=String(mediaOrigin||'').replace(/\/$/u,'');
 if(origin&&!TRUSTED_EXERCISE_MEDIA_ORIGINS.has(origin))throw new Error('M26_EXERCISE_MEDIA_ORIGIN_INVALID');
 const merged=new Map();
 for(const item of base){const id=String(item?.id||'').trim();if(id)merged.set(id,item);}
 for(const item of remoteRows){
  const id=String(item?.id||'').trim();if(!id)continue;
  const media=item?.media&&typeof item.media==='object'&&!Array.isArray(item.media)
    ?Object.freeze({...item.media,...(origin?{deliveryOrigin:origin}:{})})
    :{};
  merged.set(id,{...item,media});
 }
 return createExerciseCatalog([...merged.values()]);
}
export function resolveBrowserCatalogUrl(source,locationLike=globalThis.location){
 const fallback='http://localhost/';let base=fallback;
 try{const candidate=new URL(String(locationLike?.href||fallback));if(candidate.protocol==='http:'||candidate.protocol==='https:')base=candidate.href;}catch{}
 const resolved=new URL(String(source||''),base);if(resolved.protocol!=='http:'&&resolved.protocol!=='https:')throw new Error('M26_EXERCISE_CATALOG_URL_INVALID');
 let expectedOrigin=new URL(base).origin;const locationOrigin=String(locationLike?.origin||'').trim();if(locationOrigin&&locationOrigin!=='null'){try{const parsedOrigin=new URL(locationOrigin);if(parsedOrigin.protocol==='http:'||parsedOrigin.protocol==='https:')expectedOrigin=parsedOrigin.origin;}catch{}}
 if(resolved.origin!==expectedOrigin)throw new Error('M26_EXERCISE_CATALOG_CROSS_ORIGIN_FORBIDDEN');return resolved.href;
}
async function fetchCatalogJson(target){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),CATALOG_FETCH_TIMEOUT_MS);
 try{
  const response=await fetch(target,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
  if(!response.ok)throw new Error('M26_EXERCISE_CATALOG_FETCH_FAILED');
  return await response.json();
 }catch(error){
  if(error?.name==='AbortError')throw new Error('M26_EXERCISE_CATALOG_TIMEOUT');
  throw error;
 }finally{clearTimeout(timer);}
}
export async function loadExerciseCatalog(source){
 let records;
 if(Array.isArray(source))records=source;
 else if(source instanceof URL&&source.protocol==='file:'){
  const {readFile}=await import('node:fs/promises');records=JSON.parse(await readFile(source,'utf8'));
 }else if(source instanceof URL||typeof source==='string'){
  const browser=typeof window!=='undefined'&&typeof fetch==='function';let target=source instanceof URL?source.href:source;const remote=/^https?:\/\//i.test(target);
  if(browser||remote){if(browser)target=resolveBrowserCatalogUrl(target,globalThis.location);records=await fetchCatalogJson(target);}
  else{const {readFile}=await import('node:fs/promises');records=JSON.parse(await readFile(target,'utf8'));}
 }else throw new Error('M26_EXERCISE_CATALOG_SOURCE_REQUIRED');
 const catalog=createExerciseCatalog(records);if(catalog.count<367)throw new Error(`M26_EXERCISE_CATALOG_INCOMPLETE:${catalog.count}`);return catalog;
}

const VISUAL_SCHEMA='iberfit.exercise.visual.v1';
const VISUAL_STYLE='iberfit-premium-movement-pair-v1';
const MEDIA_KINDS=new Set(['movement','thumbnail','start','end','demo']);
const SAFE_VISUAL_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
function visualText(value=''){return String(value??'').trim();}
function visualList(value){return Object.freeze([...new Set((Array.isArray(value)?value:[]).map(visualText).filter(Boolean))]);}
function positiveInt(value){const n=Number(value);return Number.isInteger(n)&&n>0?n:null;}
function ensureVisualExerciseId(exercise){const id=visualText(exercise?.id);if(!SAFE_VISUAL_ID.test(id))throw new Error('IBERFIT_EXERCISE_VISUAL_ID_INVALID');return id;}
function ensureVisualPath(id,path){const value=visualText(path);if(!value||value.startsWith('/')||value.includes('..')||!value.startsWith(`${id}/`))throw new Error('IBERFIT_EXERCISE_VISUAL_PATH_INVALID');return value;}
function visualAsset(id,kind,raw={}){
 if(!MEDIA_KINDS.has(kind))throw new Error('IBERFIT_EXERCISE_VISUAL_KIND_INVALID');
 const path=ensureVisualPath(id,raw.path);const mime=visualText(raw.mime||raw.mime_type||'image/webp');
 if(!['image/webp','image/png','image/jpeg','video/webm'].includes(mime))throw new Error('IBERFIT_EXERCISE_VISUAL_MIME_INVALID');
 return Object.freeze({kind,path,mime,width:positiveInt(raw.width),height:positiveInt(raw.height),sha256:visualText(raw.sha256)||null});
}
export function buildExerciseVisualBrief(exercise={}){
 const id=ensureVisualExerciseId(exercise);const name=visualText(exercise.name_es||exercise.name)||id;
 return Object.freeze({schema:VISUAL_SCHEMA,style:VISUAL_STYLE,exerciseId:id,exerciseName:name,
  composition:Object.freeze({type:'movement_pair',showStartAndEndTogether:true,labelsOnImage:false,titleOnImage:false,watermark:false,anatomicalInset:true,anatomicalInsetPlacement:'discreet_corner',background:'same_dark_premium_iberfit_gym',camera:'full_body_three_quarter_side_instructional'}),
  athlete:Object.freeze({identity:'approved_iberfit_male_v1',continuityRequired:true,outfit:'fitted_black_training_kit',branding:'one_small_real_iberfit_isotype_left_chest_only',noWordmark:true,noInventedLogos:true}),
  palette:Object.freeze({environment:['charcoal','black'],accent:['iberfit_gold','subtle_approved_green'],lighting:'cinematic_instructional'}),
  biomechanics:Object.freeze({pattern:visualText(exercise.pattern),equipment:visualText(exercise.equipment),instructions:visualList(exercise.instructions_es),cues:visualList(exercise.cues),strict:true}),
  muscles:Object.freeze({primary:visualList(exercise.primary_muscles),secondary:visualList(exercise.secondary_muscles),highlightPrimary:true,highlightSecondary:'subtle'}),
  negative:Object.freeze(['no text labels','no position initial/final captions','no duplicated logos','no invented brand marks','no cropped hands or feet','no impossible joints','no misleading equipment path'])});
}
export function buildExerciseMediaManifest(exercise={},assets={},options={}){
 const id=ensureVisualExerciseId(exercise);if(!assets?.movement)throw new Error('IBERFIT_EXERCISE_VISUAL_MOVEMENT_REQUIRED');
 const movement=visualAsset(id,'movement',assets.movement);const optional={};for(const kind of ['thumbnail','start','end','demo'])if(assets[kind])optional[kind]=visualAsset(id,kind,assets[kind]);
 return Object.freeze({schema:VISUAL_SCHEMA,style:VISUAL_STYLE,revision:positiveInt(options.revision)||1,bucket:visualText(options.bucket)||'iberfit-exercise-media',movement,...optional,muscles:Object.freeze({primary:visualList(exercise.primary_muscles),secondary:visualList(exercise.secondary_muscles)}),generatedAt:visualText(options.generatedAt)||new Date().toISOString(),published:options.published===true,clientVisible:options.clientVisible===true,coachVisible:options.coachVisible!==false,qa:Object.freeze({biomechanics:visualText(options.biomechanicsStatus)||'pending',visual:visualText(options.visualStatus)||'pending'}),provenance:Object.freeze({rightsBasis:visualText(options.rightsBasis)||'iberfit_owned',sourceRef:visualText(options.sourceRef)||'IBERFIT_GENERATED',licenseLabel:visualText(options.licenseLabel)||'IBERFIT owned visual'})});
}
export function validateExerciseMediaManifest(exercise={},manifest={}){
 const id=ensureVisualExerciseId(exercise);const errors=[];if(manifest?.schema!==VISUAL_SCHEMA)errors.push('schema');if(manifest?.style!==VISUAL_STYLE)errors.push('style');if(visualText(manifest?.bucket)!=='iberfit-exercise-media')errors.push('bucket');
 try{visualAsset(id,'movement',manifest?.movement||{});}catch{errors.push('movement');}
 for(const kind of ['thumbnail','start','end','demo'])if(manifest?.[kind]){try{visualAsset(id,kind,manifest[kind]);}catch{errors.push(kind);}}
 if(manifest?.qa?.biomechanics!=='approved')errors.push('qa.biomechanics');if(manifest?.qa?.visual!=='approved')errors.push('qa.visual');if(manifest?.published!==true)errors.push('published');if(manifest?.clientVisible!==true&&manifest?.coachVisible!==true)errors.push('visibility');return Object.freeze({ok:errors.length===0,errors:Object.freeze([...new Set(errors)])});
}
export const IBERFIT_EXERCISE_VISUAL=Object.freeze({schema:VISUAL_SCHEMA,style:VISUAL_STYLE,bucket:'iberfit-exercise-media'});
