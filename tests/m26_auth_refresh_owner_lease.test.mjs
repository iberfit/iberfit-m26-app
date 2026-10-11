import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
const start=source.indexOf('  async function refreshSessionIfNeeded(){');
const end=source.indexOf('  async function fetchCatalog(',start);
assert.ok(start>=0&&end>start,'Execute the real refresh implementation');
const body=source.slice(start,end);
const makeSession=(id,token)=>({
  token:token+'-access',refreshToken:token+'-refresh',user:{id},expiresAt:1,
});
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function fixture(){
  const calls=[],saved=[],requests=new Map();
  const state={
    session:null,
    refreshInFlight:null,
    refreshInFlightOwnerSession:null,
    nextExpiry:()=>true,
    transport:{refresh(token){
      calls.push(token);
      const deferredResponse=deferred();
      requests.set(token,deferredResponse);
      return deferredResponse.promise;
    }},
    vault:{save(session){saved.push(session);}},
    Promise,Error,
  };
  const refresh=runInNewContext(body+'\nrefreshSessionIfNeeded',state);
  return {refresh,state,calls,saved,requests};
}
const drain=async()=>{await Promise.resolve();await Promise.resolve();};

test('logout while access refresh is pending never restores the old account',async()=>{
  const x=fixture(),a=makeSession('A','a');
  x.state.session=a;
  const old=x.refresh();
  await drain();
  x.state.session=null;
  x.requests.get('a-refresh').resolve(makeSession('A','refreshed-a'));
  await assert.rejects(old,/M26_REFRESH_STALE_SESSION/);
  assert.equal(x.state.session,null);
  assert.deepEqual(x.saved,[]);
  assert.equal(x.state.refreshInFlight,null);
});

test('new account starts a separate refresh and stale A cannot clear B lease',async()=>{
  const x=fixture(),a=makeSession('A','a'),b=makeSession('B','b');
  x.state.session=a;
  const old=x.refresh();
  await drain();
  x.state.session=b;
  const newer=x.refresh();
  await drain();
  assert.deepEqual(x.calls,['a-refresh','b-refresh']);
  x.requests.get('a-refresh').resolve(makeSession('A','old-a'));
  await assert.rejects(old,/M26_REFRESH_STALE_SESSION/);
  assert.equal(x.state.refreshInFlightOwnerSession,b);
  assert.equal(x.state.session,b);
  x.requests.get('b-refresh').resolve(makeSession('B','new-b'));
  const updated=await newer;
  assert.equal(updated.user.id,'B');
  assert.equal(x.state.session,updated);
  assert.deepEqual(x.saved,[updated]);
  assert.equal(x.state.refreshInFlight,null);
});

test('same session refresh storms coalesce and save a single result',async()=>{
  const x=fixture(),a=makeSession('A','a');
  x.state.session=a;
  const first=x.refresh(),second=x.refresh();
  await drain();
  assert.deepEqual(x.calls,['a-refresh']);
  const updated=makeSession('A','updated-a');
  x.requests.get('a-refresh').resolve(updated);
  assert.equal(await first,updated);
  assert.equal(await second,updated);
  assert.deepEqual(x.saved,[updated]);
});

test('relogging the same user retires the old token refresh generation',async()=>{
  const x=fixture(),a=makeSession('A','old');
  x.state.session=a;
  const old=x.refresh();
  await drain();
  const freshLogin=makeSession('A','new-login');
  x.state.session=freshLogin;
  x.requests.get('old-refresh').resolve(makeSession('A','old-result'));
  await assert.rejects(old,/M26_REFRESH_STALE_SESSION/);
  assert.equal(x.state.session,freshLogin);
  assert.deepEqual(x.saved,[]);
});

test('refresh returning a different identity fails closed without saving',async()=>{
  const x=fixture(),a=makeSession('A','a');
  x.state.session=a;
  const old=x.refresh();
  await drain();
  x.requests.get('a-refresh').resolve(makeSession('B','wrong'));
  await assert.rejects(old,/M26_REFRESH_IDENTITY_MISMATCH/);
  assert.equal(x.state.session,a);
  assert.deepEqual(x.saved,[]);
});
