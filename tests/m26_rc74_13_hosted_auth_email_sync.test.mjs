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


test('la promoción PROD sincroniza y verifica emails antes del cutover de Cloudflare',()=>{
  const workflow=read('.github/workflows/production-promote.yml');
  const manifestGate=workflow.indexOf('Validate release manifest and exact source');
  const emailSync=workflow.indexOf('Sync and verify IBERFIT Hosted Auth emails before cutover');
  const deploy=workflow.indexOf('Deploy exact certified surface to production with Wrangler');
  assert.ok(manifestGate>=0&&emailSync>manifestGate&&deploy>emailSync);
  const block=workflow.slice(emailSync,deploy);
  assert.match(block,/SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/u);
  assert.match(block,/SUPABASE_PROJECT_REF: \$\{\{ env\.PROD_SUPABASE_REF \}\}/u);
  assert.match(block,/IBERFIT_AUTH_EMAIL_CONFIRMATION: 'SYNC_IBERFIT_AUTH_EMAILS_PROD'/u);
  assert.match(block,/node scripts\/auth\/sync-hosted-auth-emails\.mjs --sync/u);
});


test('la promoción mantiene el correo OTP oculto y no exige Management API mientras el canal siga sin certificar',()=>{
  const workflow=read('.github/workflows/production-promote.yml');
  const app=read('src/m26/app/application.js');
  assert.match(app,/export const EMAIL_OTP_DEPLOYMENT_READY=false;/u);
  assert.match(workflow,/Resolve privileged email OTP rollout gate/u);
  assert.match(workflow,/grep -Fq 'export const EMAIL_OTP_DEPLOYMENT_READY=true;' src\/m26\/app\/application\.js/u);
  assert.match(workflow,/if: \$\{\{ steps\.email-otp\.outputs\.enabled == 'true' \}\}/u);
  const sync=workflow.indexOf('Sync and verify IBERFIT Hosted Auth emails before cutover');
  const deploy=workflow.indexOf('Deploy exact certified surface to production with Wrangler');
  assert.ok(sync>=0&&deploy>sync);
});
