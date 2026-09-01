import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createSessionVault} from '../src/m26/app/session-vault.js';
import {renderAccessUi,setPasswordVisibility} from '../src/m26/app/access-ui.js';
import {runWebAuthnCeremony,__webauthnInternals} from '../src/m26/app/webauthn.js';
import {M26_AREAS,areaAllowedForRole,navigationForRole} from '../src/m26/shell/navigation.js';

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

function restoreGlobalStorage(name,descriptor){
  if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
}

function buffer(...values){return Uint8Array.from(values).buffer;}

test('RC75 sesión persiste entre relanzamientos y conserva sólo el contrato de sesión',()=>{
  const storage=fakeStorage();
  const first=createSessionVault({storage});
  first.save(validSession());
  const raw=storage.getItem('iberfit:m26:session:v1');
  assert.ok(raw);

  const relaunched=createSessionVault({storage});
  assert.deepEqual(relaunched.load(),validSession());
  relaunched.clear();
  assert.equal(storage.getItem('iberfit:m26:session:v1'),null);

  const source=fs.readFileSync('src/m26/app/session-vault.js','utf8');
  assert.match(source,/globalStorage\('localStorage'\)/u);
  assert.match(source,/globalStorage\('sessionStorage'\)/u);
  assert.doesNotMatch(source,/password/u);
});

test('RC75 migra una sesión histórica de sessionStorage a localStorage de forma conservadora',()=>{
  const local=fakeStorage();
  const legacy=fakeStorage();
  const key='iberfit:m26:session:v1';
  legacy.setItem(key,JSON.stringify(validSession()));
  const localDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const sessionDescriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  try{
    Object.defineProperty(globalThis,'localStorage',{value:local,configurable:true});
    Object.defineProperty(globalThis,'sessionStorage',{value:legacy,configurable:true});
    const vault=createSessionVault();
    assert.deepEqual(vault.load(),validSession());
    assert.ok(local.getItem(key));
    assert.equal(legacy.getItem(key),null);
  }finally{
    restoreGlobalStorage('localStorage',localDescriptor);
    restoreGlobalStorage('sessionStorage',sessionDescriptor);
  }
});

test('RC75 cae a sessionStorage si localStorage no está disponible',()=>{
  const fallback=fakeStorage();
  const unavailable={setItem(){throw new Error('unavailable');},removeItem(){},getItem(){return null;}};
  const localDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const sessionDescriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  try{
    Object.defineProperty(globalThis,'localStorage',{value:unavailable,configurable:true});
    Object.defineProperty(globalThis,'sessionStorage',{value:fallback,configurable:true});
    createSessionVault().save(validSession());
    assert.ok(fallback.getItem('iberfit:m26:session:v1'));
    assert.deepEqual(createSessionVault().load(),validSession());
  }finally{
    restoreGlobalStorage('localStorage',localDescriptor);
    restoreGlobalStorage('sessionStorage',sessionDescriptor);
  }
});

test('RC75 un storage inyectado no lee ni altera storages globales',()=>{
  const injected=fakeStorage();
  const local=fakeStorage();
  const session=fakeStorage();
  const key='iberfit:m26:session:v1';
  local.setItem(key,JSON.stringify(validSession()));
  session.setItem(key,JSON.stringify(validSession()));
  const localDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const sessionDescriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  try{
    Object.defineProperty(globalThis,'localStorage',{value:local,configurable:true});
    Object.defineProperty(globalThis,'sessionStorage',{value:session,configurable:true});
    const vault=createSessionVault({storage:injected});
    assert.equal(vault.load(),null);
    vault.save(validSession());
    vault.clear();
    assert.ok(local.getItem(key));
    assert.ok(session.getItem(key));
  }finally{
    restoreGlobalStorage('localStorage',localDescriptor);
    restoreGlobalStorage('sessionStorage',sessionDescriptor);
  }
});

test('RC75 acceso muestra marca real y control accesible para ver u ocultar contraseña',()=>{
  const html=renderAccessUi({backendReady:true,qaOnly:false,host:'app.iberfit.cl'});
  assert.match(html,/class="m26-auth-brandmark"[\s\S]*src="\/public\/isotipo-iberfit\.png"/u);
  assert.match(html,/data-password-input/u);
  assert.match(html,/data-password-visibility/u);
  assert.match(html,/aria-controls="m26-login-password"/u);
  assert.match(html,/aria-pressed="false"/u);
  assert.match(html,/aria-label="Ver contraseña"/u);

  const label={textContent:'Ver'};
  const attrs=new Map();
  const input={type:'password'};
  const button={
    setAttribute(name,value){attrs.set(name,String(value));},
    querySelector(selector){return selector==='[data-password-visibility-label]'?label:null;},
  };
  assert.equal(setPasswordVisibility(input,button,true),true);
  assert.equal(input.type,'text');
  assert.equal(attrs.get('aria-pressed'),'true');
  assert.equal(attrs.get('aria-label'),'Ocultar contraseña');
  assert.equal(label.textContent,'Ocultar');
  setPasswordVisibility(input,button,false);
  assert.equal(input.type,'password');
  assert.equal(attrs.get('aria-label'),'Ver contraseña');
});

test('RC75 first paint conserva composición de marca, foco y objetivos táctiles',()=>{
  const html=fs.readFileSync('public/m26/index.html','utf8');
  assert.match(html,/m26-auth-brandmark[^>]+\/public\/isotipo-iberfit\.png/u);
  assert.match(html,/\.m26-auth-card input,\.m26-auth-card button\{width:100%;min-height:48px/u);
  assert.match(html,/focus-visible/u);
  assert.match(html,/\.m26-password-field\{position:relative/u);
  assert.match(html,/data-password-visibility/u);
});

test('RC75 WebAuthn prioriza autenticador del mismo dispositivo sin prohibir fallbacks',async()=>{
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
        response:{clientDataJSON:buffer(11),authenticatorData:buffer(12),signature:buffer(13),userHandle:null},
      };
    },
  }};
  const challenge={
    type:'request',
    credentialOptions:{publicKey:{
      challenge:'AQID',
      rpId:'app.iberfit.cl',
      allowCredentials:[{type:'public-key',id:'Bwg',transports:['internal','hybrid']}],
      userVerification:'required',
      hints:['hybrid'],
    }},
  };
  await runWebAuthnCeremony(challenge,{navigatorLike,PublicKeyCredentialImpl:function PublicKeyCredential(){}});
  assert.equal(captured.hints[0],'client-device');
  assert.ok(captured.hints.includes('hybrid'));
  assert.equal(captured.userVerification,'required');
});

test('RC75 Coach y Client reciben Retos/Ajustes sin alterar navegación móvil; Admin sigue aislado',()=>{
  const coach=navigationForRole('coach');
  const coachKeys=[...coach.primary,...coach.context,...coach.tools].map((item)=>item.key);
  assert.ok(coachKeys.includes('retos'));
  assert.ok(coachKeys.includes('ajustes'));

  const client=navigationForRole('client');
  const clientKeys=[...client.primary,...client.context,...client.tools].map((item)=>item.key);
  assert.ok(clientKeys.includes('retos'));
  assert.ok(clientKeys.includes('ajustes'));
  assert.deepEqual(client.mobile.map((item)=>item.key),['hoy','sesion','progreso','actividad']);

  assert.deepEqual(M26_AREAS.retos.roles,['coach','client']);
  assert.deepEqual(M26_AREAS.ajustes.roles,['coach','client']);
  assert.equal(areaAllowedForRole('retos','coach'),true);
  assert.equal(areaAllowedForRole('ajustes','coach'),true);
  assert.equal(areaAllowedForRole('retos','client'),true);
  assert.equal(areaAllowedForRole('ajustes','client'),true);
  assert.equal(areaAllowedForRole('retos','admin'),false);
  assert.equal(areaAllowedForRole('ajustes','admin'),false);
  const admin=navigationForRole('admin');
  assert.ok([...admin.primary,...admin.context,...admin.tools,...admin.mobile].every((item)=>item.key.startsWith('admin-')));
});
