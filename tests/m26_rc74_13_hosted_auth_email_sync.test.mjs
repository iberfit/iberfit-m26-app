import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {buildHostedAuthPatch,assertCustomSmtp,__hostedAuthEmailInternals} from '../scripts/auth/sync-hosted-auth-emails.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('RC74.13 versiona la familia completa de 13 emails Hosted Auth',async()=>{
  const {manifest,patch,hashes}=await buildHostedAuthPatch();
  assert.equal(manifest.schema,'iberfit.auth-email-hosted.v1');
  assert.equal(manifest.projectRef,'pjhmrhejsoofmouedavw');
  assert.equal(manifest.templates.length,13);
  assert.equal(new Set(manifest.templates.map((item)=>item.id)).size,13);
  assert.ok(manifest.templates.some((item)=>item.id==='reauthentication'));
  assert.equal(Object.keys(hashes).length,13);
  assert.equal(Object.keys(patch).filter((key)=>key.includes('templates_')).length,13);
  assert.equal(Object.keys(patch).filter((key)=>key.includes('subjects_')).length,13);
  assert.equal(Object.keys(patch).filter((key)=>key.includes('notifications_')).length,7);
  assert.ok(Object.keys(patch).every((key)=>key.startsWith('mailer_')));
  assert.ok(Object.keys(patch).every((key)=>!key.startsWith('smtp_')));
});

test('la reautenticación usa el OTP oficial sin exponer TokenHash ni secretos',()=>{
  const html=read('supabase/templates/iberfit-reauthentication.html');
  assert.match(html,/\{\{ \.Token \}\}/u);
  assert.doesNotMatch(html,/TokenHash|service[_ -]?role|supabase\.co/iu);
  assert.match(html,/https:\/\/app\.iberfit\.cl\/isotipo-iberfit\.png/u);
  assert.match(html,/Confirma que eres tú/u);
});

test('el sincronizador exige SMTP propio antes de permitir Hosted Auth',()=>{
  assert.equal(assertCustomSmtp({smtp_host:'smtp.resend.com',smtp_admin_email:'no-reply@iberfit.cl',smtp_port:587}),true);
  assert.throws(()=>assertCustomSmtp({}),/IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED/u);
  assert.throws(()=>assertCustomSmtp({smtp_host:'smtp.resend.com',smtp_admin_email:'',smtp_port:587}),/IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED/u);
});

test('la publicación remota queda limitada al proyecto PROD y exige confirmación exacta',()=>{
  const source=read('scripts/auth/sync-hosted-auth-emails.mjs');
  const workflow=read('.github/workflows/hosted-auth-email-sync.yml');
  assert.equal(__hostedAuthEmailInternals.PROD_REF,'pjhmrhejsoofmouedavw');
  assert.equal(__hostedAuthEmailInternals.EXACT_CONFIRMATION,'SYNC_IBERFIT_AUTH_EMAILS_PROD');
  assert.match(source,/IBERFIT_AUTH_EMAIL_PROD_REF_REQUIRED/u);
  assert.match(source,/IBERFIT_AUTH_EMAIL_EXPLICIT_CONFIRMATION_REQUIRED/u);
  assert.match(source,/IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED/u);
  assert.match(source,/REMOTE_VERIFY_FAILED/u);
  assert.doesNotMatch(source,/smtp_pass\s*:/u);
  assert.match(workflow,/workflow_dispatch:/u);
  assert.match(workflow,/SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/u);
  assert.match(workflow,/SYNC_IBERFIT_AUTH_EMAILS_PROD/u);
  assert.doesNotMatch(workflow,/push:/u);
});
