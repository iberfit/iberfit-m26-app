import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canSkipWearableReadForVerifiedRoles,loadWearablesWithBoundedRoleEvidence} from '../src/m26/app/wearable-bootstrap-demand.js';
import {loadExerciseCatalog} from '../src/m26/exercises/catalog.js';

test('skip only with positive, complete server-derived Coach/Admin evidence',()=>{
  assert.equal(canSkipWearableReadForVerifiedRoles(['coach']),true);
  assert.equal(canSkipWearableReadForVerifiedRoles(['admin']),true);
  assert.equal(canSkipWearableReadForVerifiedRoles(['coach','admin']),true);
  for(const roles of [null,[],['client'],['coach','client'],['admin','client'],['unverified'],['coach',null]]){
    assert.equal(canSkipWearableReadForVerifiedRoles(roles),false);
  }
});

test('a verified Coach avoids the authenticated optional wearable RPC',async()=>{
  let calls=0;
  const result=await loadWearablesWithBoundedRoleEvidence({
    roleEvidence:Promise.resolve(['coach']),
    fetchWearable:async()=>{calls++;return {private:'not-sent'};},
    fallback:{ready:false},waitMs:25,
  });
  assert.equal(result.skipped,true);
  assert.equal(result.data.ready,false);
  assert.equal(calls,0);
});

test('Client and multi-role accounts always get their normal, fresh wearable read',async()=>{
  for(const roles of [['client'],['coach','client'],['admin','client']]){
    let calls=0;
    const result=await loadWearablesWithBoundedRoleEvidence({
      roleEvidence:Promise.resolve(roles),
      fetchWearable:async()=>{calls++;return {ready:true,connections:['fresh']};},
      fallback:{ready:false},waitMs:25,
    });
    assert.equal(result.skipped,false);
    assert.equal(result.data.connections[0],'fresh');
    assert.equal(calls,1);
  }
});

test('slow or rejected role proof fails open for the read, not for authorization',async()=>{
  // Construct the failure only when its rejection handler is attached;
  // otherwise Node reports an unrelated unhandled rejection before this loop.
  for(const makeEvidence of [()=>new Promise(()=>{}),()=>Promise.reject(new Error('offline-context'))]){
    let calls=0;
    const result=await loadWearablesWithBoundedRoleEvidence({
      roleEvidence:makeEvidence(),fetchWearable:async()=>{calls++;return {ready:true};},
      fallback:{ready:false},waitMs:5,
    });
    assert.equal(result.skipped,false);
    assert.equal(result.data.ready,true);
    assert.equal(calls,1);
  }
});

test('no cross-owner wearable snapshot is ever persisted by this gate',async()=>{
  const seen=[];
  for(const value of ['owner-A','owner-B']){
    const result=await loadWearablesWithBoundedRoleEvidence({
      roleEvidence:Promise.resolve(['client']),
      fetchWearable:async()=>({owner:value}),
      fallback:null,waitMs:5,
    });
    seen.push(result.data.owner);
  }
  assert.deepEqual(seen,['owner-A','owner-B']);
});

test('application retains owner lease, authoritative role and Client catch-up',()=>{
  const src=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.match(src,/const wearablePreflightPending=loadWearablesWithBoundedRoleEvidence/u);
  assert.match(src,/roleEvidence:earlyWearableRoles/u);
  assert.match(src,/requireOwner\(\);\s*return optionalAuthBootstrap\(\s*\(\)=>transport\.wearableBootstrap\(currentToken\(\)\)/u);
  assert.match(src,/activeRole==='client'&&wearablePreflight\.skipped/u);
  assert.match(src,/requireOwner\(\);\s*const roleChoiceConfirmed/u);
});

const base=Array.from({length:367},(_,i)=>({
  id:'IBF-'+String(i).padStart(4,'0'),name_es:'Ejercicio '+i,
  pattern:'squat',equipment:'bodyweight',difficulty:'beginner',
}));

test('concurrent public catalog loads share remote reads; an explicit refresh revalidates',async()=>{
  const keys=['window','fetch','sessionStorage','__IBERFIT_M26_RUNTIME__'];
  const prior=Object.fromEntries(keys.map(k=>[k,{had:Object.hasOwn(globalThis,k),value:globalThis[k]}]));
  const cache=new Map(),calls=[];
  try{
    globalThis.window={};
    globalThis.sessionStorage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,String(v)),removeItem:k=>cache.delete(k)};
    globalThis.__IBERFIT_M26_RUNTIME__={
      enabled:true,url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',
      publishableKey:'public-key-only',version:'26-free-360-test',timeoutMs:1000,
    };
    globalThis.fetch=async(url)=>{
      const text=String(url);
      calls.push(text);
      await new Promise(resolve=>setTimeout(resolve,12));
      const profiles=text.includes('measurement_profiles');
      return {ok:true,status:200,json:async()=>profiles?[]:[{
        id:'IBF-0000',name_es:'Remoto',pattern:'squat',
        equipment:'bodyweight',difficulty:'beginner',revision:1,total_count:1,
      }]};
    };
    const [first,second,third]=await Promise.all([
      loadExerciseCatalog(base),loadExerciseCatalog(base),loadExerciseCatalog(base),
    ]);
    for(const item of [first,second,third])assert.equal(item.get('IBF-0000').name_es,'Remoto');
    assert.equal(calls.length,2,'one catalog page and one measurement request, not six');
    await loadExerciseCatalog(base,{forceRemoteRefresh:true});
    assert.equal(calls.length,4,'editor refresh bypasses session and in-flight cache');
    assert.equal(cache.size,1,'only public rows, no private client data');
    const serial=[...cache.values()][0];
    assert.doesNotMatch(serial,/refresh_token|access_token|session_id|jwt/u);
  }finally{
    for(const k of keys){if(prior[k].had)globalThis[k]=prior[k].value;else delete globalThis[k];}
  }
});
