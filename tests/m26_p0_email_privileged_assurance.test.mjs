import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderAccessUi} from '../src/m26/app/access-ui.js';
import {createM26Transport} from '../src/m26/supabase-transport.js';

const runtime={
  enabled:true,
  projectRef:'pjhmrhejsoofmouedavw',
  url:'https://pjhmrhejsoofmouedavw.supabase.co',
  publishableKey:'publishable-key-for-test',
  qaOnly:false,
  host:'app.iberfit.cl',
  version:'test-email-assurance',
  timeoutMs:2000,
  rpc:{
    bootstrap:'m26_bootstrap',
    preflight:'m26_preflight',
    execute:'m26_execute',
  },
};

function response(body,status=200){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get(name){return name==='content-type'?'application/json':null;}},
    json:async()=>body,
    text:async()=>JSON.stringify(body),
  };
}

test('privileged access UI keeps WebAuthn preferred and exposes email-code fallback',()=>{
  const challenge=renderAccessUi({
    mode:'mfa-challenge',
    backendReady:true,
    mfa:{kind:'challenge'},
  });
  assert.match(challenge,/data-auth-action="mfa-continue-webauthn"/u);
  assert.match(challenge,/data-auth-action="mfa-send-email-code"/u);
  assert.match(challenge,/Usar código por correo/u);

  const code=renderAccessUi({
    mode:'mfa-email-code',
    backendReady:true,
    mfa:{kind:'challenge',email:'seguridad@iberfit.cl'},
  });
  assert.match(code,/data-auth-form="mfa-email-code"/u);
  assert.match(code,/autocomplete="one-time-code"/u);
  assert.match(code,/pattern="\[0-9\]\{6\}"/u);
  assert.match(code,/se••••••@iberfit\.cl/u);
  assert.doesNotMatch(code,/seguridad@iberfit\.cl/u);
});

test('email OTP request never creates a new account',async()=>{
  const calls=[];
  const transport=createM26Transport(runtime,{fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return response({});
  }});
  await transport.requestEmailOtp('Seguridad@IBERFIT.CL');
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/auth\/v1\/otp$/u);
  assert.deepEqual(JSON.parse(calls[0].options.body),{
    email:'seguridad@iberfit.cl',
    create_user:false,
  });
});

test('email OTP verification creates only a transient session and validates identity',async()=>{
  const calls=[];
  const transport=createM26Transport(runtime,{fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return response({
      access_token:'otp-access-token',
      refresh_token:'otp-refresh-token',
      expires_at:2000000000,
      user:{id:'user-email-assurance-1',email:'seguridad@iberfit.cl'},
    });
  }});
  const session=await transport.verifyEmailOtp('seguridad@iberfit.cl','123456');
  assert.equal(session.user.id,'user-email-assurance-1');
  assert.match(calls[0].url,/\/auth\/v1\/verify$/u);
  assert.deepEqual(JSON.parse(calls[0].options.body),{
    email:'seguridad@iberfit.cl',
    token:'123456',
    type:'email',
  });
  await assert.rejects(()=>transport.verifyEmailOtp('seguridad@iberfit.cl','12345'),/M26_EMAIL_OTP_INVALID/u);
});

test('email assurance finalizer binds OTP proof to the existing password session',async()=>{
  const calls=[];
  const transport=createM26Transport(runtime,{fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return response({
      ok:true,
      verified:true,
      method:'email_otp',
      user:{id:'user-email-assurance-1',email:'seguridad@iberfit.cl'},
      expiresAt:'2026-09-11T06:00:00.000Z',
    });
  }});
  const result=await transport.finalizeEmailAssurance('primary-password-token','otp-access-token');
  assert.equal(result.method,'email_otp');
  assert.match(calls[0].url,/\/functions\/v1\/iberfit-email-assurance-v1$/u);
  assert.equal(calls[0].options.headers.authorization,'Bearer primary-password-token');
  assert.deepEqual(JSON.parse(calls[0].options.body),{otpAccessToken:'otp-access-token'});
});

test('server-side email assurance cannot degrade into OTP-only privileged access',()=>{
  const edge=fs.readFileSync('supabase/functions/iberfit-email-assurance-v1/index.ts','utf8');
  assert.match(edge,/recentAmr\(primaryClaims,'password'/u);
  assert.match(edge,/recentAmr\(otpClaims,'otp'/u);
  assert.match(edge,/primarySessionId===otpSessionId/u);
  assert.match(edge,/primaryUserId!==otpUserId/u);
  assert.match(edge,/primaryEmail!==otpEmail/u);
  assert.match(edge,/M26_PRIVILEGED_ROLE_REQUIRED/u);
  assert.match(edge,/origin,/u);
  assert.doesNotMatch(edge,/access-control-allow-origin'\s*:\s*['"]\*['"]/u);
  assert.doesNotMatch(edge,/console\.log\([^\n]*otpAccessToken/iu);
});

test('database assurance keeps WebAuthn and adds origin-bound email OTP without client table access',()=>{
  const sql=fs.readFileSync('supabase/migrations/20260911033000_p0_email_privileged_assurance_v1.sql','utf8');
  assert.match(sql,/create table if not exists public\.iberfit_email_privileged_assurance_v1/u);
  assert.match(sql,/otp_session_id uuid not null unique/u);
  assert.match(sql,/origin text not null check/u);
  assert.match(sql,/enable row level security/u);
  assert.match(sql,/revoke all on table public\.iberfit_email_privileged_assurance_v1 from public,anon,authenticated/u);
  assert.match(sql,/iberfit_privileged_assurance_v1/u);
  assert.match(sql,/v_assurance_method:='webauthn'/u);
  assert.match(sql,/v_assurance_method:='email_otp'/u);
  assert.match(sql,/'iberfitAssurance'/u);
});

test('IBERFIT OTP email is branded, personalized to the associated address and contains code instead of login link',()=>{
  const html=fs.readFileSync('supabase/templates/iberfit-magic-link.html','utf8');
  const manifest=JSON.parse(fs.readFileSync('supabase/templates/iberfit-hosted-auth-email-manifest.json','utf8'));
  const entry=manifest.templates.find((item)=>item.id==='magic_link');
  assert.ok(entry);
  assert.equal(entry.subject,'Tu código de acceso IBERFIT');
  assert.deepEqual(entry.requires,['{{ .Token }}','{{ .Email }}']);
  assert.match(html,/\{\{ \.Token \}\}/u);
  assert.match(html,/\{\{ \.Email \}\}/u);
  assert.match(html,/#0d3328/iu);
  assert.match(html,/#d0aa50/iu);
  assert.match(html,/isotipo-iberfit\.png/u);
  assert.match(html,/iberfit-email-access-hero\.jpg/u);
  assert.doesNotMatch(html,/\{\{ \.ConfirmationURL \}\}/u);
});
