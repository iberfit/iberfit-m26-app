import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderAccessUi} from '../src/m26/app/access-ui.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n?/gu,'\n');

test('existing WebAuthn credentials expose reinforced account recovery without changing first-device enrollment',()=>{
  const challenge=renderAccessUi({
    mode:'mfa-challenge',
    backendReady:true,
    qaOnly:false,
    mfa:{kind:'challenge',credentialEnrolled:true,emailOtpAvailable:false},
  });
  const enroll=renderAccessUi({
    mode:'mfa-required',
    backendReady:true,
    qaOnly:false,
    mfa:{kind:'enroll-required',credentialEnrolled:false,emailOtpAvailable:false},
  });

  assert.match(challenge,/data-auth-action="mfa-account-recovery"/u);
  assert.match(challenge,/Recuperar acceso por correo/u);
  assert.match(challenge,/recuperación segura por correo/u);
  assert.doesNotMatch(enroll,/data-auth-action="mfa-account-recovery"/u);
  assert.match(enroll,/Configurar este dispositivo/u);
});

test('recovery RPC accepts only a fresh one-time Supabase recovery JWT and mutates only own device assurance',()=>{
  const sql=read('supabase/migrations/20260912152000_webauthn_password_recovery_reset_v1.sql');

  assert.match(sql,/v_user_id uuid:=auth\.uid\(\)/u);
  assert.match(sql,/v_claims jsonb:=coalesce\(auth\.jwt\(\),'\{\}'::jsonb\)/u);
  assert.match(sql,/item->>'method'='recovery'/u);
  assert.match(sql,/v_now - v_recovery_ts > 900/u);
  assert.match(sql,/session_id uuid primary key/u);
  assert.match(sql,/on conflict \(session_id\) do nothing/u);
  assert.match(sql,/where user_id=v_user_id and revoked_at is null/u);
  assert.match(sql,/delete from public\.iberfit_webauthn_challenges_v1\s+where user_id=v_user_id/u);
  assert.match(sql,/iberfit_application_context_v14\(\)/u);
  assert.match(sql,/v_roles\?'admin' or v_roles\?'coach'/u);
  assert.match(sql,/'kind','not-required'/u);
  assert.match(sql,/revoke all on function public\.iberfit_recover_privileged_device_v1\(\) from public,anon/u);
  assert.match(sql,/grant execute on function public\.iberfit_recover_privileged_device_v1\(\) to authenticated/u);

  assert.doesNotMatch(sql,/delete\s+from\s+auth\.users/iu);
  assert.doesNotMatch(sql,/update\s+public\.user_application_roles/iu);
  assert.doesNotMatch(sql,/update\s+public\.iberfit_organization_memberships/iu);
  assert.doesNotMatch(sql,/client_checkins|measurements|health|medical_notes/iu);
});

test('password recovery resets privileged devices before changing the password and consumes only the temporary session',()=>{
  const app=read('src/m26/app/application.js');
  const resetAt=app.indexOf('await transport.recoverPrivilegedWebAuthn(recoveryToken)');
  const passwordAt=app.indexOf('await transport.updatePassword(',resetAt);
  const localLogoutAt=app.indexOf("await transport.logout(recoveryToken,{scope:'local'})",passwordAt);

  assert.ok(resetAt>=0,'recovery proof must be consumed');
  assert.ok(passwordAt>resetAt,'WebAuthn reset must occur before password update can invalidate recovery proof');
  assert.ok(localLogoutAt>passwordAt,'temporary recovery session must be closed locally after password update');

  assert.match(app,/mfa-account-recovery/u);
  assert.match(app,/finishLogout\(\{token,scope:'local',message:''\}\)/u);
  assert.match(app,/authMode='request-recovery'/u);
  assert.match(app,/dispositivos de confianza restablecidos/u);
  assert.doesNotMatch(app,/No se pudieron limpiar[^\n]*código por correo/u);
});

test('transport validates the recovery RPC response instead of trusting arbitrary payloads',()=>{
  const transport=read('src/m26/supabase-transport.js');
  assert.match(transport,/RC65C_WEBAUTHN_RECOVERY_RPC='iberfit_recover_privileged_device_v1'/u);
  assert.match(transport,/async function recoverPrivilegedWebAuthn\(token\)/u);
  assert.match(transport,/\['ack','duplicate','not-required'\]\.includes\(kind\)/u);
  assert.match(transport,/M26_WEBAUTHN_RECOVERY_INVALID_RESPONSE/u);
  assert.match(transport,/recoverPrivilegedWebAuthn,/u);
});

test('reinforced recovery copy is included in the multilingual critical auth catalogue',()=>{
  const i18n=read('src/m26/ui/i18n-surface-p0-client-auth.js');
  for(const phrase of [
    'Recuperar acceso por correo',
    'Los dispositivos nuevos se añaden desde una sesión ya verificada.',
    'No se pudieron limpiar los archivos temporales de acceso.',
    'Contraseña actualizada y dispositivos de confianza restablecidos.',
  ]){
    assert.match(i18n,new RegExp(phrase.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&'),'u'));
  }
});
