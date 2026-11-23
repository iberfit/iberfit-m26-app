import test from 'node:test';
import assert from 'node:assert/strict';
import {loadExerciseCatalog} from '../src/m26/exercises/catalog.js';

const base=Array.from({length:367},(_,i)=>({
  id:'IBF-'+String(i).padStart(4,'0'),name_es:'Ejercicio '+i,
  pattern:'squat',equipment:'bodyweight',difficulty:'beginner'
}));
function memoryStorage(){
  const data=new Map();
  return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),
    removeItem:k=>data.delete(k),keys:()=>[...data.keys()],read:k=>data.get(k)};
}
function browserFixture(){
  const names=['window','fetch','sessionStorage','localStorage','__IBERFIT_M26_RUNTIME__'];
  const old=Object.fromEntries(names.map(k=>[k,{present:Object.prototype.hasOwnProperty.call(globalThis,k),value:globalThis[k]}]));
  const store=memoryStorage(),calls=[];
  let broken=false;
  globalThis.window={};
  globalThis.sessionStorage=store;
  globalThis.localStorage=undefined; // Keep the original session-only contract deterministic.
  globalThis.__IBERFIT_M26_RUNTIME__={enabled:true,
    url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',
    publishableKey:'public-test-only',version:'26.test',timeoutMs:2000};
  globalThis.fetch=async(url,opts)=>{
    calls.push({url,method:opts.method});
    if(broken)throw Error('synthetic-offline');
    const profiles=url.includes('measurement_profiles');
    return {ok:true,status:200,json:async()=>profiles?[]:[{
      id:'IBF-0000',name_es:'Ejercicio actualizado',pattern:'squat',
      equipment:'bodyweight',difficulty:'beginner',revision:3,total_count:1
    }]};
  };
  return {store,calls,breakNetwork:()=>{broken=true;},
    restore:()=>{for(const n of names){if(old[n].present)globalThis[n]=old[n].value;else delete globalThis[n];}}};
}
test('same-tab public catalog reuse; explicit editor refresh always revalidates',async()=>{
  const f=browserFixture();
  try{
    const first=await loadExerciseCatalog(base);
    assert.equal(first.get('IBF-0000').name_es,'Ejercicio actualizado');
    assert.equal(f.calls.length,2);
    const second=await loadExerciseCatalog(base);
    assert.equal(second.get('IBF-0000').name_es,'Ejercicio actualizado');
    assert.equal(f.calls.length,2);
    const third=await loadExerciseCatalog(base,{forceRemoteRefresh:true});
    assert.equal(third.count,367);
    assert.equal(f.calls.length,4);
  }finally{f.restore();}
});
test('public-only TTL is short and never shares QA cache with PROD',async()=>{
  const f=browserFixture();
  try{
    await loadExerciseCatalog(base);
    const [key]=f.store.keys();
    assert.ok(key.includes('gjztkdwfmunnzhtvxrsu'));
    const parsed=JSON.parse(f.store.read(key));
    assert.deepEqual(Object.keys(parsed).sort(),['createdAt','measurementProfiles','origin','remoteRows','schema','version']);
    assert.doesNotMatch(f.store.read(key),/access_token|refresh_token|session_id|jwt/i);
    f.store.setItem(key,JSON.stringify({...parsed,createdAt:Date.now()-121_000}));
    await loadExerciseCatalog(base);
    assert.equal(f.calls.length,4);
    globalThis.__IBERFIT_M26_RUNTIME__.url='https://pjhmrhejsoofmouedavw.supabase.co';
    await loadExerciseCatalog(base);
    assert.equal(f.calls.length,6);
    assert.equal(f.store.keys().length,2);
  }finally{f.restore();}
});
test('storage denied and offline preserve static catalog fallback',async()=>{
  const f=browserFixture();
  try{
    globalThis.sessionStorage={getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};
    f.breakNetwork();
    const c=await loadExerciseCatalog(base);
    assert.equal(c.count,367);
    assert.equal(c.get('IBF-0000').name_es,'Ejercicio 0');
  }finally{f.restore();}
});

test('cross-tab public-only catalog uses shared bounded local cache without extra Supabase egress',async()=>{
  const f=browserFixture(),durable=memoryStorage();
  try{
    globalThis.localStorage=durable;
    const first=await loadExerciseCatalog(base);
    assert.equal(first.get('IBF-0000').name_es,'Ejercicio actualizado');
    assert.equal(f.calls.length,2);
    assert.equal(f.store.keys().length,0,'Do not write duplicate tab storage');
    assert.equal(durable.keys().length,1);
    const [key]=durable.keys();
    assert.ok(key.includes('gjztkdwfmunnzhtvxrsu'));
    assert.doesNotMatch(durable.read(key),/access_token|refresh_token|session_id|service_role|Bearer /iu);

    // New browser tab: separate sessionStorage; same public-origin localStorage.
    globalThis.sessionStorage=memoryStorage();
    const next=await loadExerciseCatalog(base);
    assert.equal(next.get('IBF-0000').name_es,'Ejercicio actualizado');
    assert.equal(f.calls.length,2,'Second tab must not re-fetch identical public RPC');

    // Editor publication explicitly overrides both caches, preserving freshness.
    await loadExerciseCatalog(base,{forceRemoteRefresh:true});
    assert.equal(f.calls.length,4);
    assert.equal(durable.keys().length,1);

    // Existing 120s TTL and environment isolation both remain hard bounds.
    const saved=JSON.parse(durable.read(key));
    durable.setItem(key,JSON.stringify({...saved,createdAt:Date.now()-121_000}));
    globalThis.sessionStorage=memoryStorage();
    await loadExerciseCatalog(base);
    assert.equal(f.calls.length,6);
    globalThis.__IBERFIT_M26_RUNTIME__.url='https://pjhmrhejsoofmouedavw.supabase.co';
    await loadExerciseCatalog(base);
    assert.equal(f.calls.length,8);
    assert.equal(durable.keys().length,2);
  }finally{f.restore();}
});
test('blocked persistent storage safely falls back to session-only public cache',async()=>{
  const f=browserFixture();
  try{
    globalThis.localStorage={
      getItem(){throw Error('browser denied durable cache');},
      setItem(){throw Error('browser denied durable cache');},
      removeItem(){throw Error('browser denied durable cache');},
    };
    await loadExerciseCatalog(base);
    await loadExerciseCatalog(base);
    assert.equal(f.calls.length,2);
    assert.equal(f.store.keys().length,1);
    await loadExerciseCatalog(base,{forceRemoteRefresh:true});
    assert.equal(f.calls.length,4);
  }finally{f.restore();}
});
test('malformed shared public cache does not spoof success or suppress remote revalidation',async()=>{
  const f=browserFixture(),durable=memoryStorage();
  try{
    globalThis.localStorage=durable;
    await loadExerciseCatalog(base);
    const [key]=durable.keys();
    durable.setItem(key,'{broken');
    globalThis.sessionStorage=memoryStorage();
    await loadExerciseCatalog(base);
    assert.equal(f.calls.length,4);
    assert.equal(JSON.parse(durable.read(key)).schema,'iberfit.public-catalog.v1');
  }finally{f.restore();}
});
