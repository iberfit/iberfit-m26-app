import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderAccessUi,maskAccessEmail} from '../src/m26/app/access-ui.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n?/gu,'\n');

test('P0 privileged access keeps WebAuthn and adds email OTP as a second secure path',()=>{
  const html=renderAccessUi({
    backendReady:true,
    qaOnly:false,
    host:'app.iberfit.cl',
    mode:'mfa-challenge',
    mfa:{kind:'challenge',email:'owner@iberfit.cl',emailOtpAvailable:true},
  });
  assert.match(html,/data-auth-action="mfa-continue-webauthn"/u);
  assert.match(html,/data-auth-action="mfa-send-email-code"/u);
  assert.match(html,/Usar código por correo/u);
  assert.doesNotMatch(html,/data-auth-action="mfa-register-device"/u);
});

test('P0 email OTP entry is explicit, masked and optimized for one-time-code autofill',()=>{
  const html=renderAccessUi({
    backendReady:true,
    qaOnly:false,
    host:'app.iberfit.cl',
    mode:'mfa-email-code',
    mfa:{kind:'challenge',email:'owner@iberfit.cl',emailOtpAvailable:true},
  });
  assert.equal(maskAccessEmail('owner@iberfit.cl'),'ow***@iberfit.cl');
  assert.match(html,/data-auth-form="mfa-email-code"/u);
  assert.match(html,/autocomplete="one-time-code"/u);
  assert.match(html,/inputmode="numeric"/u);
  assert.match(html,/pattern="\[0-9\]\{6\}"/u);
  assert.match(html,/data-auth-action="mfa-resend-email-code"/u);
  assert.match(html,/data-auth-action="mfa-back-device"/u);
  assert.doesNotMatch(html,/owner@iberfit\.cl/u);
});

test('P0 transport sends OTP without creating accounts and verifies a six-digit email code',()=>{
  const source=read('src/m26/supabase-transport.js');
  assert.match(source,/\/auth\/v1\/otp/u);
  assert.match(source,/create_user:false/u);
  assert.match(source,/\/auth\/v1\/verify/u);
  assert.match(source,/type:'email'/u);
  assert.match(source,/\^\\d\{6\}\$/u);
  assert.match(source,/iberfit-email-assurance-v1/u);
});

test('P0 server-bound email assurance requires two distinct recent factors for the same identity',()=>{
  const source=read('supabase/functions/iberfit-email-assurance-v1/index.ts');
  assert.match(source,/otpToken===primaryToken/u);
  assert.match(source,/primarySessionId===otpSessionId/u);
  assert.match(source,/primaryUserId!==otpUserId/u);
  assert.match(source,/recentAmr\(primaryClaims,'password',RECENT_PRIMARY_PASSWORD_SECONDS\)/u);
  assert.match(source,/recentAmr\(otpClaims,'otp',RECENT_OTP_SECONDS\)/u);
  assert.match(source,/primaryUser\.id!==otpUser\.id/u);
  assert.match(source,/primaryEmail!==otpEmail/u);
  assert.match(source,/\.insert\(\{/u);
  assert.doesNotMatch(source,/\.upsert\(\{/u);
  assert.match(source,/origin,/u);
  assert.match(source,/ASSURANCE_TTL_MS=2\*60\*60\*1000/u);
});

test('P0 email assurance storage is inaccessible to browser roles and one OTP session is single-use',()=>{
  const v1=read('supabase/migrations/20260911033000_p0_email_privileged_assurance_v1.sql');
  const v2=read('supabase/migrations/20260911033500_p0_email_assurance_one_time_proof_v2.sql');
  assert.match(v1,/otp_session_id uuid not null unique/u);
  assert.match(v1,/primary key \(user_id, session_id\)/u);
  assert.match(v1,/enable row level security/u);
  assert.match(v1,/revoke all on table public\.iberfit_email_privileged_assurance_v1 from public,anon,authenticated/u);
  assert.match(v1,/grant select,insert,update,delete on table public\.iberfit_email_privileged_assurance_v1 to service_role/u);
  assert.match(v1,/v_assurance_method:='webauthn'/u);
  assert.match(v1,/v_assurance_method:='email_otp'/u);
  assert.match(v1,/a\.origin=v_origin/u);
  assert.match(v1,/'emailOtpAvailable'/u);
  assert.match(v2,/primary key \(otp_session_id\)/u);
  assert.match(v2,/Each Supabase email OTP session may establish privileged assurance exactly once/u);
});

test('P0 branded access email uses the official six-digit token and preserves the IBERFIT email system',()=>{
  const html=read('supabase/templates/iberfit-magic-link.html');
  const manifest=JSON.parse(read('supabase/templates/iberfit-hosted-auth-email-manifest.json'));
  const magic=manifest.templates.find((item)=>item.id==='magic_link');
  const confirmation=manifest.templates.find((item)=>item.id==='confirmation');
  assert.match(html,/\{\{ \.Token \}\}/u);
  assert.match(html,/\{\{ \.Email \}\}/u);
  assert.doesNotMatch(html,/ConfirmationURL/u);
  assert.match(html,/https:\/\/app\.iberfit\.cl\/isotipo-iberfit\.png/u);
  assert.match(html,/iberfit-email-access-hero\.jpg/u);
  assert.match(html,/IBERFIT nunca te pedirá este código por teléfono, WhatsApp ni mensaje directo/u);
  assert.equal(magic.subject,'Tu código de acceso IBERFIT');
  assert.deepEqual(magic.requires,['{{ .Token }}','{{ .Email }}']);
  assert.deepEqual(confirmation.requires,['{{ .ConfirmationURL }}']);
});

test('P0 a verified email assurance keeps the primary session retriable if workspace setup fails afterwards',()=>{
  const source=read('src/m26/app/application.js');
  const start=source.indexOf('async function verifyMfaEmailCode(otp)');
  const end=source.indexOf('async function continueMfaWithWebAuthn()',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/let assuranceVerified=false/u);
  assert.match(block,/assuranceVerified=true/u);
  assert.match(block,/surfaceRetriableSessionFailure\(error,'post-email-mfa-setup'\)/u);
  assert.match(block,/void transport\?\.logout\?\.\(otpToken,\{scope:'local'\}\)/u);
});

test('P0 a successful MFA ceremony is not reclassified as biometric failure if workspace setup fails afterwards',()=>{
  const source=read('src/m26/app/application.js');
  const start=source.indexOf('async function continueMfaWithWebAuthn()');
  const end=source.indexOf('function surfaceRetriableSessionFailure',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/let assuranceVerified=false/u);
  assert.match(block,/assuranceVerified=true/u);
  assert.match(block,/surfaceRetriableSessionFailure\(error,'post-mfa-setup'\)/u);
});


test('P0 email OTP rollout is enabled only through the certified backend availability gate',()=>{
  const available=renderAccessUi({
    backendReady:true,
    qaOnly:false,
    host:'app.iberfit.cl',
    mode:'mfa-challenge',
    mfa:{kind:'challenge',emailOtpAvailable:true},
  });
  const unavailable=renderAccessUi({
    backendReady:true,
    qaOnly:false,
    host:'app.iberfit.cl',
    mode:'mfa-challenge',
    mfa:{kind:'challenge',emailOtpAvailable:false},
  });
  assert.match(available,/data-auth-action="mfa-send-email-code"/u);
  assert.match(available,/Usar código por correo/u);
  assert.doesNotMatch(unavailable,/data-auth-action="mfa-send-email-code"/u);
  const source=read('src/m26/app/application.js');
  assert.match(source,/export const EMAIL_OTP_DEPLOYMENT_READY=true;/u);
  assert.match(source,/emailOtpAvailable:EMAIL_OTP_DEPLOYMENT_READY&&assurance\.emailOtpAvailable===true/u);
  assert.match(source,/if\(mfaState\?\.emailOtpAvailable!==true\)throw new Error\('M26_EMAIL_OTP_CHANNEL_NOT_READY'\)/u);
});
