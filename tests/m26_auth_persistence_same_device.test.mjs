import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createSessionVault} from '../src/m26/app/session-vault.js';
import {runWebAuthnCeremony,__webauthnInternals} from '../src/m26/app/webauthn.js';

const SESSION_KEY='iberfit:m26:session:v1';

function fakeStorage(){
  const records=new Map();
  return {
    getItem(key){return records.has(String(key))?records.get(String(key)):null;},
    setItem(key,value){records.set(String(key),String(value));},
    removeItem(key){records.delete(String(key));},
  };
}

function validSession(){
  return {
    token:'unit_test_access_value',
    refreshToken:'unit_test_refresh_value',
    expiresAt:2_000_000_000,
    user:{id:'11111111-1111-4111-8111-111111111111',email:'client@iberfit.cl'},
  };
}

function restoreGlobal(name,descriptor){
  if(descriptor)Object.defineProperty(globalThis,name,descriptor);
  else delete globalThis[name];
}

function buffer(...values){return Uint8Array.from(values).buffer;}

test('sesión válida persiste entre instancias sin almacenar contraseña',()=>{
  const storage=fakeStorage();
  const first=createSessionVault({storage});
  first.save(validSession());
  const raw=storage.getItem(SESSION_KEY);
  assert.ok(raw);
  assert.doesNotMatch(raw,/password/iu);

  const relaunched=createSessionVault({storage});
  assert.deepEqual(relaunched.load(),validSession());
  relaunched.clear();
  assert.equal(storage.getItem(SESSION_KEY),null);

  const source=fs.readFileSync('src/m26/app/session-vault.js','utf8');
  assert.match(source,/globalStorage\('localStorage'\)/u);
  assert.match(source,/globalStorage\('sessionStorage'\)/u);
  assert.doesNotMatch(source,/password/iu);
});

test('sesión histórica migra de sessionStorage a localStorage sin duplicarla',()=>{
  const local=fakeStorage();
  const legacy=fakeStorage();
  legacy.setItem(SESSION_KEY,JSON.stringify(validSession()));
  const localDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const sessionDescriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  try{
    Object.defineProperty(globalThis,'localStorage',{value:local,configurable:true});
    Object.defineProperty(globalThis,'sessionStorage',{value:legacy,configurable:true});
    const vault=createSessionVault();
    assert.deepEqual(vault.load(),validSession());
    assert.ok(local.getItem(SESSION_KEY));
    assert.equal(legacy.getItem(SESSION_KEY),null);
  }finally{
    restoreGlobal('localStorage',localDescriptor);
    restoreGlobal('sessionStorage',sessionDescriptor);
  }
});

test('si localStorage no está disponible cae de forma segura a sessionStorage',()=>{
  const fallback=fakeStorage();
  const unavailable={setItem(){throw new Error('unavailable');},removeItem(){},getItem(){return null;}};
  const localDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const sessionDescriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  try{
    Object.defineProperty(globalThis,'localStorage',{value:unavailable,configurable:true});
    Object.defineProperty(globalThis,'sessionStorage',{value:fallback,configurable:true});
    createSessionVault().save(validSession());
    assert.ok(fallback.getItem(SESSION_KEY));
    assert.deepEqual(createSessionVault().load(),validSession());
  }finally{
    restoreGlobal('localStorage',localDescriptor);
    restoreGlobal('sessionStorage',sessionDescriptor);
  }
});

test('WebAuthn prioriza el mismo dispositivo sin eliminar fallback ni userVerification',async()=>{
  assert.deepEqual(
    __webauthnInternals.preferSameDevice({hints:['hybrid','security-key']}),
    {hints:['client-device','hybrid','security-key']},
  );

  let captured=null;
  const navigatorLike={credentials:{
    create:async()=>null,
    get:async({publicKey})=>{
      captured=publicKey;
      return {
        id:'credential_id',
        rawId:buffer(9,10),
        type:'public-key',
        getClientExtensionResults:()=>({}),
        response:{
          clientDataJSON:buffer(11),
          authenticatorData:buffer(12),
          signature:buffer(13),
          userHandle:null,
        },
      };
    },
  }};

  await runWebAuthnCeremony({
    type:'request',
    credentialOptions:{publicKey:{
      challenge:'AQID',
      rpId:'iberfit.cl',
      allowCredentials:[{type:'public-key',id:'Bwg',transports:['internal','hybrid']}],
      userVerification:'required',
      hints:['hybrid'],
    }},
  },{navigatorLike,PublicKeyCredentialImpl:function PublicKeyCredential(){}});

  assert.equal(captured.hints[0],'client-device');
  assert.ok(captured.hints.includes('hybrid'));
  assert.equal(captured.userVerification,'required');
  assert.deepEqual(captured.allowCredentials[0].transports,['internal','hybrid']);
});
