import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IBERFIT_MEDIA_MAP_URL,IBERFIT_RICH_MEDIA_MAP_URL,REPDB_MEDIA_MAP_URL,
  REPDB_MEDIA_ATTRIBUTION,loadExerciseMediaMap,
} from '../src/m26/library/exercise-media.js';

const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const PROD='https://pjhmrhejsoofmouedavw.supabase.co';
const owned={schemaVersion:1,source:{provider:'IBERFIT'},items:[]};
const rich={schemaVersion:2,source:{provider:'IBERFIT'},items:[]};
const repdb={schemaVersion:2,source:{provider:'RepDB',attributionText:REPDB_MEDIA_ATTRIBUTION.text,attributionUrl:REPDB_MEDIA_ATTRIBUTION.url},items:[]};
const urls=[IBERFIT_MEDIA_MAP_URL,IBERFIT_RICH_MEDIA_MAP_URL,REPDB_MEDIA_MAP_URL];
function fixture(){
  const names=['fetch','__IBERFIT_M26_RUNTIME__'];
  const prior=Object.fromEntries(names.map(k=>[k,{had:Object.hasOwn(globalThis,k),value:globalThis[k]}]));
  const calls=[];
  globalThis.__IBERFIT_M26_RUNTIME__={enabled:true,url:QA,publishableKey:'test-public-media-only',version:'media-free-360-test'};
  globalThis.fetch=async(url)=>{
    calls.push(String(url));
    await new Promise(resolve=>setTimeout(resolve,8));
    const pathname=String(url);
    const payload=pathname===urls[0]?owned:pathname===urls[1]?rich:pathname===urls[2]?repdb:owned;
    return {ok:true,status:200,json:async()=>payload};
  };
  return {
    calls,
    setRuntime:r=>{globalThis.__IBERFIT_M26_RUNTIME__={...globalThis.__IBERFIT_M26_RUNTIME__,...r};},
    restore:()=>{for(const name of names){if(prior[name].had)globalThis[name]=prior[name].value;else delete globalThis[name];}},
  };
}

test('four public manifests share one in-flight request and one short-lived tab cache',async()=>{
  const f=fixture();
  try{
    const a=loadExerciseMediaMap();
    const b=loadExerciseMediaMap();
    const c=loadExerciseMediaMap();
    const bundles=await Promise.all([a,b,c]);
    assert.equal(f.calls.length,4,'three static JSON and one anonymous RPC, not twelve');
    assert.equal(bundles[0],bundles[1]);
    assert.equal(bundles[1],bundles[2]);
    const again=await loadExerciseMediaMap();
    assert.equal(again,bundles[0]);
    assert.equal(f.calls.length,4,'no repeat public RPC/manifest GET in TTL');
    const refreshed=await loadExerciseMediaMap({forceRefresh:true});
    assert.equal(f.calls.length,8,'explicit publication refresh always revalidates');
    assert.notEqual(refreshed,bundles[0]);
  }finally{f.restore();}
});

test('QA and PROD manifest cache keys are isolated and release version rotates them',async()=>{
  const f=fixture();
  try{
    await loadExerciseMediaMap();
    assert.equal(f.calls.length,4);
    f.setRuntime({url:PROD});
    await loadExerciseMediaMap();
    assert.equal(f.calls.length,8);
    f.setRuntime({version:'media-free-360-next-release'});
    await loadExerciseMediaMap();
    assert.equal(f.calls.length,12);
  }finally{f.restore();}
});

test('partial failed manifests are not retained as if fully published',async()=>{
  const f=fixture();
  try{
    let bad=true;
    globalThis.fetch=async(url)=>{
      f.calls.push(String(url));
      const path=String(url);
      if(path===REPDB_MEDIA_MAP_URL&&bad)return {ok:false,status:503,json:async()=>({})};
      return {ok:true,status:200,json:async()=>path===urls[0]?owned:path===urls[1]?rich:path===urls[2]?repdb:owned};
    };
    await loadExerciseMediaMap();
    assert.equal(f.calls.length,4);
    bad=false;
    const next=await loadExerciseMediaMap();
    assert.equal(f.calls.length,8,'network partial fallback retries rather than becoming cache');
    assert.equal(next.repdb.source.provider,'RepDB');
  }finally{f.restore();}
});
