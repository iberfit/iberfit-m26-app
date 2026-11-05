import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngagementActionFlightGuard,engagementActionFlightKey,
  createEngagementController} from '../src/m26/engagement/engagement-controller.js';

test('Life360 coalesces two synchronous requests for the same canonical intent',async()=>{
  const guard=createEngagementActionFlightGuard();
  let release,calls=0;
  const key=engagementActionFlightKey({ownerId:'coach-A',role:'coach',
    clientId:'client-A',action:'submit-checkin'});
  const first=guard.run(key,()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  const second=guard.run(key,()=>{calls++;return 'wrong';});
  assert.strictEqual(first,second);
  await Promise.resolve();
  assert.equal(calls,1);
  assert.equal(guard.has(key),true);
  release({ok:true});
  assert.deepEqual(await first,{ok:true});
  await second;
  assert.equal(guard.has(key),false);
});

test('Life360 keeps owner, client and habit intent strictly separated',async()=>{
  const guard=createEngagementActionFlightGuard();
  const keys=[
    {ownerId:'coach-A',clientId:'client-A',action:'log-habit',targetId:'h1'},
    {ownerId:'coach-A',clientId:'client-A',action:'log-habit',targetId:'h2'},
    {ownerId:'coach-A',clientId:'client-B',action:'log-habit',targetId:'h1'},
    {ownerId:'coach-B',clientId:'client-A',action:'log-habit',targetId:'h1'},
  ].map(engagementActionFlightKey);
  assert.equal(new Set(keys).size,4);
  let calls=0;
  await Promise.all(keys.map(key=>guard.run(key,async()=>{calls++;return true;})));
  assert.equal(calls,4);
});

test('Life360 releases an in-flight guard on rejection for genuine retry',async()=>{
  const guard=createEngagementActionFlightGuard(),key='one-action';
  await assert.rejects(guard.run(key,()=>Promise.reject(new Error('offline'))),/offline/);
  assert.equal(guard.has(key),false);
  assert.equal(await guard.run(key,()=>Promise.resolve('recovered')),'recovered');
});

test('Life360 controller double-submit never issues two check-in commands',async()=>{
  const initialFormData=globalThis.FormData;
  const callbacks=new Map();
  const status={textContent:'',dataset:{}};
  const form={
    getAttribute:key=>key==='data-engagement-form'?'checkin':null,
    checkValidity:()=>true,
    querySelector:()=>null,
    dataset:{},
  };
  const button={
    disabled:false,attributes:new Map(),
    matches:()=>true,
    setAttribute(key,value){this.attributes.set(key,value);},
    removeAttribute(key){this.attributes.delete(key);},
    closest:()=>form,
  };
  const root={
    addEventListener(type,fn){callbacks.set(type,fn);},
    removeEventListener(type){callbacks.delete(type);},
    querySelector(selector){
      if(selector==='[data-engagement-form="checkin"]')return form;
      if(selector==='[data-engagement-status="checkin"]')return status;
      return null;
    },
    querySelectorAll:()=>[],
  };
  const state={identity:{id:'owner1',role:'client',clientId:'client1'}};
  const store={getState:()=>state};
  let commit,calls=0,saves=0,removes=0;
  const drafts={
    async save(){saves++;return true;},
    async remove(){removes++;},
    async load(){return undefined;},
  };
  const service={registerCheckin(){calls++;return new Promise(resolve=>{commit=resolve;});}};
  const event={target:{closest:()=>form},submitter:button,preventDefault(){}};
  globalThis.FormData=class {entries(){return [
    ['energy','6'],['sleep','7'],['stress','3'],['pain','1'],
  ][Symbol.iterator]();}};
  const ctrl=createEngagementController({root,store,draftRepository:drafts,service});
  try{
    ctrl.mount();
    const handler=callbacks.get('submit');
    const first=handler(event),second=handler(event);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,1);
    assert.equal(saves,1);
    assert.equal(button.disabled,true);
    commit({ok:true});
    await Promise.all([first,second]);
    assert.equal(removes,1);
    assert.equal(button.disabled,false);
    assert.equal(status.dataset.status,'success');
  }finally{
    ctrl.destroy();
    globalThis.FormData=initialFormData;
  }
});
