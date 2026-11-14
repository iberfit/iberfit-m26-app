import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPasswordRecoveryHash,parsePasswordRecoveryHash} from '../src/m26/app/password-recovery.js';
import {renderAccessUi} from '../src/m26/app/access-ui.js';
import {createM26Application} from '../src/m26/app/application.js';

const QA_RUNTIME={
  enabled:true,
  projectRef:'gjztkdwfmunnzhtvxrsu',
  url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',
  publishableKey:'synthetic-test-publishable-key',
  qaOnly:true,
};
const TOKEN='synthetic-invite-access-token';
const SYNTHETIC_CREDENTIAL='ClaveSintetica2026!';
const nowSeconds=2_000_000_000;
const inviteHash=`#access_token=${TOKEN}&refresh_token=do-not-store-me&expires_in=3600&type=invite`;

function rootFixture(){
  let html='';
  const listeners=new Map();
  return {
    set innerHTML(value){html=String(value);},
    get innerHTML(){return html;},
    addEventListener(name,callback){listeners.set(name,callback);},
    removeEventListener(name,callback){if(listeners.get(name)===callback)listeners.delete(name);},
    listener(name){return listeners.get(name);},
  };
}

function fetchResponse(body,status=200){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get:(name)=>name==='content-type'?'application/json':null},
    json:async()=>body,
    text:async()=>JSON.stringify(body),
  };
}

async function withFormData(run){
  const original=globalThis.FormData;
  globalThis.FormData=class {
    constructor(form){this.form=form;}
    get(name){return this.form.fields[name]??null;}
  };
  try{return await run();}
  finally{globalThis.FormData=original;}
}

function submitForm(formType,fields){
  return {
    target:{closest:()=>({fields,getAttribute:(name)=>name==='data-auth-form'?formType:null})},
    preventDefault(){},
  };
}

test('a genuine Supabase invite is accepted as one bounded first-access password flow',()=>{
  const result=inspectPasswordRecoveryHash(inviteHash,{nowSeconds});
  assert.deepEqual(result,{
    status:'valid',
    session:{accessToken:TOKEN,expiresAt:nowSeconds+3600,type:'invite'},
  });
  assert.equal('refreshToken' in result.session,false);
  assert.equal('user' in result.session,false);
  assert.equal('email' in result.session,false);
  assert.deepEqual(
    inspectPasswordRecoveryHash('#type=invite&expires_in=3600',{nowSeconds}),
    {status:'invalid',session:null},
  );
  assert.deepEqual(
    inspectPasswordRecoveryHash(`#access_token=${TOKEN}&type=invite&expires_at=${nowSeconds-1}`,{nowSeconds}),
    {status:'expired',session:null},
  );
});

test('unrelated Auth callbacks and duplicate invite parameters remain rejected',()=>{
  for(const hash of [
    `#access_token=${TOKEN}&type=signup&expires_in=3600`,
    `#access_token=${TOKEN}&type=magiclink&expires_in=3600`,
    `#access_token=${TOKEN}&type=invite&type=recovery&expires_in=3600`,
    `#access_token=${TOKEN}&access_token=second&type=invite&expires_in=3600`,
    '#error=access_denied&type=invite',
  ]){
    assert.equal(parsePasswordRecoveryHash(hash,{nowSeconds}),null,hash.split('&')[0]);
  }
});

test('new Client receives a distinct invitation welcome on password setup without second registration',()=>{
  const html=renderAccessUi({backendReady:true,qaOnly:false,mode:'update-password',passwordFlow:'invite'});
  assert.match(html,/Tu invitación IBERFIT/u);
  assert.match(html,/Activa tu acceso/u);
  assert.match(html,/data-auth-form="update-password"/u);
  assert.match(html,/autocomplete="new-password"/u);
  assert.doesNotMatch(html,/registrarse|crear cuenta nueva|token_hash|access_token/iu);
  const recovery=renderAccessUi({backendReady:true,mode:'update-password'});
  assert.match(recovery,/Recuperación segura/u);
  assert.match(recovery,/Crear contraseña nueva/u);
});

test('invite token is removed from URL before rendering; first-access remains fail-closed if scrubbing is unavailable',async()=>{
  const order=[];
  const root=rootFixture();
  const locationLike={hostname:'m26-canary.iberfit.cl',pathname:'/',search:'?source=invite',hash:inviteHash};
  const app=await createM26Application({
    root,
    runtimeConfig:QA_RUNTIME,
    locationLike,
    historyLike:{replaceState:(_state,_title,path)=>{order.push('scrub');assert.equal(path,'/?source=invite');}},
  });
  await app.mount();
  assert.deepEqual(order,['scrub']);
  assert.match(root.innerHTML,/Activa tu acceso/u);
  assert.doesNotMatch(root.innerHTML,/synthetic-invite-access-token|do-not-store-me/u);
  app.destroy();

  const denied=rootFixture();
  const deniedApp=await createM26Application({
    root:denied,
    runtimeConfig:QA_RUNTIME,
    locationLike,
    historyLike:{},
  });
  await deniedApp.mount();
  assert.match(denied.innerHTML,/data-auth-form="request-recovery"/u);
  assert.doesNotMatch(denied.innerHTML,/synthetic-invite-access-token/u);
  deniedApp.destroy();
});

test('first-access password update verifies Supabase identity, changes one password and logs out temporary invite token',async()=>{
  const original=globalThis.fetch;
  const requests=[];
  globalThis.fetch=async(url,options)=>{
    requests.push({url:String(url),method:String(options?.method||'GET'),auth:String(options?.headers?.Authorization||'')});
    if(String(url).endsWith('/auth/v1/user'))return fetchResponse({id:'qa-invite-user',email:'iberfit.cl+qa.coach@gmail.com'});
    if(String(url).includes('/auth/v1/logout'))return fetchResponse(null,204);
    return fetchResponse({},404);
  };
  const root=rootFixture();
  const app=await createM26Application({
    root,
    runtimeConfig:QA_RUNTIME,
    locationLike:{hostname:'m26-canary.iberfit.cl',pathname:'/',search:'',hash:inviteHash},
    historyLike:{replaceState:()=>{}},
  });
  try{
    await app.mount();
    await withFormData(async()=>{
      await root.listener('submit')(submitForm('update-password',{password:SYNTHETIC_CREDENTIAL,passwordConfirmation:SYNTHETIC_CREDENTIAL}));
    });
    assert.deepEqual(requests.map(r=>r.method),['GET','PUT','POST']);
    assert.match(requests[0].url,/\/auth\/v1\/user$/u);
    assert.match(requests[1].url,/\/auth\/v1\/user$/u);
    assert.match(requests[2].url,/\/auth\/v1\/logout\?scope=local$/u);
    assert.match(root.innerHTML,/Acceso activado/u);
    assert.match(root.innerHTML,/data-auth-form="login"/u);
    assert.doesNotMatch(root.innerHTML,/synthetic-invite-access-token|do-not-store-me/u);
  }finally{
    app.destroy();
    globalThis.fetch=original;
  }
});
