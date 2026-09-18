import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  emailOtpFailureMessage,
  emailOtpRequestFailureMode,
} from '../src/m26/app/application.js';

function authError(code,{status=400,message=code}={}){
  return Object.assign(new Error(message),{status,body:{code}});
}

test('failed OTP resend stays on the email-code surface when a code was already issued',()=>{
  const state={kind:'challenge',email:'coach@iberfit.cl'};
  assert.equal(
    emailOtpRequestFailureMode({resend:true,mfaState:state,fallbackMode:'mfa-challenge'}),
    'mfa-email-code',
  );
  assert.equal(
    emailOtpRequestFailureMode({resend:false,mfaState:state,fallbackMode:'mfa-challenge'}),
    'mfa-challenge',
  );
  assert.equal(
    emailOtpRequestFailureMode({resend:true,mfaState:{kind:'challenge'},fallbackMode:'mfa-challenge'}),
    'mfa-challenge',
  );
  assert.equal(
    emailOtpRequestFailureMode({resend:true,mfaState:null,fallbackMode:'unexpected'}),
    'mfa-required',
  );
});

test('OTP failure copy distinguishes rate-limit, stale password, expiry and replay',()=>{
  assert.match(
    emailOtpFailureMessage(authError('over_email_send_rate_limit',{status:429})),
    /espera un momento/iu,
  );
  assert.match(
    emailOtpFailureMessage(authError('M26_EMAIL_ASSURANCE_PASSWORD_RECENT_REQUIRED',{status:403})),
    /vuelve a entrar con tu contraseña/iu,
  );
  assert.match(
    emailOtpFailureMessage(authError('M26_EMAIL_ASSURANCE_OTP_REQUIRED',{status:403})),
    /ha caducado/iu,
  );
  assert.match(
    emailOtpFailureMessage(authError('M26_EMAIL_ASSURANCE_OTP_ALREADY_USED',{status:409})),
    /ya fue utilizado/iu,
  );
  assert.match(
    emailOtpFailureMessage(authError('M26_EMAIL_ASSURANCE_SESSION_INVALID',{status:401})),
    /ha caducado/iu,
  );
});

test('generic 403 is not misreported as stale password and network failure remains recoverable',()=>{
  const forbidden=emailOtpFailureMessage(authError('M26_EMAIL_ASSURANCE_IDENTITY_MISMATCH',{status:403}));
  assert.doesNotMatch(forbidden,/contraseña/iu);
  assert.match(forbidden,/No fue posible completar/iu);

  const network=emailOtpFailureMessage(Object.assign(new TypeError('Failed to fetch'),{status:0}));
  assert.match(network,/No fue posible conectar/iu);
  assert.match(network,/sesión sigue protegida/iu);
});

test('application wires resend intent explicitly and preserves email-code mode on resend failure',()=>{
  const app=fs.readFileSync('src/m26/app/application.js','utf8');
  assert.match(app,/async function requestMfaEmailCode\(\{resend=false\}=\{\}\)/u);
  assert.match(app,/requestMfaEmailCode\(\{resend:action==='mfa-resend-email-code'\}\)/u);
  assert.match(app,/authMode=emailOtpRequestFailureMode\(\{/u);
  assert.match(app,/resend\?'Código reenviado\./u);
});

test('email assurance backend keeps OTP freshness bounded and replay one-time',()=>{
  const edge=fs.readFileSync('supabase/functions/iberfit-email-assurance-v1/index.ts','utf8');
  const migration=fs.readFileSync('supabase/migrations/20260911033500_p0_email_assurance_one_time_proof_v2.sql','utf8');

  assert.match(edge,/const RECENT_OTP_SECONDS=10\*60/u);
  assert.match(edge,/recentAmr\(otpClaims,'otp',RECENT_OTP_SECONDS\)/u);
  assert.match(edge,/String\(storeError\.code\|\|''\)==='23505'/u);
  assert.match(edge,/fail\(409,'M26_EMAIL_ASSURANCE_OTP_ALREADY_USED'/u);

  assert.match(migration,/primary key \(otp_session_id\)/u);
  assert.match(migration,/Each Supabase email OTP session may establish privileged assurance exactly once/u);
});

test('access UI tells the user that OTP expires and is single-use',()=>{
  const access=fs.readFileSync('src/m26/app/access-ui.js','utf8');
  assert.match(access,/el código es personal y de un solo uso/iu);
  assert.match(access,/El código caduca por seguridad, solo puede utilizarse una vez/iu);
  assert.match(access,/data-auth-action="mfa-resend-email-code"/u);
});
