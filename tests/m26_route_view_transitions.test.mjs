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

test('route view transitions use the native API once when supported',()=>{
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
  const windowLike={matchMedia:()=>media(false)};
  assert.equal(routeViewTransitionsEnabled({documentLike,windowLike}),true);
  const transition=runRouteViewTransition(()=>{updates+=1;},{documentLike,windowLike});
  assert.equal(transition,token);
  assert.equal(starts,1);
  assert.equal(updates,1);
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

test('route view transitions fail soft by skipping a stalled native transition',()=>{
  let updates=0;
  let skips=0;
  let scheduled=null;
  const token={
    finished:new Promise(()=>{}),
    skipTransition(){skips+=1;},
  };
  const documentLike={
    startViewTransition(callback){
      callback();
      return token;
    },
  };
  const windowLike={
    matchMedia:()=>media(false),
    setTimeout(callback,ms){scheduled={callback,ms};return 7;},
    clearTimeout(){},
  };
  const transition=runRouteViewTransition(
    ()=>{updates+=1;},
    {documentLike,windowLike,maxDurationMs:240},
  );
  assert.equal(transition,token);
  assert.equal(updates,1);
  assert.equal(scheduled.ms,240);
  scheduled.callback();
  assert.equal(skips,1);
});

