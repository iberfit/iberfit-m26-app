export const IBERFIT_MEDIA_MAP_URL='/public/iberfit/exercises/iberfit-exercise-media-v1.json';
export const REPDB_MEDIA_MAP_URL='/public/vendor/repdb/iberfit-canonical-media-map-v1.json';
export const EXERCISE_MEDIA_BUNDLE_KIND='IBERFIT_EXERCISE_MEDIA_BUNDLE';

export const REPDB_MEDIA_ATTRIBUTION=Object.freeze({
  text:'Exercise data by RepDB (repdb.co)',
  url:'https://repdb.co/free-exercise-dataset',
  label:'RepDB (repdb.co)',
});

const SAFE_REPDB_MEDIA_PATH=/^\/(?:public\/)?vendor\/repdb\/images\/flat\/[a-z0-9-]+-(?:main|start|peak)\.webp$/;
const SAFE_IBERFIT_MEDIA_PATH=/^\/public\/iberfit\/exercises\/images\/[A-Za-z0-9][A-Za-z0-9._:-]{0,199}\/(?:main|start|peak)\.webp$/;
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const manifestIndexes=new WeakMap();

function normalizedRole(value){
  const role=String(value||'').trim().toLowerCase();
  if(['coach','entrenador','admin','administrador'].includes(role))return 'coach';
  if(['client','cliente'].includes(role))return 'client';
  return null;
}

function publicRepdbPath(path){
  return path.startsWith('/public/')?path:`/public${path}`;
}

function safeRepdbPaths(value){
  if(!Array.isArray(value))return [];
  return value
    .filter((path)=>typeof path==='string'&&SAFE_REPDB_MEDIA_PATH.test(path))
    .map(publicRepdbPath)
    .slice(0,2);
}

function safeIberfitPaths(value,exerciseId){
  if(!Array.isArray(value))return [];
  const prefix=`/public/iberfit/exercises/images/${exerciseId}/`;
  return value
    .filter((path)=>typeof path==='string'&&SAFE_IBERFIT_MEDIA_PATH.test(path)&&path.startsWith(prefix))
    .slice(0,2);
}

function itemId(item,provider){
  const value=provider==='IBERFIT'
    ?item?.exercise_id??item?.exerciseId??item?.iberfit_id
    :item?.iberfit_id;
  return String(value||'').trim();
}

function indexFor(manifest,provider){
  let providerIndexes=manifestIndexes.get(manifest);
  if(!providerIndexes){
    providerIndexes=new Map();
    manifestIndexes.set(manifest,providerIndexes);
  }
  if(providerIndexes.has(provider))return providerIndexes.get(provider);
  const index=new Map();
  for(const item of manifest.items){
    const id=itemId(item,provider);
    if(SAFE_ID.test(id)&&!index.has(id))index.set(id,item);
  }
  providerIndexes.set(provider,index);
  return index;
}

export function validateExerciseMediaMap(manifest){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw new Error('M26_MEDIA_MAP_REQUIRED');
  if(![2,3].includes(manifest.schemaVersion))throw new Error('M26_MEDIA_MAP_VERSION_UNSUPPORTED');
  if(!Array.isArray(manifest.items))throw new Error('M26_MEDIA_MAP_ITEMS_REQUIRED');
  if(manifest?.source?.provider!=='RepDB')throw new Error('M26_MEDIA_SOURCE_INVALID');
  if(manifest?.source?.attributionText!==REPDB_MEDIA_ATTRIBUTION.text)throw new Error('M26_MEDIA_ATTRIBUTION_INVALID');
  if(manifest?.source?.attributionUrl!==REPDB_MEDIA_ATTRIBUTION.url)throw new Error('M26_MEDIA_ATTRIBUTION_URL_INVALID');
  return manifest;
}

export function validateIberfitExerciseMediaMap(manifest){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw new Error('M26_IBERFIT_MEDIA_MAP_REQUIRED');
  if(manifest.schemaVersion!==1)throw new Error('M26_IBERFIT_MEDIA_MAP_VERSION_UNSUPPORTED');
  if(!Array.isArray(manifest.items))throw new Error('M26_IBERFIT_MEDIA_MAP_ITEMS_REQUIRED');
  if(manifest?.source?.provider!=='IBERFIT')throw new Error('M26_IBERFIT_MEDIA_SOURCE_INVALID');
  const ids=new Set();
  for(const item of manifest.items){
    const id=itemId(item,'IBERFIT');
    if(!SAFE_ID.test(id))throw new Error('M26_IBERFIT_MEDIA_ID_INVALID');
    if(ids.has(id))throw new Error(`M26_IBERFIT_MEDIA_ID_DUPLICATE:${id}`);
    ids.add(id);
  }
  return manifest;
}

export function createExerciseMediaBundle({iberfit=null,repdb=null}={}){
  const owned=iberfit?validateIberfitExerciseMediaMap(iberfit):null;
  const fallback=repdb?validateExerciseMediaMap(repdb):null;
  if(!owned&&!fallback)throw new Error('M26_MEDIA_BUNDLE_EMPTY');
  return Object.freeze({
    schemaVersion:1,
    kind:EXERCISE_MEDIA_BUNDLE_KIND,
    iberfit:owned,
    repdb:fallback,
  });
}

function mapsFor(value){
  if(!value)return {iberfit:null,repdb:null};
  if(value.kind===EXERCISE_MEDIA_BUNDLE_KIND){
    return {
      iberfit:value.iberfit?validateIberfitExerciseMediaMap(value.iberfit):null,
      repdb:value.repdb?validateExerciseMediaMap(value.repdb):null,
    };
  }
  if(value?.source?.provider==='IBERFIT'){
    return {iberfit:validateIberfitExerciseMediaMap(value),repdb:null};
  }
  return {iberfit:null,repdb:validateExerciseMediaMap(value)};
}

function resolveIberfitMedia(manifest,exerciseId,role){
  if(!manifest)return null;
  const source=indexFor(manifest,'IBERFIT').get(exerciseId);
  if(!source)return null;
  if(String(source.review_status||source.reviewStatus||'').trim().toLowerCase()!=='approved')return null;
  if(source.published!==true)return null;
  const visible=role==='coach'?source.coach_visible===true:source.client_visible===true;
  if(!visible)return null;
  const images=safeIberfitPaths(source.image_paths??source.imagePaths,exerciseId);
  if(!images.length)return null;
  const mode=(source.image_mode??source.imageMode)==='start_peak'&&images.length>1?'start_peak':'main';
  return Object.freeze({
    exerciseId,
    provider:'IBERFIT',
    owned:true,
    sourceId:exerciseId,
    sourceName:String(source.name_es||source.name||''),
    quality:'IBERFIT · Aprobada',
    mode,
    images:Object.freeze(images),
    attribution:null,
    brandOverlay:Object.freeze({
      asset:'/public/isotipo-iberfit.png',
      position:'bottom-right',
      destructive:false,
    }),
  });
}

function resolveRepdbMedia(manifest,exerciseId,role){
  if(!manifest)return null;
  const source=indexFor(manifest,'RepDB').get(exerciseId);
  if(!source)return null;
  const visible=role==='coach'?source.coach_visible===true:source.client_visible===true;
  if(!visible)return null;
  const images=safeRepdbPaths(source.image_paths);
  if(!images.length)return null;
  return Object.freeze({
    exerciseId,
    provider:'RepDB',
    owned:false,
    sourceId:String(source.repdb_id||''),
    sourceName:String(source.repdb_name_es||''),
    quality:String(source.quality||''),
    mode:source.image_mode==='start_peak'?'start_peak':'main',
    images:Object.freeze(images),
    attribution:REPDB_MEDIA_ATTRIBUTION,
    brandOverlay:Object.freeze({
      asset:'/public/isotipo-iberfit.png',
      position:'bottom-right',
      destructive:false,
    }),
  });
}

export function resolveExerciseMediaMetadata(manifest,exerciseId){
  const id=String(exerciseId||'').trim();
  if(!SAFE_ID.test(id))return null;
  const maps=mapsFor(manifest);
  const fallback=maps.repdb?indexFor(maps.repdb,'RepDB').get(id)||null:null;
  const owned=maps.iberfit?indexFor(maps.iberfit,'IBERFIT').get(id)||null:null;
  if(!owned)return fallback;
  return Object.freeze({...fallback,...owned,provider:'IBERFIT'});
}

export function resolveExerciseMedia(manifest,exerciseId,{role='client'}={}){
  const id=String(exerciseId||'').trim();
  if(!SAFE_ID.test(id))return null;
  const normalized=normalizedRole(role);
  if(!normalized)return null;
  const maps=mapsFor(manifest);
  return resolveIberfitMedia(maps.iberfit,id,normalized)
    ||resolveRepdbMedia(maps.repdb,id,normalized)
    ||null;
}

async function fetchMap(fetchImpl,url,validator){
  const response=await fetchImpl(url,{
    credentials:'same-origin',
    cache:'no-store',
    redirect:'error',
    headers:{accept:'application/json'},
  });
  if(!response?.ok)throw new Error(`M26_MEDIA_MAP_FETCH_FAILED:${response?.status||0}:${url}`);
  return validator(await response.json());
}

export async function loadExerciseMediaMap({
  fetchImpl=globalThis.fetch,
  iberfitUrl=IBERFIT_MEDIA_MAP_URL,
  repdbUrl=REPDB_MEDIA_MAP_URL,
}={}){
  if(typeof fetchImpl!=='function')throw new Error('M26_MEDIA_FETCH_UNAVAILABLE');
  const [iberfitResult,repdbResult]=await Promise.allSettled([
    fetchMap(fetchImpl,iberfitUrl,validateIberfitExerciseMediaMap),
    fetchMap(fetchImpl,repdbUrl,validateExerciseMediaMap),
  ]);
  const iberfit=iberfitResult.status==='fulfilled'?iberfitResult.value:null;
  const repdb=repdbResult.status==='fulfilled'?repdbResult.value:null;
  return createExerciseMediaBundle({iberfit,repdb});
}
