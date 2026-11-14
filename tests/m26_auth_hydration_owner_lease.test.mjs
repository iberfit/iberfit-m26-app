import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHydrationCoordinator} from '../src/m26/app/hydration-coordinator.js';
import {mergeV47DailyIntoClientProgress} from '../src/m26/wearables/v47-progress-bridge.js';
import {prepareQaClientEnvelopeForApplicationRole} from '../src/m26/production-state.js';

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
  let owner=a,oldSignal;
  const coordinator=createHydrationCoordinator(({ownerSession,signal})=>{
    calls.push(ownerSession);
    if(ownerSession===a)oldSignal=signal;
    return ownerSession===a?pA.promise:pB.promise;
  },{getOwner:()=>owner});
  const old=coordinator.request();
  await tick();
  owner=b;
  const current=coordinator.request();
  await tick();
  assert.deepEqual(calls,[a,b]);
  assert.equal(oldSignal.aborted,true,'owner B cancels obsolete owner A I/O');
  pA.resolve('A');
  await assert.rejects(old,/M26_HYDRATION_CANCELLED/);
  const sameB=coordinator.request({reason:'recheck'});
  await tick();
  assert.deepEqual(calls,[a,b],'B flight remains owned despite A completion');
  pB.resolve('B');
  assert.equal(await current,'B');
  assert.equal(await sameB,'B');
  assert.deepEqual(calls,[a,b,b],'B alone drains B queued request');
});

test('explicit cancel allows same-owner retry and old result cannot overwrite it',async()=>{
  const owner={id:'A'},first=deferred(),second=deferred(),signals=[],calls=[];
  const coordinator=createHydrationCoordinator(({signal})=>{
    signals.push(signal);calls.push('run');
    return calls.length===1?first.promise:second.promise;
  },{getOwner:()=>owner});
  const obsolete=coordinator.request({reason:'login'});
  await tick();
  assert.equal(coordinator.cancel(),true);
  assert.equal(signals[0].aborted,true);
  const current=coordinator.request({reason:'session-retry'});
  await tick();
  assert.equal(calls.length,2,'retry must not coalesce with a canceled unresolved read');
  first.resolve('stale');
  await assert.rejects(obsolete,/M26_HYDRATION_CANCELLED/);
  second.resolve('current');
  assert.equal(await current,'current');
  assert.equal(coordinator.cancel(),false);
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
  const leases=new WeakMap();
  const hydrationLeaseFor=(value)=>{
    if(!value||typeof value!=='object')return null;
    if(!leases.has(value))leases.set(value,Object.freeze({}));
    return leases.get(value);
  };
  const state={
    Promise,Error,session:a,hydrationLeaseFor,activeApplicationRole:null,runtime:{version:'26.0.0'},
    qaStage(){},mergeV47DailyIntoClientProgress,prepareQaClientEnvelopeForApplicationRole,currentToken(){return state.session?.token;},
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
    linkRefresh:(previous,next)=>leases.set(next,hydrationLeaseFor(previous)),
    coordinator:createHydrationCoordinator(run,{getOwner:()=>hydrationLeaseFor(state.session)})};
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

test('real hydratePass ignores stale same-owner response after cancel and permits retry',async()=>{
  const f=fixture(),oldBackend=deferred(),newBackend=deferred();
  let bootstrapCalls=0;
  f.state.transport.bootstrap=()=>{
    bootstrapCalls++;
    return bootstrapCalls===1?oldBackend.promise:newBackend.promise;
  };
  const old=f.coordinator.request({reason:'login'});
  await tick();
  assert.equal(f.coordinator.cancel(),true);
  const current=f.coordinator.request({reason:'session-retry'});
  await tick();
  assert.equal(bootstrapCalls,2);
  oldBackend.resolve(snapshot('A'));
  await assert.rejects(old,/M26_HYDRATION_CANCELLED/);
  assert.deepEqual(f.writes,[],'canceled response must not touch shared state');
  assert.equal(f.statuses.includes('error'),false,'old request cannot paint a failure over retry');
  newBackend.resolve(snapshot('A'));
  assert.equal((await current).snapshot.user.id,'A');
  assert.deepEqual(f.writes,['A']);
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

test('verified token refresh preserves owner lease and does not trigger false login recovery',async()=>{
  const f=fixture();
  const running=f.coordinator.request();
  await tick();
  const renewed={user:{id:'A'},token:'token-A-rotated'};
  f.linkRefresh(f.a,renewed);
  f.state.session=renewed;
  f.backend.A.resolve(snapshot('A'));
  assert.equal((await running).snapshot.user.id,'A');
  assert.deepEqual(f.writes,['A']);
  assert.equal(f.statuses.includes('error'),false);
});

test('production controller uses owner-aware coordinator and stale-error fence',()=>{
  assert.match(source,/createHydrationCoordinator\(hydratePass,\{getOwner:\(\)=>hydrationLeaseFor\(session\)\}\)/u);
  assert.match(source,/hydrationSessionLeases\.set\(next,hydrationLeaseFor\(ownerSession\)\)/u);
  assert.match(hydrateSource,/if\(hydrationLeaseFor\(session\)===requestedOwner\)\{/u);
  assert.match(hydrateSource,/if\(coachHistoryDemand\)store\.setHydration\('ready'\)/u);
  assert.match(hydrateSource,/else store\.setHydration\('error',error\)/u);
  assert.match(hydrateSource,/requireOwner\(\); \/\/ No stale account/u);
  assert.match(hydrateSource,/if\(coachHistoryDemand\)\{[\s\S]*assertHistoryLease\(\)/u);
  assert.match(hydrateSource,/qaStage\('rc64-hydrate-store-start'\);\s*store\.hydrate\(enriched\)/u);
  assert.match(hydrateSource,/M26_COACH_HISTORY_CONCURRENT_CHANGE/u);
});
