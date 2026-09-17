import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workerUrl=new URL('../public/m26/iberfit-sw.js',import.meta.url);
const workerSource=readFileSync(workerUrl,'utf8');

function requestKey(request){
  return typeof request==='string'?request:request.url;
}

function createWorkerHarness({fetchImpl,globalFallback=null}={}){
  const listeners=new Map();
  const imported=[];
  const cacheEntries=new Map();
  const cache={
    async match(request){
      return cacheEntries.get(requestKey(request))||null;
    },
    async put(request,response){
      cacheEntries.set(requestKey(request),response);
    },
  };
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
    caches:{
      async open(){return cache;},
      async match(){return globalFallback;},
    },
    fetch:fetchImpl||globalThis.fetch,
    importScripts(path){imported.push(path);},
    self,
  };

  vm.runInNewContext(workerSource,context,{filename:'public/m26/iberfit-sw.js'});
  return {listeners,imported,cacheEntries};
}

async function dispatchFreshnessFetch(harness,url){
  const handler=harness.listeners.get('fetch')?.[0];
  assert.equal(typeof handler,'function','canonical worker must register its freshness handler first');
  let stopped=false;
  let responsePromise=null;
  const request=new Request(url);
  handler({
    request,
    stopImmediatePropagation(){stopped=true;},
    respondWith(value){responsePromise=Promise.resolve(value);},
  });
  return {request,stopped,responsePromise};
}

test('canonical worker owns mutable runtime requests before importing the legacy worker',()=>{
  const listenerIndex=workerSource.indexOf("self.addEventListener('fetch'");
  const importIndex=workerSource.indexOf("importScripts('/m26/sw.js')");
  assert.ok(listenerIndex>=0,'freshness fetch listener must exist');
  assert.ok(importIndex>listenerIndex,'freshness listener must be registered before the legacy worker');
});

test('mutable M26 runtime is network-first and stores the fresh response',async()=>{
  let fetchOptions=null;
  const harness=createWorkerHarness({
    fetchImpl:async(_request,options)=>{
      fetchOptions=options;
      return new Response('fresh-runtime',{status:200,headers:{'content-type':'text/javascript'}});
    },
  });
  const result=await dispatchFreshnessFetch(
    harness,
    'https://app.iberfit.cl/src/m26/shell/shell-controller.js',
  );
  assert.equal(result.stopped,true,'legacy cache-first handler must not receive mutable runtime requests');
  assert.ok(result.responsePromise,'mutable runtime request must be intercepted');
  const response=await result.responsePromise;
  assert.equal(await response.text(),'fresh-runtime');
  assert.equal(fetchOptions?.cache,'reload');
  assert.equal(fetchOptions?.credentials,'same-origin');
  assert.equal(fetchOptions?.redirect,'error');
  const stored=harness.cacheEntries.get(result.request.url);
  assert.ok(stored,'fresh runtime must be cached for offline fallback');
  assert.equal(await stored.text(),'fresh-runtime');
  assert.deepEqual(harness.imported,['/m26/sw.js']);
});

test('mutable runtime falls back to cached code when the network is unavailable',async()=>{
  const harness=createWorkerHarness({
    fetchImpl:async()=>{throw new Error('offline');},
    globalFallback:new Response('cached-runtime',{status:200}),
  });
  const result=await dispatchFreshnessFetch(
    harness,
    'https://app.iberfit.cl/m26/app.js',
  );
  assert.equal(result.stopped,true);
  const response=await result.responsePromise;
  assert.equal(await response.text(),'cached-runtime');
});

test('static assets remain outside the mutable runtime freshness path',async()=>{
  const harness=createWorkerHarness({
    fetchImpl:async()=>new Response('unexpected',{status:200}),
  });
  const result=await dispatchFreshnessFetch(
    harness,
    'https://app.iberfit.cl/m26/icons/icon-192.png',
  );
  assert.equal(result.stopped,false);
  assert.equal(result.responsePromise,null);
});
