import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunicationTransport} from '../src/m26/communication/transport.js';
import {createAdminTransport} from '../src/m26/admin/transport.js';
import {createRc39Transport} from '../src/m26/rc39/transport.js';

const runtime=Object.freeze({
  url:'https://pjhmrhejsoofmouedavw.supabase.co',
  publishableKey:'publishable-test-key',
  version:'26.0.0-test',
  timeoutMs:1_000,
});

function stalledFetch(_url,{signal}={}){
  assert.ok(signal,'all extension requests must be abortable');
  return new Promise((resolve,reject)=>{
    if(signal.aborted){
      const error=new Error('aborted');
      error.name='AbortError';
      reject(error);
      return;
    }
    signal.addEventListener('abort',()=>{
      const error=new Error('aborted');
      error.name='AbortError';
      reject(error);
    },{once:true});
    void resolve;
  });
}

async function expectBoundedTimeout(promise,started){
  await assert.rejects(promise,/M26_TIMEOUT/u);
  const elapsed=Date.now()-started;
  assert.ok(elapsed>=900,`timeout fired too early: ${elapsed}ms`);
  assert.ok(elapsed<2_500,`timeout was not bounded: ${elapsed}ms`);
}

test('Coach communication bootstrap cannot remain pending indefinitely',async()=>{
  const transport=createCommunicationTransport({runtime,fetchImpl:stalledFetch});
  const started=Date.now();
  await expectBoundedTimeout(
    transport.bootstrapOptional('coach-token',{application:'coach'}),
    started,
  );
});

test('Admin extension bootstrap cannot remain pending indefinitely',async()=>{
  const transport=createAdminTransport({runtime,fetchImpl:stalledFetch});
  const started=Date.now();
  await expectBoundedTimeout(
    transport.applicationContextOptional('admin-token'),
    started,
  );
});

test('Coach role and appointment extensions cannot remain pending indefinitely',async()=>{
  const transport=createRc39Transport({runtime,fetchImpl:stalledFetch});
  const started=Date.now();
  await expectBoundedTimeout(
    transport.extensions('coach-token'),
    started,
  );
});
