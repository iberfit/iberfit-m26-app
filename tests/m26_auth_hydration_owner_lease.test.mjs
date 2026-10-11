import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHydrationCoordinator} from '../src/m26/app/hydration-coordinator.js';

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('same session coalesces its queued hydration reasons',async()=>{
  const owner={user:{id:'A'}},first=deferred(),second=deferred(),calls=[];
  const coordinator=createHydrationCoordinator(({reason,ownerSession})=>{
    calls.push({reason,ownerSession});
    return calls.length===1?first.promise:second.promise;
  },{getOwner:()=>owner});
  const a=coordinator.request({reason:'first'});
  const b=coordinator.request({reason:'recheck'});
  await tick();
  assert.equal(calls.length,1);
  first.resolve('old');
  await tick();
  assert.equal(calls.length,2);
  assert.equal(calls[1].reason,'recheck');
  assert.equal(calls[1].ownerSession,owner);
  second.resolve('latest');
  assert.equal(await a,'latest');
  assert.equal(await b,'latest');
});

test('owner B never coalesces with A and old A finalizer never clears B flight',async()=>{
  const a={id:'A'},b={id:'B'},pA=deferred(),pB=deferred(),calls=[];
  let owner=a;
  const coordinator=createHydrationCoordinator(({ownerSession})=>{
    calls.push(ownerSession);
    return ownerSession===a?pA.promise:pB.promise;
  },{getOwner:()=>owner});
  const old=coordinator.request();
  await tick();
  owner=b;
  const current=coordinator.request();
  await tick();
  assert.deepEqual(calls,[a,b]);
  pA.resolve('A');
  assert.equal(await old,'A');
  const sameB=coordinator.request({reason:'recheck'});
  await tick();
  assert.deepEqual(calls,[a,b],'B flight remains owned despite A completion');
  pB.resolve('B');
  assert.equal(await current,'B');
  assert.equal(await sameB,'B');
  assert.deepEqual(calls,[a,b,b],'B alone drains B queued request');
});

test('obsolete queued microtask never dispatches after owner changes',async()=>{
  const a={id:'A'},b={id:'B'},calls=[];
  let owner=a;
  const coordinator=createHydrationCoordinator(async({ownerSession})=>{
    calls.push(ownerSession);
    return ownerSession.id;
  },{getOwner:()=>owner});
  const old=coordinator.request();
  owner=b;
  const now=coordinator.request();
  await assert.rejects(old,/M26_HYDRATION_OWNER_SUPERSEDED/);
  assert.equal(await now,'B');
  assert.deepEqual(calls,[b]);
});

const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
const begin=source.indexOf('  async function hydratePass(');
const end=source.indexOf('  const hydrationCoordinator=',begin);
assert.ok(begin>=0&&end>begin,'Execute actual application hydratePass');
const hydrateSource=source.slice(begin,end);
const snapshot=id=>({user:{id,role:'client'},data:{appointments:[]},environment:{},canary:{}});

function fixture(){
  const a={user:{id:'A'},token:'token-A'},b={user:{id:'B'},token:'token-B'};
  const backend={A:deferred(),B:deferred()},writes=[],statuses=[],tokens=[],preferences=[];
  const state={
    Promise,Error,session:a,activeApplicationRole:null,runtime:{version:'26.0.0'},
    qaStage(){},currentToken(){return state.session?.token;},
    refreshSessionIfNeeded:async()=>state.session,
    store:{
      setHydration:(status)=>statuses.push(status),
      hydrate:value=>writes.push(value.user.id),
    },
    transport:{
      bootstrap(token){tokens.push(token);return token==='token-A'?backend.A.promise:backend.B.promise;},
      commandRegistry:async()=>({}),
      backendBootstrap:async()=>({ready:true}),
      wearableBootstrap:async()=>({ready:true,connections:[],dailySummaries:[],consents:[]}),
    },
    rc39Transport:null,adminTransport:null,communicationTransport:null,
    optionalAuthBootstrap:async(fn)=>fn(),
    validatedRuntimeRegistry:()=>({base:{ok:true,missing:[]}}),
    normalizeApplicationContextExtension:()=>({available:false,roles:[],organizationId:null,membershipStatus:null,assignmentScopeEnforced:false}),
    normalizeAuthorizedRoles:({authorizedRoles})=>authorizedRoles,
    canSwitchApplication:()=>false,
    readPreferredApplicationRole:()=>null,
    resolveActiveRole:(roles,preferred)=>preferred||roles[0]||null,
    filterSnapshotForAssignmentScope:x=>x,
    mergeRc39ChangeRequests:x=>x,
    writePreferredApplicationRole:id=>preferences.push(id),
  };
  const run=runInNewContext(hydrateSource+'\nhydratePass',state);
  return {a,b,state,backend,writes,statuses,tokens,preferences,
    coordinator:createHydrationCoordinator(run,{getOwner:()=>state.session})};
}

test('real hydratePass blocks A snapshot after switching to client B',async()=>{
  const f=fixture();
  const old=f.coordinator.request({reason:'login'});
  await tick();
  f.state.session=f.b;
  const current=f.coordinator.request({reason:'login'});
  await tick();
  f.backend.A.resolve(snapshot('A'));
  await assert.rejects(old,/M26_HYDRATION_STALE_SESSION/);
  assert.deepEqual(f.writes,[]);
  assert.equal(f.statuses.includes('error'),false);
  f.backend.B.resolve(snapshot('B'));
  assert.equal((await current).snapshot.user.id,'B');
  assert.deepEqual(f.writes,['B']);
  assert.deepEqual(f.preferences,['B']);
  assert.deepEqual(f.tokens,['token-A','token-B']);
});

test('real hydratePass suppresses obsolete A failure while B loads',async()=>{
  const f=fixture();
  const old=f.coordinator.request();
  await tick();
  f.state.session=f.b;
  const current=f.coordinator.request();
  await tick();
  f.backend.A.reject(new Error('synthetic-network-failure'));
  await assert.rejects(old,/synthetic-network-failure/);
  assert.equal(f.statuses.includes('error'),false);
  f.backend.B.resolve(snapshot('B'));
  assert.equal((await current).snapshot.user.id,'B');
  assert.deepEqual(f.writes,['B']);
});

test('same-user re-login uses new generation; old snapshot is never adopted',async()=>{
  const f=fixture();
  const old=f.coordinator.request();
  await tick();
  f.state.session={user:{id:'A'},token:'token-B'};
  const newer=f.coordinator.request();
  await tick();
  f.backend.A.resolve(snapshot('A'));
  await assert.rejects(old,/M26_HYDRATION_STALE_SESSION/);
  f.backend.B.resolve(snapshot('A'));
  assert.equal((await newer).snapshot.user.id,'A');
  assert.deepEqual(f.writes,['A']);
});

test('production controller uses owner-aware coordinator and stale-error fence',()=>{
  assert.match(source,/createHydrationCoordinator\(hydratePass,\{getOwner:\(\)=>session\}\)/u);
  assert.match(hydrateSource,/if\(session===hydrationSession\)store\.setHydration\('error',error\)/u);
  assert.match(hydrateSource,/requireOwner\(\);[^\n]*\n\s*qaStage\('rc64-hydrate-store-start'\);\s*store\.hydrate\(enriched\)/u);
});
