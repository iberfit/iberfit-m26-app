import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createSessionVault} from '../src/m26/app/session-vault.js';
import {renderAccessUi} from '../src/m26/app/access-ui.js';
import {__webauthnInternals,setNextWebAuthnCeremonyMode} from '../src/m26/app/webauthn.js';

function storageStub(){
  const values=new Map();
  return {
    getItem(key){return values.has(String(key))?values.get(String(key)):null;},
    setItem(key,value){values.set(String(key),String(value));},
    removeItem(key){values.delete(String(key));},
    has(key){return values.has(String(key));},
  };
}

const session=Object.freeze({
  token:'access-token',
  refreshToken:'refresh-token',
  expiresAt:1999999999,
  user:{id:'user-1',email:'coach@example.com'},
});

test('sesión válida persiste entre relanzamientos sin guardar contraseña',()=>{
  const durable=storageStub();
  const transient=storageStub();
  const first=createSessionVault({storage:durable,legacyStorage:transient});
  first.save(session);
  assert.equal(durable.has('iberfit:m26:session:v1'),true);
  assert.equal(transient.has('iberfit:m26:session:v1'),false);

  const second=createSessionVault({storage:durable,legacyStorage:transient});
  assert.deepEqual(second.load(),session);
  assert.doesNotMatch(durable.getItem('iberfit:m26:session:v1'),/password|contrase/i);

  second.clear();
  assert.equal(durable.has('iberfit:m26:session:v1'),false);
});

test('vault migra la sesión histórica de sessionStorage a almacenamiento duradero',()=>{
  const durable=storageStub();
  const transient=storageStub();
  createSessionVault({storage:transient,legacyStorage:null}).save(session);
  assert.equal(transient.has('iberfit:m26:session:v1'),true);

  const migrated=createSessionVault({storage:durable,legacyStorage:transient});
  assert.deepEqual(migrated.load(),session);
  assert.equal(durable.has('iberfit:m26:session:v1'),true);
  assert.equal(transient.has('iberfit:m26:session:v1'),false);
});

test('login expone contraseña visible/oculta y lockup de marca sin el bitmap compuesto crudo',()=>{
  const html=renderAccessUi({backendReady:true,qaOnly:false,mode:'login'});
  assert.match(html,/m26-auth-brand-lockup/u);
  assert.match(html,/m26-auth-brand-mark/u);
  assert.doesNotMatch(html,/<img[^>]+isotipo-iberfit/u);
  assert.match(html,/data-auth-action="toggle-password"/u);
  assert.match(html,/aria-controls="m26-login-password"/u);
  assert.match(html,/aria-pressed="false"/u);
});

test('MFA prioriza este dispositivo y deja QR solo como fallback explícito',()=>{
  const enroll=renderAccessUi({backendReady:true,mode:'mfa-required'});
  assert.match(enroll,/Activar en este dispositivo/u);
  assert.match(enroll,/Windows Hello, Face ID, Touch ID, huella o el PIN nativo/u);

  const challenge=renderAccessUi({backendReady:true,mode:'mfa-challenge'});
  assert.match(challenge,/Usar este dispositivo/u);
  assert.match(challenge,/data-auth-action="mfa-use-other-device"/u);
  assert.match(challenge,/puede mostrar un QR\. Solo se utiliza si tú la eliges/u);
});

test('WebAuthn platform aplica autenticador nativo e internal transport',()=>{
  const creation=__webauthnInternals.platformCreationOptions({
    authenticatorSelection:{residentKey:'required'},
  });
  assert.equal(creation.authenticatorSelection.authenticatorAttachment,'platform');
  assert.equal(creation.authenticatorSelection.userVerification,'required');
  assert.deepEqual(creation.hints,['client-device']);

  const request=__webauthnInternals.platformRequestOptions({
    userVerification:'preferred',
    allowCredentials:[{id:new Uint8Array([1]),type:'public-key',transports:['hybrid','internal']}],
  });
  assert.equal(request.userVerification,'required');
  assert.deepEqual(request.hints,['client-device']);
  assert.deepEqual(request.allowCredentials[0].transports,['internal']);

  assert.equal(setNextWebAuthnCeremonyMode('cross-device'),'cross-device');
  assert.throws(()=>setNextWebAuthnCeremonyMode('unsafe'),/M26_WEBAUTHN_MODE_INVALID/u);
  setNextWebAuthnCeremonyMode('platform');
});

test('bootstrap público cablea UX de contraseña y fallback cross-device antes de montar aplicación',()=>{
  const app=fs.readFileSync('public/m26/app.js','utf8');
  const index=fs.readFileSync('public/m26/index.html','utf8');
  const critical=fs.readFileSync('public/m26/preauth-critical.css','utf8');

  assert.match(app,/setNextWebAuthnCeremonyMode/u);
  assert.match(app,/action==='toggle-password'/u);
  assert.match(app,/action==='mfa-use-other-device'/u);
  assert.match(app,/setNextWebAuthnCeremonyMode\('cross-device'\)/u);

  assert.match(index,/m26-auth-brand-mark/u);
  assert.match(index,/data-auth-action="toggle-password"/u);
  assert.match(critical,/background-position:-1px -104px/u);
  assert.match(critical,/\.m26-password-toggle/u);
});
