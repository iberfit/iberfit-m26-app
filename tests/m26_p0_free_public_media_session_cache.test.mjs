import test from 'node:test';
import assert from 'node:assert/strict';

const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const PROD='https://pjhmrhejsoofmouedavw.supabase.co';
const CATALOG_SOURCE=Object.freeze({
  schemaVersion:1,source:{provider:'IBERFIT'},items:[{
    exercise_id:'IBF-CACHE-01',name_es:'Referencia pública',
    review_status:'approved',published:true,coach_visible:true,client_visible:true,
    image_paths:['/public/iberfit/exercises/images/IBF-CACHE-01/main.webp'],
  }],
});
const RICH_SOURCE=Object.freeze({schemaVersion:2,source:{provider:'IBERFIT'},items:[]});
const REPDB_SOURCE=Object.freeze({schemaVersion:2,source:{
  provider:'RepDB',attributionText:'Exercise data by RepDB (repdb.co)',
  attributionUrl:'https://repdb.co/free-exercise-dataset',
},items:[]});

function fixture(){
  const names=['fetch','sessionStorage','__IBERFIT_M26_RUNTIME__'];
  const before=Object.fromEntries(names.map(k=>[k,{present:Object.hasOwn(globalThis,k),value:globalThis[k]}]));
  const cache=new Map(),calls=[];
  let remoteFails=false;
  globalThis.sessionStorage={
    getItem:k=>cache.get(k)??null,
    setItem:(k,v)=>cache.set(k,String(v)),
    removeItem:k=>cache.delete(k),
  };
  globalThis.__IBERFIT_M26_RUNTIME__={enabled:true,url:QA,
    publishableKey:'sb_publishable_qa_test_only',version:'26.0.0-QA-public',timeoutMs:500};
  globalThis.fetch=async(url,options={})=>{
    const u=String(url);calls.push({url:u,method:options.method||'GET'});
    if(u.includes('/rpc/iberfit_exercise_media_manifest_v1')){
      if(remoteFails)throw new Error('simulated-public-RPC-outage');
      return {ok:true,status:200,json:async()=>({schemaVersion:1,source:{provider:'IBERFIT'},items:[]})};
    }
    if(u.includes('media-v1.json'))return {ok:true,status:200,json:async()=>CATALOG_SOURCE};
    if(u.includes('media-v2.json'))return {ok:true,status:200,json:async()=>RICH_SOURCE};
    if(u.includes('repdb/'))return {ok:true,status:200,json:async()=>REPDB_SOURCE};
    throw new Error('unexpected-public-media-URL');
  };
  return {cache,calls,failRemote:()=>{remoteFails=true;},recover:()=>{remoteFails=false;},restore:()=>{
    for(const k of names){if(before[k].present)globalThis[k]=before[k].value;else delete globalThis[k];}
  }};
}
let moduleNumber=0;
async function freshModule(){
  moduleNumber++;
  return import('../src/m26/library/exercise-media.js?free-public-qa-reload-'+moduleNumber);
}

test('public media manifest survives reload at unchanged 60s TTL without another Supabase RPC',async()=>{
  const f=fixture();
  try{
    const a=await freshModule();
    const first=await a.loadExerciseMediaMap();
    assert.equal(first.kind,'IBERFIT_EXERCISE_MEDIA_BUNDLE');
    assert.equal(f.calls.length,4);
    assert.equal(f.calls.filter(x=>x.url.includes('/rpc/')).length,1);
    assert.equal(f.cache.size,1);
    const [key]=f.cache.keys();
    assert.ok(key.includes('gjztkdwfmunnzhtvxrsu'));
    const serialized=f.cache.get(key);
    assert.doesNotMatch(serialized,/access_token|refresh_token|session_id|Bearer |jwt|service_role/iu);
    assert.doesNotMatch(key,/sb_publishable_/u);
    const b=await freshModule();
    const second=await b.loadExerciseMediaMap();
    assert.equal(f.calls.length,4,'Page reload does not re-fetch public Supabase manifest');
    assert.deepEqual(second,first,'Exact public media contents on reuse');
    assert.equal(second.iberfit.items[0].exercise_id,'IBF-CACHE-01');
    await b.loadExerciseMediaMap({forceRefresh:true});
    assert.equal(f.calls.length,8,'Explicit publication refresh always queries fresh server');
  }finally{f.restore();}
});

test('bad/expired public cache never grants scope or hides updated manifests',async()=>{
  const f=fixture();
  try{
    const a=await freshModule();
    await a.loadExerciseMediaMap();
    const [key]=f.cache.keys();
    const stored=JSON.parse(f.cache.get(key));
    f.cache.set(key,JSON.stringify({...stored,createdAt:Date.now()-61_000}));
    await (await freshModule()).loadExerciseMediaMap();
    assert.equal(f.calls.length,8);
    f.cache.set(key,JSON.stringify({...stored,bundle:{kind:'FAKE',iberfit:{source:{provider:'evil'}}}}));
    await (await freshModule()).loadExerciseMediaMap();
    assert.equal(f.calls.length,12);
    globalThis.__IBERFIT_M26_RUNTIME__.url=PROD;
    await (await freshModule()).loadExerciseMediaMap();
    assert.equal(f.calls.length,16,'QA cache may never satisfy PROD origin');
    assert.equal(f.cache.size,2);
  }finally{f.restore();}
});

test('failed public RPC and disabled storage retain safe static media with retry',async()=>{
  const f=fixture();
  try{
    globalThis.sessionStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
    f.failRemote();
    const a=await freshModule(),bundle=await a.loadExerciseMediaMap();
    assert.equal(bundle.iberfit.items[0].exercise_id,'IBF-CACHE-01');
    assert.equal(bundle.kind,'IBERFIT_EXERCISE_MEDIA_BUNDLE');
    f.recover();
    const b=await freshModule();
    await b.loadExerciseMediaMap();
    assert.equal(f.calls.length,8,'Partial/outage fallback not saved as completed manifest');
    assert.equal(f.calls.filter(x=>x.url.includes('/rpc/')).length,2);
  }finally{f.restore();}
});
