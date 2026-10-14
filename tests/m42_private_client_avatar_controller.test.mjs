import test from 'node:test';
import assert from 'node:assert/strict';
import {Blob} from 'node:buffer';
import {createClientAvatarController,profileAvatarPath} from '../src/m26/profile/client-avatar.js';

const clientId='10000000-0000-4000-8000-000000000271';
function fixture({role='client',status=200}={}){
  const listeners=new Map(),calls=[],revoked=[];
  let img=null;
  const element={
    ownerDocument:{createElement(){return {setAttribute(){},remove(){img=null;},src:'',classList:{add(){}}};}},
    getAttribute(k){return k==='data-iberfit-avatar-client'?clientId:null;},
    append(child){img=child;},
    querySelector(){return img;},
    classList:{add(){},remove(){}},
  };
  const root={
    addEventListener(name,fn){listeners.set(name,fn);},
    removeEventListener(name){listeners.delete(name);},
    querySelector(){return null;},
    querySelectorAll(sel){return sel==='[data-iberfit-avatar-client]'?[element]:[];},
  };
  const scope={URL:{createObjectURL(){return 'blob:private-photo';},revokeObjectURL(u){revoked.push(u);}},queueMicrotask,confirm:()=>true,navigator:{onLine:true}};
  const runtime={url:'https://test-project.supabase.co',publishableKey:'public-test-key'};
  const fetchImpl=async(url,opt)=>{
    calls.push({url,method:opt.method,headers:opt.headers,body:opt.body});
    return {status,ok:status>=200&&status<300,blob:async()=>new Blob(['valid-image'],{type:'image/webp'})};
  };
  const getIdentity=()=>({role,id:'authenticated-user',clientId});
  const controller=createClientAvatarController({root,runtime,getToken:async()=> 'private-user-token',getIdentity,fetchImpl,scope});
  return {controller,root,element,listeners,calls,revoked,get image(){return img;}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,12));
test('M42 photo is retrieved with owner-scoped token but never embedded as public Supabase URL',async()=>{
  const c=fixture();c.controller.mount();await settle();
  assert.equal(c.calls.length,1);
  assert.equal(c.calls[0].method,'GET');
  assert.equal(c.calls[0].headers.Authorization,'Bearer private-user-token');
  const requested=new URL(c.calls[0].url);
  assert.equal(requested.pathname,'/storage/v1/object/authenticated/iberfit-profile-avatars/'+profileAvatarPath(clientId));
  assert.ok(requested.searchParams.get('cacheNonce'));
  assert.equal(c.image.src,'blob:private-photo');
  c.controller.destroy();
  assert.deepEqual(c.revoked,['blob:private-photo']);
});
test('M42 denied private photo leaves initial visible and never retries with public fallback',async()=>{
  const c=fixture({status:403});c.controller.mount();await settle();
  assert.equal(c.calls.length,1);
  assert.equal(c.image,null);
  c.controller.destroy();
});
test('M42 Coach can view only through server RLS and cannot upload the Client photo',async()=>{
  const c=fixture({role:'coach'});c.controller.mount();await settle();
  assert.equal(c.calls.length,1);
  let input={files:[{type:'image/png',size:200}],value:'file',closest:()=>input};
  c.listeners.get('change')({target:input});await settle();
  assert.equal(c.calls.length,1,'Coach has no client photo write path');
  c.controller.destroy();
});
