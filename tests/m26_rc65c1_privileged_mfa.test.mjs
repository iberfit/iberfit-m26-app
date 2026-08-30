import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createM26Transport,resolveM26Runtime} from '../src/m26/supabase-transport.js';
import {renderAccessUi} from '../src/m26/app/access-ui.js';
import {privilegedMfaDecision} from '../src/m26/app/application.js';
import {runWebAuthnCeremony,webAuthnSupported,__webauthnInternals} from '../src/m26/app/webauthn.js';

const QA_URL='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const USER_ID='11111111-1111-4111-8111-111111111111';
const FACTOR_ID='22222222-2222-4222-8222-222222222222';
const CHALLENGE_ID='33333333-3333-4333-8333-333333333333';
const ACCESS_TOKEN='header.payload.signature';

function runtime(){
  return resolveM26Runtime({enabled:true,qaOnly:true,projectRef:'gjztkdwfmunnzhtvxrsu',url:QA_URL,publishableKey:'sb_publishable_rc65c1_test_key'},{hostname:'m26-canary.iberfit.cl',protocol:'https:'});
}
function jsonResponse(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}
function creationOptions(){return {publicKey:{challenge:'AQID',rp:{name:'IBERFIT',id:'m26-canary.iberfit.cl'},user:{id:'BAUG',name:'qa',displayName:'QA'},pubKeyCredParams:[{type:'public-key',alg:-7}]}};}
function credential(){return {id:'credential_id',rawId:'CQo',type:'public-key',response:{clientDataJSON:'Cw',attestationObject:'DA'},clientExtensionResults:{}};}
function buffer(...values){return Uint8Array.from(values).buffer;}

test('RC65-C1 base64url WebAuthn es estricto y canónico',()=>{
  const encoded=__webauthnInternals.encodeBase64Url(Uint8Array.from([250,251,252]));
  assert.equal(encoded,'-vv8');
  assert.deepEqual([...__webauthnInternals.decodeBase64Url(encoded)],[250,251,252]);
  assert.throws(()=>__webauthnInternals.decodeBase64Url('abc='),/M26_WEBAUTHN_BASE64URL_INVALID/u);
});

test('RC65-C1 fallback de registro convierte binarios, completa labels y serializa attestation',async()=>{
  let options=null;
  const navigatorLike={credentials:{
    create:async({publicKey})=>{options=publicKey;return {id:'credential_id',type:'public-key',rawId:buffer(9,10),getClientExtensionResults:()=>({}),response:{clientDataJSON:buffer(11),attestationObject:buffer(12),getTransports:()=>['internal']}};},
    get:async()=>null,
  }};
  const raw=creationOptions();raw.publicKey.user.name='';raw.publicKey.user.displayName='';
  const result=await runWebAuthnCeremony({type:'create',credentialOptions:raw},{navigatorLike,PublicKeyCredentialImpl:function PublicKeyCredential(){},friendlyName:'IBERFIT acceso seguro'});
  assert.equal(options.user.name,'IBERFIT acceso seguro');assert.equal(options.user.displayName,'IBERFIT acceso seguro');
  assert.ok(options.challenge instanceof Uint8Array);assert.ok(options.user.id instanceof Uint8Array);
  assert.equal(result.credentialResponse.response.clientDataJSON,'Cw');assert.deepEqual(result.credentialResponse.response.transports,['internal']);
});

test('RC65-C1 fallback de assertion convierte allowCredentials y firma',async()=>{
  let options=null;
  const navigatorLike={credentials:{
    create:async()=>null,
    get:async({publicKey})=>{options=publicKey;return {id:'credential_id',type:'public-key',rawId:buffer(9,10),getClientExtensionResults:()=>({}),response:{clientDataJSON:buffer(11),authenticatorData:buffer(12),signature:buffer(13),userHandle:null}};},
  }};
  const result=await runWebAuthnCeremony({type:'request',credentialOptions:{publicKey:{challenge:'AQID',rpId:'m26-canary.iberfit.cl',allowCredentials:[{type:'public-key',id:'Bwg'}]}}},{navigatorLike,PublicKeyCredentialImpl:function PublicKeyCredential(){}});
  assert.ok(options.challenge instanceof Uint8Array);assert.ok(options.allowCredentials[0].id instanceof Uint8Array);
  assert.equal(result.credentialResponse.response.userHandle,null);assert.equal(result.credentialResponse.response.signature,'DQ');
});

test('RC65-C1 cancelación del navegador se reduce a código diagnóstico estable',async()=>{
  const failure=new Error('browser-specific');failure.name='NotAllowedError';
  const navigatorLike={credentials:{create:async()=>{throw failure;},get:async()=>null}};
  await assert.rejects(()=>runWebAuthnCeremony({type:'create',credentialOptions:creationOptions()},{navigatorLike,PublicKeyCredentialImpl:{}}),/M26_WEBAUTHN_NOT_ALLOWED/u);
});

test('RC65-C1 política privilegiada exige WebAuthn verificado además de aal2',()=>{
  assert.deepEqual(privilegedMfaDecision({mfaRequired:false,aal:'aal1'},[]),{kind:'ready'});
  assert.deepEqual(privilegedMfaDecision({mfaRequired:true,aal:'aal1'},[]),{kind:'enroll-required'});
  assert.deepEqual(privilegedMfaDecision({mfaRequired:true,aal:'aal1'},[{factorId:FACTOR_ID,factorType:'webauthn',status:'unverified'}]),{kind:'registration',factorId:FACTOR_ID});
  assert.deepEqual(privilegedMfaDecision({mfaRequired:true,aal:'aal1'},[{factorId:FACTOR_ID,factorType:'webauthn',status:'verified'}]),{kind:'challenge',factorId:FACTOR_ID});
  assert.deepEqual(privilegedMfaDecision({mfaRequired:true,aal:'aal2'},[{factorId:FACTOR_ID,factorType:'webauthn',status:'verified'}]),{kind:'ready',factorId:FACTOR_ID});
  assert.deepEqual(privilegedMfaDecision({mfaRequired:true,aal:'aal2'},[{factorId:FACTOR_ID,factorType:'totp',status:'verified'}]),{kind:'enroll-required'});
});

test('RC65-C1 assurance mínimo + GET user normalizan WebAuthn sin material de credencial',async()=>{
  const calls=[];const previous=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const parsed=new URL(String(url));calls.push({method:String(options.method||'GET').toUpperCase(),path:parsed.pathname,authorization:String(options.headers?.authorization||'')});
    if(parsed.pathname==='/rest/v1/rpc/iberfit_auth_assurance_context_v65c')return jsonResponse({ok:true,privileged:true,privilegedRole:'coach',mfaRequired:true,aal:'aal1'});
    if(parsed.pathname==='/auth/v1/user')return jsonResponse({id:USER_ID,email:'qa.rc74.coach@iberfit.cl',factors:[{id:FACTOR_ID,factor_type:'webauthn',status:'unverified',friendly_name:'IBERFIT Secure Access',web_authn_credential:'must-not-project'}]});
    throw new Error('UNEXPECTED:'+parsed.pathname);
  };
  try{
    const transport=createM26Transport(runtime());
    const assurance=await transport.authAssuranceContext(ACCESS_TOKEN);const user=await transport.authUser(ACCESS_TOKEN);
    assert.equal(assurance.aal,'aal1');assert.deepEqual(user.factors[0],{factorId:FACTOR_ID,factorType:'webauthn',status:'unverified',friendlyName:'IBERFIT Secure Access'});
    assert.deepEqual(calls.map(({method,path})=>({method,path})),[{method:'POST',path:'/rest/v1/rpc/iberfit_auth_assurance_context_v65c'},{method:'GET',path:'/auth/v1/user'}]);
    assert.ok(calls.every((item)=>item.authorization==='Bearer '+ACCESS_TOKEN));
  }finally{globalThis.fetch=previous;}
});

test('RC65-C1 REST WebAuthn enrola, desafía y verifica con contrato Supabase actual',async()=>{
  const calls=[];const previous=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const parsed=new URL(String(url));const method=String(options.method||'GET').toUpperCase();calls.push({method,path:parsed.pathname,body:String(options.body||'')});
    if(parsed.pathname==='/auth/v1/factors'&&method==='POST')return jsonResponse({id:FACTOR_ID,type:'webauthn',friendly_name:'IBERFIT Secure Access'});
    if(parsed.pathname==='/auth/v1/factors/'+FACTOR_ID+'/challenge'&&method==='POST')return jsonResponse({id:CHALLENGE_ID,type:'webauthn',webauthn:{type:'create',credential_options:creationOptions()}});
    if(parsed.pathname==='/auth/v1/factors/'+FACTOR_ID+'/verify'&&method==='POST')return jsonResponse({access_token:'header.aal2.signature',refresh_token:'refresh-token-rc65c1',expires_at:1800000000,user:{id:USER_ID,email:'qa.rc74.coach@iberfit.cl'}});
    throw new Error('UNEXPECTED:'+method+':'+parsed.pathname);
  };
  try{
    const transport=createM26Transport(runtime());
    const enrollment=await transport.enrollWebAuthn('header.aal1.signature');
    const challenge=await transport.challengeWebAuthn('header.aal1.signature',enrollment.factorId);
    const next=await transport.verifyWebAuthn('header.aal1.signature',{factorId:FACTOR_ID,challengeId:challenge.challengeId,type:challenge.type,credentialResponse:credential()});
    assert.equal(enrollment.factorType,'webauthn');assert.equal(challenge.type,'create');assert.equal(next.token,'header.aal2.signature');
    assert.deepEqual(calls.map(({method,path})=>({method,path})),[{method:'POST',path:'/auth/v1/factors'},{method:'POST',path:'/auth/v1/factors/'+FACTOR_ID+'/challenge'},{method:'POST',path:'/auth/v1/factors/'+FACTOR_ID+'/verify'}]);
    assert.deepEqual(JSON.parse(calls[0].body),{factor_type:'webauthn',friendly_name:'IBERFIT Secure Access'});
    assert.deepEqual(JSON.parse(calls[1].body),{});
    assert.deepEqual(JSON.parse(calls[2].body),{challenge_id:CHALLENGE_ID,webauthn:{type:'create',credential_response:credential()}});
  }finally{globalThis.fetch=previous;}
});

test('RC65-C1 valida IDs/challenge/credencial antes de verificar por red',async()=>{
  let calls=0;const previous=globalThis.fetch;globalThis.fetch=async()=>{calls+=1;throw new Error('NETWORK_SHOULD_NOT_RUN');};
  try{
    const transport=createM26Transport(runtime());
    await assert.rejects(()=>transport.challengeWebAuthn(ACCESS_TOKEN,'../../otro'),/M26_MFA_FACTOR_ID_INVALID/u);
    await assert.rejects(()=>transport.verifyWebAuthn(ACCESS_TOKEN,{factorId:FACTOR_ID,challengeId:'bad',type:'request',credentialResponse:credential()}),/M26_MFA_CHALLENGE_ID_INVALID/u);
    await assert.rejects(()=>transport.verifyWebAuthn(ACCESS_TOKEN,{factorId:FACTOR_ID,challengeId:CHALLENGE_ID,type:'request',credentialResponse:{id:'x',type:'public-key'}}),/M26_WEBAUTHN_CREDENTIAL_RESPONSE_INVALID/u);
    assert.equal(calls,0);
  }finally{globalThis.fetch=previous;}
});

test('RC65-C1 ceremonia WebAuthn usa navegador y falla cerrada si no existe soporte',async()=>{
  let captured=null;
  const navigatorLike={credentials:{create:async({publicKey})=>{captured=publicKey;return {toJSON:()=>credential()};},get:async()=>null}};
  const PublicKeyCredentialImpl={parseCreationOptionsFromJSON:(value)=>({parsed:value})};
  assert.equal(webAuthnSupported({navigatorLike,PublicKeyCredentialImpl}),true);
  const result=await runWebAuthnCeremony({type:'create',credentialOptions:creationOptions()},{navigatorLike,PublicKeyCredentialImpl,friendlyName:'IBERFIT acceso seguro'});
  assert.equal(result.type,'create');assert.ok(captured.parsed);assert.deepEqual(result.credentialResponse,credential());
  await assert.rejects(()=>runWebAuthnCeremony({type:'request',credentialOptions:{publicKey:{challenge:'AQID'}}},{navigatorLike:{credentials:{}},PublicKeyCredentialImpl:{}}),/M26_WEBAUTHN_UNSUPPORTED/u);
});

test('RC65-C1 UI WebAuthn no expone QR, secreto ni código TOTP',()=>{
  const required=renderAccessUi({mode:'mfa-required',mfa:{kind:'enroll-required',privilegedRole:'coach'}});
  assert.match(required,/Protege tu cuenta/u);assert.match(required,/Configurar acceso seguro/u);assert.match(required,/data-auth-action="mfa-continue-webauthn"/u);
  const challenge=renderAccessUi({mode:'mfa-challenge',mfa:{factorId:FACTOR_ID,privilegedRole:'admin'}});
  assert.match(challenge,/Confirma tu identidad para continuar/u);assert.match(challenge,/Continuar de forma segura/u);
  for(const markup of [required,challenge]){assert.doesNotMatch(markup,/Código de 6 dígitos|qr_code|otpauth|mfa-verify/iu);}
});

test('RC65-C1 migración no expone assurance a anon/public',()=>{
  const sql=fs.readFileSync('supabase/migrations/20260828143000_rc65c1_auth_assurance_context.sql','utf8');
  assert.match(sql,/security definer/u);assert.match(sql,/set search_path=''/u);assert.match(sql,/revoke all on function public\.iberfit_auth_assurance_context_v65c\(\) from public;/u);assert.match(sql,/revoke all on function public\.iberfit_auth_assurance_context_v65c\(\) from anon;/u);assert.match(sql,/grant execute on function public\.iberfit_auth_assurance_context_v65c\(\) to authenticated;/u);assert.doesNotMatch(sql,/assignedClientIds|clientProfiles|email/u);
});

test('RC65-C1 smoke remoto sigue read-only y el PWA incluye helper WebAuthn',()=>{
  const smoke=fs.readFileSync('qa/rc64/authenticated-smoke.spec.mjs','utf8');
  assert.match(smoke,/iberfit_auth_assurance_context_v65c/u);assert.match(smoke,/url\.pathname==='\/auth\/v1\/user'/u);assert.match(smoke,/RC65_C1_COACH_MFA_GATE_PASS/u);assert.match(smoke,/mfaRequired:true/u);assert.doesNotMatch(smoke,/url\.pathname\.startsWith\('\/auth\/v1\/factors'\)/u);
  const sw=fs.readFileSync('public/m26/sw.js','utf8');assert.match(sw,/"\/src\/m26\/app\/webauthn\.js"/u);
});

test('RC65-C1 documentación fija WebAuthn, RP Canary y prohíbe fallback TOTP',()=>{
  const doc=fs.readFileSync('docs/RC65C1_PRIVILEGED_MFA.md','utf8');
  assert.match(doc,/WebAuthn/u);assert.match(doc,/m26-canary\.iberfit\.cl/u);assert.match(doc,/aal2/u);assert.match(doc,/TOTP no satisface/u);assert.match(doc,/passkey_enabled.*false/u);
});
