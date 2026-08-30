import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createM26Transport,resolveM26Runtime} from '../src/m26/supabase-transport.js';
import {renderAccessUi} from '../src/m26/app/access-ui.js';
import {privilegedMfaDecision} from '../src/m26/app/application.js';
import {runWebAuthnCeremony,webAuthnSupported,__webauthnInternals} from '../src/m26/app/webauthn.js';

const QA_URL='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const USER_ID='11111111-1111-4111-8111-111111111111';
const CHALLENGE_ID='33333333-3333-4333-8333-333333333333';
const REGISTRATION_FACTOR_ID='65000000-0000-4000-8000-000000000001';
const AUTHENTICATION_FACTOR_ID='65000000-0000-4000-8000-000000000002';
const ACCESS_TOKEN='header.payload.signature';

function runtime(){
  return resolveM26Runtime({enabled:true,qaOnly:true,projectRef:'gjztkdwfmunnzhtvxrsu',url:QA_URL,publishableKey:'sb_publishable_rc65c1_test_key'},{hostname:'m26-canary.iberfit.cl',protocol:'https:'});
}
function jsonResponse(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}
function creationOptions(){return {publicKey:{challenge:'AQID',rp:{name:'IBERFIT',id:'m26-canary.iberfit.cl'},user:{id:'BAUG',name:'qa',displayName:'QA'},pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{userVerification:'required'}}};}
function requestOptions(){return {publicKey:{challenge:'AQID',rpId:'m26-canary.iberfit.cl',allowCredentials:[{type:'public-key',id:'Bwg'}],userVerification:'required'}};}
function credential(){return {id:'credential_id',rawId:'CQo',type:'public-key',response:{clientDataJSON:'Cw',attestationObject:'DA'},clientExtensionResults:{}};}
function assertion(){return {id:'credential_id',rawId:'CQo',type:'public-key',response:{clientDataJSON:'Cw',authenticatorData:'DA',signature:'DQ',userHandle:null},clientExtensionResults:{}};}
function buffer(...values){return Uint8Array.from(values).buffer;}

test('RC65-C1 FREE conserva helper WebAuthn estricto del navegador',async()=>{
  const encoded=__webauthnInternals.encodeBase64Url(Uint8Array.from([250,251,252]));
  assert.equal(encoded,'-vv8');
  assert.deepEqual([...__webauthnInternals.decodeBase64Url(encoded)],[250,251,252]);
  assert.throws(()=>__webauthnInternals.decodeBase64Url('abc='),/M26_WEBAUTHN_BASE64URL_INVALID/u);

  let captured=null;
  const navigatorLike={credentials:{
    create:async({publicKey})=>{captured=publicKey;return {id:'credential_id',type:'public-key',rawId:buffer(9,10),getClientExtensionResults:()=>({}),response:{clientDataJSON:buffer(11),attestationObject:buffer(12),getTransports:()=>['internal']}};},
    get:async()=>null,
  }};
  assert.equal(webAuthnSupported({navigatorLike,PublicKeyCredentialImpl:function PublicKeyCredential(){}}),true);
  const result=await runWebAuthnCeremony({type:'create',credentialOptions:creationOptions()},{navigatorLike,PublicKeyCredentialImpl:function PublicKeyCredential(){},friendlyName:'IBERFIT acceso seguro'});
  assert.ok(captured.challenge instanceof Uint8Array);
  assert.equal(result.type,'create');
  assert.equal(result.credentialResponse.response.clientDataJSON,'Cw');
});

test('RC65-C1 FREE decisión privilegiada usa assurance propio y no Supabase aal2',()=>{
  assert.deepEqual(privilegedMfaDecision({webauthnRequired:false,iberfitAssurance:'not-required',credentialEnrolled:false,supabaseAal:'aal1'},[]),{kind:'ready'});
  assert.deepEqual(privilegedMfaDecision({webauthnRequired:true,iberfitAssurance:'required',credentialEnrolled:false,supabaseAal:'aal1'},[]),{kind:'enroll-required'});
  assert.deepEqual(privilegedMfaDecision({webauthnRequired:true,iberfitAssurance:'required',credentialEnrolled:true,supabaseAal:'aal1'},[]),{kind:'challenge',factorId:AUTHENTICATION_FACTOR_ID});
  assert.deepEqual(privilegedMfaDecision({webauthnRequired:true,iberfitAssurance:'verified',credentialEnrolled:true,supabaseAal:'aal1'},[]),{kind:'ready'});
});

test('RC65-C1 FREE assurance RPC v65d normaliza contrato server-side',async()=>{
  const calls=[];const previous=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const parsed=new URL(String(url));calls.push({method:String(options.method||'GET').toUpperCase(),path:parsed.pathname});
    if(parsed.pathname==='/rest/v1/rpc/iberfit_privileged_assurance_context_v65d'){
      return jsonResponse({ok:true,privileged:true,privilegedRole:'coach',mfaRequired:true,webauthnRequired:true,credentialEnrolled:false,iberfitAssurance:'required',verifiedAt:null,expiresAt:null,supabaseAal:'aal1'});
    }
    throw new Error('UNEXPECTED:'+parsed.pathname);
  };
  try{
    const assurance=await createM26Transport(runtime()).authAssuranceContext(ACCESS_TOKEN);
    assert.equal(assurance.iberfitAssurance,'required');
    assert.equal(assurance.supabaseAal,'aal1');
    assert.equal(assurance.credentialEnrolled,false);
    assert.deepEqual(calls,[{method:'POST',path:'/rest/v1/rpc/iberfit_privileged_assurance_context_v65d'}]);
  }finally{globalThis.fetch=previous;}
});

test('RC65-C1 FREE transporte registra y autentica por Edge Function, nunca /auth/v1/factors',async()=>{
  const calls=[];const previous=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const parsed=new URL(String(url));const method=String(options.method||'GET').toUpperCase();
    const body=options.body?JSON.parse(String(options.body)):{};
    calls.push({method,path:parsed.pathname,body});
    if(parsed.pathname!=='/functions/v1/iberfit-webauthn-v1')throw new Error('UNEXPECTED:'+parsed.pathname);
    if(body.action==='registration-options')return jsonResponse({ok:true,challengeId:CHALLENGE_ID,type:'create',credentialOptions:creationOptions(),privilegedRole:'coach'});
    if(body.action==='registration-verify')return jsonResponse({ok:true,verified:true,user:{id:USER_ID,email:'qa.rc74.coach@iberfit.cl'},privilegedRole:'coach',expiresAt:'2026-08-30T12:00:00.000Z'});
    if(body.action==='authentication-options')return jsonResponse({ok:true,challengeId:CHALLENGE_ID,type:'request',credentialOptions:requestOptions(),privilegedRole:'coach'});
    if(body.action==='authentication-verify')return jsonResponse({ok:true,verified:true,user:{id:USER_ID,email:'qa.rc74.coach@iberfit.cl'},privilegedRole:'coach',expiresAt:'2026-08-30T12:00:00.000Z'});
    throw new Error('UNEXPECTED_ACTION:'+body.action);
  };
  try{
    const transport=createM26Transport(runtime());
    const enrollment=await transport.enrollWebAuthn(ACCESS_TOKEN);
    assert.deepEqual(enrollment,{factorId:REGISTRATION_FACTOR_ID,factorType:'webauthn'});
    assert.equal(calls.length,0,'enroll local no debe llamar al add-on MFA');

    const regChallenge=await transport.challengeWebAuthn(ACCESS_TOKEN,enrollment.factorId);
    assert.equal(regChallenge.type,'create');
    const regVerify=await transport.verifyWebAuthn(ACCESS_TOKEN,{factorId:REGISTRATION_FACTOR_ID,challengeId:CHALLENGE_ID,type:'create',credentialResponse:credential()});
    assert.equal(regVerify.user.id,USER_ID);

    const authChallenge=await transport.challengeWebAuthn(ACCESS_TOKEN,AUTHENTICATION_FACTOR_ID);
    assert.equal(authChallenge.type,'request');
    const authVerify=await transport.verifyWebAuthn(ACCESS_TOKEN,{factorId:AUTHENTICATION_FACTOR_ID,challengeId:CHALLENGE_ID,type:'request',credentialResponse:assertion()});
    assert.equal(authVerify.user.id,USER_ID);

    assert.deepEqual(calls.map((item)=>item.body.action),['registration-options','registration-verify','authentication-options','authentication-verify']);
    assert.ok(calls.every((item)=>item.path==='/functions/v1/iberfit-webauthn-v1'));
  }finally{globalThis.fetch=previous;}
});

test('RC65-C1 FREE fuente transport no depende del Advanced MFA de Supabase',()=>{
  const source=fs.readFileSync('src/m26/supabase-transport.js','utf8');
  assert.match(source,/iberfit_privileged_assurance_context_v65d/u);
  assert.match(source,/\/functions\/v1\/iberfit-webauthn-v1/u);
  assert.doesNotMatch(source,/['"]\/auth\/v1\/factors/u);
  assert.doesNotMatch(source,/M26_MFA_AAL2_WEBAUTHN_REQUIRED/u);
});

test('RC65-C1 FREE aplicación conserva sesión Supabase y exige iberfitAssurance verified',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  assert.match(source,/assurance\.iberfitAssurance!=='verified'/u);
  assert.match(source,/M26_PRIVILEGED_WEBAUTHN_REQUIRED/u);
  assert.doesNotMatch(source,/assurance\.aal!=='aal2'/u);
  const verifyArea=source.match(/const next=await transport\.verifyWebAuthn[\s\S]{0,1800}?const \[assurance,user\]=await Promise\.all/u)?.[0]||'';
  assert.ok(verifyArea);
  assert.doesNotMatch(verifyArea,/session=next|vault\.save\(session\)/u);
});

test('RC65-C1 FREE migración liga assurance a session_id real y bloquea tablas al cliente',()=>{
  const sql=fs.readFileSync('supabase/migrations/20260830033156_rc65c1_free_webauthn_assurance.sql','utf8');
  for(const name of ['iberfit_webauthn_credentials_v1','iberfit_webauthn_challenges_v1','iberfit_privileged_assurance_v1','iberfit_privileged_assurance_context_v65d','iberfit_require_privileged_assurance_v65d']){
    assert.match(sql,new RegExp(name,'u'));
  }
  assert.match(sql,/auth\.jwt\(\)->>'session_id'/u);
  assert.match(sql,/from auth\.sessions/u);
  assert.match(sql,/enable row level security/u);
  assert.match(sql,/from public, anon, authenticated/u);
  assert.match(sql,/grant execute on function public\.iberfit_privileged_assurance_context_v65d\(\) to authenticated;/u);
  assert.match(sql,/revoke all on function public\.iberfit_require_privileged_assurance_v65d\(\) from authenticated;/u);
});

test('RC65-C1 FREE Edge Function fija librerías, origin, UV required y challenge de un uso',()=>{
  const edge=fs.readFileSync('supabase/functions/iberfit-webauthn-v1/index.ts','utf8');
  assert.match(edge,/@simplewebauthn\/server@13\.3\.3/u);
  assert.match(edge,/@supabase\/supabase-js@2\.112\.4/u);
  assert.match(edge,/const RP_ID='m26-canary\.iberfit\.cl'/u);
  assert.match(edge,/const ORIGIN='https:\/\/m26-canary\.iberfit\.cl'/u);
  assert.match(edge,/userVerification:'required'/u);
  assert.equal((edge.match(/requireUserVerification:true/gu)||[]).length,2);
  assert.match(edge,/consumed_at:now/u);
  assert.match(edge,/\.is\('consumed_at',null\)\.gt\('expires_at',now\)/u);
  assert.match(edge,/sessionId=String\(claims\?\.session_id/u);
  assert.match(edge,/M26_PRIVILEGED_ROLE_REQUIRED/u);

  const config=fs.readFileSync('supabase/config.toml','utf8');
  assert.match(config,/\[functions\.iberfit-webauthn-v1\][\s\S]*verify_jwt\s*=\s*true/u);
});

test('RC65-C1 FREE UI sigue integrada, sin QR ni app TOTP',()=>{
  const required=renderAccessUi({mode:'mfa-required',mfa:{kind:'enroll-required',privilegedRole:'coach'}});
  const challenge=renderAccessUi({mode:'mfa-challenge',mfa:{factorId:AUTHENTICATION_FACTOR_ID,privilegedRole:'admin'}});
  assert.match(required,/Protege tu cuenta/u);
  assert.match(required,/Configurar acceso seguro/u);
  assert.match(challenge,/Confirma tu identidad para continuar/u);
  assert.match(challenge,/Continuar de forma segura/u);
  for(const markup of [required,challenge])assert.doesNotMatch(markup,/Google Authenticator|Authy|Código de 6 dígitos|qr_code|otpauth/iu);
});

test('RC65-C1 FREE smoke remoto permanece read-only y bloquea Coach antes de bootstrap',()=>{
  const smoke=fs.readFileSync('qa/rc64/authenticated-smoke.spec.mjs','utf8');
  assert.match(smoke,/iberfit_privileged_assurance_context_v65d/u);
  assert.match(smoke,/RC65_C1_COACH_MFA_GATE_PASS/u);
  assert.doesNotMatch(smoke,/iberfit_auth_assurance_context_v65c/u);
  assert.doesNotMatch(smoke,/\/functions\/v1\/iberfit-webauthn-v1/u);
  assert.doesNotMatch(smoke,/url\.pathname\.startsWith\('\/auth\/v1\/factors'\)/u);
});

test('RC65-C1 FREE documentación prohíbe add-on y no falsifica Supabase aal',()=>{
  const doc=fs.readFileSync('docs/RC65C1_PRIVILEGED_MFA.md','utf8');
  assert.match(doc,/no usa el add-on/iu);
  assert.match(doc,/sin costes adicionales/iu);
  assert.match(doc,/no falsifica ni eleva/iu);
  assert.match(doc,/iberfitAssurance = verified/u);
  assert.match(doc,/Windows Hello/u);
});
