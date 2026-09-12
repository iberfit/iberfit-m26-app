import assert from 'node:assert/strict';
import test from 'node:test';

import {
  routeViewTransitionsEnabled,
  runRouteViewTransition,
} from '../src/m26/experience/route-view-transitions.js';

function media(matches=false){return {matches};}

test('route view transitions fall back synchronously when unsupported',()=>{
  let updates=0;
  const documentLike={};
  const windowLike={matchMedia:()=>media(false)};
  const transition=runRouteViewTransition(()=>{updates+=1;},{documentLike,windowLike});
  assert.equal(transition,null);
  assert.equal(updates,1);
});

test('route view transitions respect prefers-reduced-motion',()=>{
  let updates=0;
  let starts=0;
  const documentLike={startViewTransition(){starts+=1;}};
  const windowLike={matchMedia:()=>media(true)};
  assert.equal(routeViewTransitionsEnabled({documentLike,windowLike}),false);
  runRouteViewTransition(()=>{updates+=1;},{documentLike,windowLike});
  assert.equal(starts,0);
  assert.equal(updates,1);
});

test('route view transitions use the native API once on non-touch pointer devices',()=>{
  let updates=0;
  let starts=0;
  const token={finished:Promise.resolve()};
  const documentLike={
    startViewTransition(callback){
      starts+=1;
      callback();
      return token;
    },
  };
  const windowLike={
    navigator:{maxTouchPoints:0},
    matchMedia:(query)=>media(query==='(pointer: coarse)'?false:false),
  };
  assert.equal(routeViewTransitionsEnabled({documentLike,windowLike}),true);
  const transition=runRouteViewTransition(()=>{updates+=1;},{documentLike,windowLike});
  assert.equal(transition,token);
  assert.equal(starts,1);
  assert.equal(updates,1);
});

test('route view transitions fail open synchronously on coarse or touch-capable devices',()=>{
  const documentLike={startViewTransition(){throw new Error('must not be called on touch');}};

  for(const windowLike of [
    {navigator:{maxTouchPoints:1},matchMedia:()=>media(false)},
    {navigator:{maxTouchPoints:0},matchMedia:(query)=>media(query==='(pointer: coarse)')},
  ]){
    let updates=0;
    assert.equal(routeViewTransitionsEnabled({documentLike,windowLike}),false);
    assert.equal(runRouteViewTransition(()=>{updates+=1;},{documentLike,windowLike}),null);
    assert.equal(updates,1);
  }
});

test('route view transitions fail open without duplicating an invoked update',()=>{
  let updates=0;
  const windowLike={matchMedia:()=>media(false)};
  const beforeCallback={startViewTransition(){throw new Error('unsupported runtime');}};
  runRouteViewTransition(()=>{updates+=1;},{documentLike:beforeCallback,windowLike});
  assert.equal(updates,1);

  updates=0;
  const afterCallback={
    startViewTransition(callback){
      callback();
      throw new Error('late browser failure');
    },
  };
  runRouteViewTransition(()=>{updates+=1;},{documentLike:afterCallback,windowLike});
  assert.equal(updates,1);
});
