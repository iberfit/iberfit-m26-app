import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createSessionVault,
  __sessionVaultInternals,
} from '../src/m26/app/session-vault.js';
import {
  runWebAuthnCeremony,
  __webauthnInternals,
} from '../src/m26/app/webauthn.js';
import {renderAccessUi} from '../src/m26/app/access-ui.js';
import {
  areaAllowedForRole,
  navigationForRole,
} from '../src/m26/shell/navigation.js';

function storage(){
  const values=new Map();
  return {
    getItem(key){return values.has(String(key))?values.get(String(key)):null;},
    setItem(key,value){values.set(String(key),String(value));},
    removeItem(key){values.delete(String(key));},
    has(key){return values.has(String(key));},
  };
}

function session(overrides={}){
  return {
    token:'access-token',
    refreshToken:'refresh-token',
    expiresAt:1900000000,
    user:{id:'user-1',email:'User@IBERFIT.CL'},
    ...overrides,
  };
}

function buffer(...values){return Uint8Array.from(values).buffer;}

function requestChallenge(transports=['hybrid','internal']){
  return {
    type:'request',
    credentialOptions:{
      publicKey:{
        challenge:'AQID',
        rpId:'iberfit.cl',
        allowCredentials:[{type:'public-key',id:'Bwg',transports}],
        userVerification:'required',
      },
    },
  };
}

function creationChallenge(){
  return {
    type:'create',
    credentialOptions:{
      publicKey:{
        challenge:'AQID',
        rp:{name:'IBERFIT',id:'iberfit.cl'},
        user:{id:'BAUG',name:'user',displayName:'User'},
        pubKeyCredParams:[{type:'public-key',alg:-7}],
        authenticatorSelection:{residentKey:'preferred',userVerification:'required'},
      },
    },
  };
}

test('sesión persistente usa almacenamiento durable y normaliza identidad',()=>{
  const durable=storage();
  const legacy=storage();
  const vault=createSessionVault({storage:durable,legacyStorage:legacy});
  vault.save(session());
  assert.equal(durable.has(__sessionVaultInternals.KEY),true);
  const restored=createSessionVault({storage:durable,legacyStorage:legacy}).load();
  assert.equal(restored.refreshToken,'refresh-token');
  assert.equal(restored.user.email,'user@iberfit.cl');
});

test('sesión v1 se migra desde sessionStorage y clear elimina ambos scopes',()=>{
  const durable=storage();
  const legacy=storage();
  legacy.setItem(__sessionVaultInternals.LEGACY_KEY,JSON.stringify(session()));
  const vault=createSessionVault({storage:durable,legacyStorage:legacy});
  assert.equal(vault.load()?.user?.id,'user-1');
  assert.equal(durable.has(__sessionVaultInternals.KEY),true);
  assert.equal(legacy.has(__sessionVaultInternals.LEGACY_KEY),false);
  vault.clear();
  assert.equal(durable.has(__sessionVaultInternals.KEY),false);
  assert.equal(durable.has(__sessionVaultInternals.LEGACY_KEY),false);
  assert.equal(legacy.has(__sessionVaultInternals.KEY),false);
});

test('registro WebAuthn fuerza autenticador de plataforma y verificación de usuario',async()=>{
  let captured=null;
  class PublicKeyCredentialImpl{
    static async isUserVerifyingPlatformAuthenticatorAvailable(){return true;}
  }
  const navigatorLike={credentials:{
    create:async({publicKey})=>{
      captured=publicKey;
      return {
        id:'credential_id',
        type:'public-key',
        rawId:buffer(9,10),
        getClientExtensionResults:()=>({}),
        response:{
          clientDataJSON:buffer(11),
          attestationObject:buffer(12),
          getTransports:()=>['internal'],
        },
      };
    },
    get:async()=>null,
  }};
  await runWebAuthnCeremony(creationChallenge(),{navigatorLike,PublicKeyCredentialImpl});
  assert.equal(captured.authenticatorSelection.authenticatorAttachment,'platform');
  assert.equal(captured.authenticatorSelection.userVerification,'required');
});

test('autenticación WebAuthn elimina el transporte híbrido y usa credencial internal',async()=>{
  let captured=null;
  class PublicKeyCredentialImpl{
    static async isUserVerifyingPlatformAuthenticatorAvailable(){return true;}
  }
  const navigatorLike={credentials:{
    create:async()=>null,
    get:async({publicKey})=>{
      captured=publicKey;
      return {
        id:'credential_id',
        type:'public-key',
        rawId:buffer(9,10),
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
  await runWebAuthnCeremony(requestChallenge(),{navigatorLike,PublicKeyCredentialImpl});
  assert.deepEqual(captured.allowCredentials[0].transports,['internal']);
});

test('autenticación nativa falla cerrada si la cuenta no tiene credencial internal',()=>{
  const options=__webauthnInternals.fallbackRequestOptions(requestChallenge(['hybrid']).credentialOptions);
  assert.throws(
    ()=>__webauthnInternals.preferInternalAuthentication(options),
    /M26_WEBAUTHN_LOCAL_CREDENTIAL_UNAVAILABLE/u,
  );
});

test('login tiene marca alineable y control accesible mostrar/ocultar contraseña',()=>{
  const html=renderAccessUi({mode:'login'});
  assert.match(html,/class="m26-auth-brand"/u);
  assert.match(html,/class="m26-auth-mark"/u);
  assert.match(html,/data-auth-password-toggle/u);
  assert.match(html,/aria-controls="m26-login-password"/u);
  assert.match(html,/aria-pressed="false"/u);
  assert.doesNotMatch(html,/type="checkbox"[^>]*remember/iu);
});

test('arranque refresca sesión persistida antes de montar y no persiste contraseña',()=>{
  const app=fs.readFileSync('public/m26/app.js','utf8');
  const vault=fs.readFileSync('src/m26/app/session-vault.js','utf8');
  assert.match(app,/preparePersistedSession/u);
  assert.match(app,/transport\.refresh\(persisted\.refreshToken\)/u);
  assert.match(app,/M26_REFRESH_IDENTITY_MISMATCH/u);
  assert.match(app,/data-auth-password-toggle/u);
  assert.doesNotMatch(vault,/password\s*:/iu);
});

test('Retos y Ajustes son navegables para Cliente y Coach, no rompen aislamiento Admin',()=>{
  for(const role of ['client','coach']){
    assert.equal(areaAllowedForRole('retos',role),true);
    assert.equal(areaAllowedForRole('ajustes',role),true);
    const keys=[...navigationForRole(role).primary,...navigationForRole(role).context,...navigationForRole(role).tools].map(item=>item.key);
    assert.equal(keys.includes('retos'),true,`${role}:retos`);
    assert.equal(keys.includes('ajustes'),true,`${role}:ajustes`);
  }
  assert.equal(areaAllowedForRole('retos','admin'),false);
  assert.equal(areaAllowedForRole('ajustes','admin'),false);
  assert.equal(navigationForRole('admin').tools.some(item=>item.key==='admin-configuracion'),true);
});

test('CSS de acceso carga al final y suprime controles de instalación vacíos',()=>{
  const index=fs.readFileSync('public/m26/index.html','utf8');
  const css=fs.readFileSync('src/m26/app/access-ui.css','utf8');
  assert.equal((index.match(/\/src\/m26\/app\/access-ui\.css/gu)||[]).length,1);
  assert.ok(index.indexOf('/src/m26/app/access-ui.css')>index.indexOf('/src/m26/design/role-surfaces.css'));
  assert.match(css,/\.m26-auth-brand/u);
  assert.match(css,/\.m26-password-toggle/u);
  assert.match(css,/iberfit-install-control:empty/u);
});
