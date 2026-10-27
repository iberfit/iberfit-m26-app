import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHydrationCoordinator} from '../src/m26/app/hydration-coordinator.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
const load=(begin,end,context,name)=>{
  const a=app.indexOf(begin),b=app.indexOf(end,a);
  assert.ok(a>=0&&b>a,'actual application function: '+name);
  return runInNewContext(app.slice(a,b)+'\n'+name,context);
};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('B35 recoverable timeout retires old hydration lease but preserves authenticated session and credentials',()=>{
  const session={user:{id:'same-coach'},token:'synthetic-not-real',refreshToken:'synthetic-only'};
  const leases=new WeakMap(),before=Object.freeze({});
  leases.set(session,before);
  const stages=[];
  const sandbox={
    session,hydrationSessionLeases:leases,loginBusy:true,mfaState:{kind:'ready'},
    authMode:'post-mfa-loading',sessionRetryAvailable:false,
    invalidateAuthAttempt:()=>stages.push('invalidate'),
    destroyControllers:()=>stages.push('destroy'),
    store:{reset:()=>stages.push('reset')},
    reportSoftDiagnostic:()=>stages.push('diagnostic'),
    authMessage:()=>stages.push('recovery-ui'),
    Error,Object,
  };
  const recover=load('  function surfaceRetriableSessionFailure(', '  function discardSessionAfterFailure(',sandbox,'surfaceRetriableSessionFailure');
  recover(new Error('M26_POST_MFA_SETUP_TIMEOUT'),'post-mfa-setup');
  assert.notStrictEqual(leases.get(session),before);
  assert.equal(session.token,'synthetic-not-real');
  assert.strictEqual(sandbox.session,session);
  assert.equal(sandbox.authMode,'recoverable-session');
  assert.equal(sandbox.sessionRetryAvailable,true);
  assert.deepEqual(stages,['invalidate','destroy','reset','diagnostic','recovery-ui']);
});

test('B35 late full-snapshot backend response after recovery cannot hydrate canonical store or overwrite a newer login',async()=>{
  const session={user:{id:'coach'},token:'synthetic-token'};
  const leases=new WeakMap();
  const hydrationLeaseFor=value=>{
    if(!leases.has(value))leases.set(value,Object.freeze({}));
    return leases.get(value);
  };
  const pending=deferred(),writes=[],status=[];
  const sandbox={
    session,hydrationLeaseFor,activeApplicationRole:null,
    runtime:{version:'26.0.0',qaOnly:false,environment:'QA'},
    Promise,Error,Object,Set,
    qaStage:()=>{},currentToken:()=>session.token,
    refreshSessionIfNeeded:async()=>session,
    store:{setHydration:v=>status.push(v),hydrate:v=>writes.push(v)},
    transport:{
      bootstrap:()=>pending.promise,
      commandRegistry:async()=>({}),
      backendBootstrap:async()=>({ready:true}),
      wearableBootstrap:async()=>({ready:true,connections:[],dailySummaries:[],consents:[]}),
    },
    rc39Transport:null,adminTransport:null,communicationTransport:null,
    optionalAuthBootstrap:fn=>fn(),
    validatedRuntimeRegistry:()=>({base:{ok:true,missing:[]}}),
    normalizeApplicationContextExtension:()=>({available:false,roles:[],organizationId:null,membershipStatus:null,assignmentScopeEnforced:false}),
    normalizeAuthorizedRoles:({authorizedRoles})=>authorizedRoles,
    canSwitchApplication:()=>false,
    readPreferredApplicationRole:()=>null,
    resolveActiveRole:(roles,preferred)=>preferred||roles[0]||null,
    filterSnapshotForAssignmentScope:x=>x,
    mergeRc39ChangeRequests:x=>x,
    mergeV47DailyIntoClientProgress:({existing})=>existing,
    writePreferredApplicationRole:()=>{},
  };
  const hydratePass=load('  async function hydratePass(', '  const hydrationCoordinator=',sandbox,'hydratePass');
  const coordinator=createHydrationCoordinator(hydratePass,{getOwner:()=>hydrationLeaseFor(session)});
  const attempt=coordinator.request({reason:'login'});
  await tick();
  // The real recoverable error path rotates this same lease.
  const before=hydrationLeaseFor(session);
  leases.set(session,Object.freeze({}));
  assert.notStrictEqual(hydrationLeaseFor(session),before);
  pending.resolve({user:{id:'coach',role:'coach'},environment:{},remoteRevisions:{},data:{clients:[],appointments:[]},canary:{}});
  await assert.rejects(attempt,/M26_HYDRATION_STALE_SESSION/);
  assert.deepEqual(writes,[],'no late store.hydrate after recovery');
  assert.equal(status.includes('error'),false,'old owner cannot paint error over the recovery UI');
});

test('B35 late setup may not mount after deferred paint or catalog resolves post-timeout',()=>{
  const start=app.indexOf('  async function setupAuthenticated(){');
  const end=app.indexOf('  function guardSessionNavigation(',start);
  assert.ok(start>=0&&end>start);
  const body=app.slice(start,end);
  assert.match(body,/const ensureCurrentSetup=\(\)=>\{/);
  assert.match(body,/await hydrate\(\{reason:'login'\}\);\s*ensureCurrentSetup\(\);/);
  assert.match(body,/await yieldWorkspacePaint\(\);\s*ensureCurrentSetup\(\);/);
  assert.match(body,/const catalogSetup=await catalogSetupPromise;\s*ensureCurrentSetup\(\);/);
  assert.match(body,/root\.addEventListener\('click',guardSessionNavigation,true\);\s*ensureCurrentSetup\(\);/);
  assert.doesNotMatch(body,/M26_POST_MFA_SETUP_TIMEOUT_MS\s*=\s*[2-9][0-9]_/);
});

test('B35 actual recovery path is used for confirmed MFA timeout without clearing valid vault',()=>{
  assert.match(app,/surfaceRetriableSessionFailure\(error,'post-mfa-setup'\)/);
  assert.match(app,/if\(session&&typeof session==='object'\)hydrationSessionLeases\.set\(session,Object\.freeze\(\{\}\)\)/);
  const start=app.indexOf('  function surfaceRetriableSessionFailure(');
  const end=app.indexOf('  function discardSessionAfterFailure(',start);
  const body=app.slice(start,end);
  assert.doesNotMatch(body,/vault\.clear|transport\.logout|session=null|setTimeout/);
});

test('B35 recovery expiry message is localized without changing the canonical Spanish meaning',()=>{
  const es='Tu sesión ha caducado. Vuelve a entrar para continuar.';
  assert.equal(iberfitSurfaceTranslate(es,{language:'en'}),'Your session has expired. Sign in again to continue.');
  assert.equal(iberfitSurfaceTranslate(es,{language:'fr'}),'Votre session a expiré. Reconnectez-vous pour continuer.');
  assert.equal(iberfitSurfaceTranslate(es,{language:'pt'}),'A sua sessão expirou. Inicie sessão novamente para continuar.');
  assert.equal(iberfitSurfaceTranslate(es,{language:'es'}),es);
});
