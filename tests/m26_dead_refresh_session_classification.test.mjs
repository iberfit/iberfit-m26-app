import test from 'node:test';
import assert from 'node:assert/strict';

import {sessionFailureRequiresFreshLogin} from '../src/m26/app/application.js';
import {createSessionForegroundRefreshCoordinator} from '../src/m26/app/session-foreground-refresh.js';

function authError(code,{status=400,message='Auth refresh failed'}={}){
  return Object.assign(new Error(message),{
    status,
    body:{code},
  });
}

test('definitive Supabase refresh/session errors require a fresh login',()=>{
  for(const code of [
    'refresh_token_not_found',
    'refresh_token_already_used',
    'session_not_found',
    'session_expired',
  ]){
    assert.equal(
      sessionFailureRequiresFreshLogin(authError(code)),
      true,
      code,
    );
  }

  assert.equal(
    sessionFailureRequiresFreshLogin(authError('REFRESH_TOKEN_NOT_FOUND')),
    true,
  );
  assert.equal(
    sessionFailureRequiresFreshLogin({status:401,body:{code:'anything'}}),
    true,
  );
});

test('generic 400 and transient network/timeout failures remain recoverable',()=>{
  assert.equal(
    sessionFailureRequiresFreshLogin(authError('bad_json',{status:400})),
    false,
  );
  assert.equal(
    sessionFailureRequiresFreshLogin(Object.assign(new Error('M26_TIMEOUT'),{status:0})),
    false,
  );
  assert.equal(
    sessionFailureRequiresFreshLogin(new TypeError('Failed to fetch')),
    false,
  );
  assert.equal(
    sessionFailureRequiresFreshLogin(Object.assign(new Error('Backend unavailable'),{status:503})),
    false,
  );
});

test('existing IBERFIT terminal auth invariants remain terminal',()=>{
  for(const code of [
    'M26_SESSION_EXPIRED',
    'M26_AUTH_REQUIRED',
    'M26_REFRESH_IDENTITY_MISMATCH',
    'M26_MFA_IDENTITY_MISMATCH',
    'M26_AUTH_USER_INVALID_RESPONSE',
    'M26_QA_ACCOUNT_REQUIRED',
  ]){
    assert.equal(sessionFailureRequiresFreshLogin(new Error(code)),true,code);
  }
});

test('foreground lifecycle routes a dead refresh token to permanent-session handling',async()=>{
  const listeners=new Map();
  const scope={
    addEventListener(type,handler){listeners.set(type,handler);},
    removeEventListener(type){listeners.delete(type);},
  };
  const documentLike={
    visibilityState:'visible',
    addEventListener(type,handler){listeners.set('document:'+type,handler);},
    removeEventListener(type){listeners.delete('document:'+type);},
  };
  const permanent=[];
  const transient=[];
  const coordinator=createSessionForegroundRefreshCoordinator({
    scope,
    documentLike,
    getSession:()=>({token:'access-token'}),
    refreshSession:async()=>{
      throw authError('refresh_token_not_found');
    },
    isPermanentFailure:sessionFailureRequiresFreshLogin,
    onPermanentFailure:(error,reason)=>permanent.push({code:error.body.code,reason}),
    onTransientFailure:(error,reason)=>transient.push({code:error.body?.code||error.message,reason}),
  });

  assert.equal(await coordinator.run('pageshow'),false);
  assert.deepEqual(permanent,[{code:'refresh_token_not_found',reason:'pageshow'}]);
  assert.deepEqual(transient,[]);
  coordinator.destroy();
});

test('foreground lifecycle preserves workspace on an ordinary refresh 400',async()=>{
  const scope={addEventListener(){},removeEventListener(){}};
  const documentLike={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
  const permanent=[];
  const transient=[];
  const coordinator=createSessionForegroundRefreshCoordinator({
    scope,
    documentLike,
    getSession:()=>({token:'access-token'}),
    refreshSession:async()=>{
      throw authError('bad_json',{status:400});
    },
    isPermanentFailure:sessionFailureRequiresFreshLogin,
    onPermanentFailure:(error,reason)=>permanent.push({error,reason}),
    onTransientFailure:(error,reason)=>transient.push({code:error.body.code,reason}),
  });

  assert.equal(await coordinator.run('online'),false);
  assert.deepEqual(permanent,[]);
  assert.deepEqual(transient,[{code:'bad_json',reason:'online'}]);
  coordinator.destroy();
});
