export const REPDB_MEDIA_MAP_URL='/public/vendor/repdb/iberfit-canonical-media-map-v1.json';

export const REPDB_MEDIA_ATTRIBUTION=Object.freeze({
  text:'Exercise data by RepDB (repdb.co)',
  url:'https://repdb.co/free-exercise-dataset',
});

const SAFE_MEDIA_PATH=/^\/(?:public\/)?vendor\/repdb\/images\/flat\/[a-z0-9-]+-(?:main|start|peak)\.webp$/;
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const manifestIndex=new WeakMap();

function normalizedRole(value){
  const role=String(value||'').trim().toLowerCase();
  if(['coach','entrenador','admin','administrador'].includes(role))return 'coach';
  if(['client','cliente'].includes(role))return 'client';
  return null;
}

function publicPath(path){
  return path.startsWith('/public/')?path:`/public${path}`;
}

function safePaths(value){
  if(!Array.isArray(value))return [];
  return value
    .filter((path)=>typeof path==='string'&&SAFE_MEDIA_PATH.test(path))
    .map(publicPath)
    .slice(0,2);
}

function indexFor(manifest){
  let index=manifestIndex.get(manifest);
  if(index)return index;
  index=new Map();
  for(const item of manifest.items){
    const id=String(item?.iberfit_id||'').trim();
    if(SAFE_ID.test(id)&&!index.has(id))index.set(id,item);
  }
  manifestIndex.set(manifest,index);
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

export function resolveExerciseMediaMetadata(manifest,exerciseId){
  if(!manifest)return null;
  const data=validateExerciseMediaMap(manifest);
  const id=String(exerciseId||'').trim();
  if(!SAFE_ID.test(id))return null;
  return indexFor(data).get(id)||null;
}

export function resolveExerciseMedia(manifest,exerciseId,{role='client'}={}){
  if(!manifest)return null;
  const data=validateExerciseMediaMap(manifest);
  const id=String(exerciseId||'').trim();
  if(!SAFE_ID.test(id))return null;

  const normalized=normalizedRole(role);
  if(!normalized)return null;

  const source=indexFor(data).get(id);
  if(!source)return null;

  const visible=normalized==='coach'?source.coach_visible===true:source.client_visible===true;
  if(!visible)return null;

  const images=safePaths(source.image_paths);
  if(!images.length)return null;

  return Object.freeze({
    exerciseId:id,
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

export async function loadExerciseMediaMap({
  fetchImpl=globalThis.fetch,
  url=REPDB_MEDIA_MAP_URL,
}={}){
  if(typeof fetchImpl!=='function')throw new Error('M26_MEDIA_FETCH_UNAVAILABLE');
  const response=await fetchImpl(url,{
    credentials:'same-origin',
    cache:'no-store',
    redirect:'error',
    headers:{accept:'application/json'},
  });
  if(!response?.ok)throw new Error(`M26_MEDIA_MAP_FETCH_FAILED:${response?.status||0}`);
  return validateExerciseMediaMap(await response.json());
}
