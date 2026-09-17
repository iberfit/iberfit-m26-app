import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workerUrl=new URL('../public/m26/iberfit-sw.js',import.meta.url);
const workerSource=readFileSync(workerUrl,'utf8');

function createWorkerHarness({networkFirstImpl}={}){
  const listeners=new Map();
  const imported=[];
  const networkFirstCalls=[];
  const self={
    location:{origin:'https://app.iberfit.cl'},
    addEventListener(type,handler){
      const bucket=listeners.get(type)||[];
      bucket.push(handler);
      listeners.set(type,bucket);
    },
  };
  const context={
    URL,
    Request,
    Response,
    caches:{open:async()=>({match:async()=>null})},
    fetchWithDeadline:async()=>new Response('navigation',{status:200}),
    NETWORK_TIMEOUT_MS:6000,
    SHELL:'iberfit-test-shell',
    networkFirst(request,options){
      networkFirstCalls.push({request,options});
      return (networkFirstImpl||(()=>new Response('fresh-runtime',{status:200})))(request,options);
    },
    importScripts(path){imported.push(path);},
    self,
  };

  vm.runInNewContext(workerSource,context,{filename:'public/m26/iberfit-sw.js'});
  return {listeners,imported,networkFirstCalls};
}

async function dispatchFreshnessFetch(harness,url){
  const handler=harness.listeners.get('fetch')?.[0];
  assert.equal(typeof handler,'function','canonical worker must register its freshness handler first');
  let stopped=false;
  let responsePromise=null;
  const request=new Request(url);
  const event={
    request,
    stopImmediatePropagation(){stopped=true;},
    respondWith(value){responsePromise=Promise.resolve(value);},
  };
  handler(event);
  return {event,request,stopped,responsePromise};
}

test('canonical worker registers source-runtime freshness before the legacy worker',()=>{
  const listenerIndex=workerSource.indexOf("self.addEventListener('fetch'");
  const importIndex=workerSource.indexOf("importScripts('/m26/sw.js')");
  assert.ok(listenerIndex>=0,'freshness fetch listener must exist');
  assert.ok(importIndex>listenerIndex,'freshness listener must be registered before the legacy worker');
});

test('source runtime bypasses release cache-first and delegates to networkFirst',async()=>{
  const harness=createWorkerHarness();
  const result=await dispatchFreshnessFetch(
    harness,
    'https://app.iberfit.cl/src/m26/shell/shell-controller.js',
  );
  assert.equal(result.stopped,true,'legacy cache-first handler must not receive source runtime requests');
  assert.ok(result.responsePromise,'source runtime request must be intercepted');
  assert.equal(await (await result.responsePromise).text(),'fresh-runtime');
  assert.equal(harness.networkFirstCalls.length,1);
  assert.equal(harness.networkFirstCalls[0].request.url,result.request.url);
  assert.equal(harness.networkFirstCalls[0].options.event,result.event);
  assert.deepEqual(harness.imported,['/m26/sw.js']);
});

test('non-source M26 assets stay on the established service-worker strategy',async()=>{
  const harness=createWorkerHarness();
  const result=await dispatchFreshnessFetch(
    harness,
    'https://app.iberfit.cl/m26/app.js',
  );
  assert.equal(result.stopped,false);
  assert.equal(result.responsePromise,null);
  assert.equal(harness.networkFirstCalls.length,0);
});

test('cross-origin source-like requests are not intercepted',async()=>{
  const harness=createWorkerHarness();
  const result=await dispatchFreshnessFetch(
    harness,
    'https://example.test/src/m26/shell/shell-controller.js',
  );
  assert.equal(result.stopped,false);
  assert.equal(result.responsePromise,null);
  assert.equal(harness.networkFirstCalls.length,0);
});
