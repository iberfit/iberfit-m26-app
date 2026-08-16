import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeBootstrapRole,
  validateQaIdentity,
} from '../src/m26/qa/authenticated-canary.js';

function session(email='iberfit.cl+qa.m26@gmail.com'){
  return {
    token:'qa-token',
    user:{
      id:'11111111-1111-4111-8111-111111111111',
      email,
    },
  };
}

test('RC59.0C3 QA role usa bootstrap.user.role como fuente canonica actual',()=>{
  assert.equal(
    normalizeBootstrapRole({user:{role:'client'}}),
    'cliente'
  );
});

test('RC59.0C3 QA identity acepta Cliente cuando role vive en bootstrap.user',()=>{
  const result=validateQaIdentity({
    session:session(),
    bootstrap:{user:{role:'cliente'}},
    expectedRole:'cliente',
  });

  assert.equal(result.ok,true);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.role,'cliente');
});

test('RC59.0C3 bootstrap.user.role prevalece sobre shape legacy contradictorio',()=>{
  assert.equal(
    normalizeBootstrapRole({
      role:'coach',
      profile:{role:'admin'},
      user:{role:'cliente'},
    }),
    'cliente'
  );
});

test('RC59.0C3 QA conserva fallback de roles bootstrap historicos',()=>{
  assert.equal(normalizeBootstrapRole({role:'coach'}),'coach');
  assert.equal(
    normalizeBootstrapRole({profile:{role:'admin'}}),
    'admin'
  );
  assert.equal(
    normalizeBootstrapRole({user_profile:{role:'client'}}),
    'cliente'
  );
  assert.equal(
    normalizeBootstrapRole({data:{user:{role:'client'}}}),
    'cliente'
  );
});