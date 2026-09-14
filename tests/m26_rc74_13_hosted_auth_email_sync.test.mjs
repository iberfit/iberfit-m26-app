import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildHostedAuthPatch,
  assertCustomSmtp,
  assertProductionAuthBaseline,
  normalizeHostedAuthAssets,
  __hostedAuthEmailInternals,
} from '../scripts/auth/sync-hosted-auth-emails.mjs';

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
  assert.match(html,/https:\/\/app\.iberfit\.cl\/public\/isotipo-iberfit\.png/u);
  assert.match(html,/Confirma que eres tú/u);
});

test('OTP y recuperación usan el sistema visual claro premium y evitan arte roto',()=>{
  const magic=read('supabase/templates/iberfit-magic-link.html');
  const reauth=read('supabase/templates/iberfit-reauthentication.html');
  const recovery=read('supabase/templates/iberfit-recovery.html');

  for(const html of [magic,reauth,recovery]){
    assert.match(html,/background:#f3f0e8/u);
    assert.match(html,/font-family:Georgia,'Times New Roman',serif/u);
    assert.match(html,/https:\/\/app\.iberfit\.cl\/public\/isotipo-iberfit\.png/u);
    assert.doesNotMatch(html,/https:\/\/app\.iberfit\.cl\/isotipo-iberfit\.png/u);
  }

  assert.match(magic,/font-size:38px/u);
  assert.match(magic,/border:2px solid #c8a24a/u);
  assert.match(magic,/mailto:\{\{ \.Email \}\}/u);
  assert.match(magic,/color:#9b7429/u);
  assert.match(reauth,/font-size:38px/u);
  assert.doesNotMatch(recovery,/Experiencia IBERFIT|iberfit-email-access-hero\.jpg/u);
});

test('el sincronizador normaliza cualquier ruta antigua de activos antes de publicar',async()=>{
  const legacy='<img src="https://app.iberfit.cl/isotipo-iberfit.png"><img src="https://app.iberfit.cl/iberfit-email-access-hero.jpg">';
  const normalized=normalizeHostedAuthAssets(legacy);
  assert.match(normalized,/https:\/\/app\.iberfit\.cl\/public\/isotipo-iberfit\.png/u);
  assert.match(normalized,/https:\/\/app\.iberfit\.cl\/public\/iberfit-email-access-hero\.jpg/u);
  assert.doesNotMatch(normalized,/https:\/\/app\.iberfit\.cl\/isotipo-iberfit\.png/u);
  assert.doesNotMatch(normalized,/https:\/\/app\.iberfit\.cl\/iberfit-email-access-hero\.jpg/u);

  const {patch}=await buildHostedAuthPatch();
  const htmlValues=Object.entries(patch)
    .filter(([key])=>key.includes('templates_'))
    .map(([,value])=>String(value));
  assert.equal(htmlValues.length,13);
  for(const html of htmlValues){
    assert.doesNotMatch(html,/https:\/\/app\.iberfit\.cl\/isotipo-iberfit\.png/u);
    assert.doesNotMatch(html,/https:\/\/app\.iberfit\.cl\/iberfit-email-access-hero\.jpg/u);
  }
});

test('el sincronizador exige baseline Auth PROD y SMTP propio antes de permitir Hosted Auth',()=>{
  const baseline={
    site_url:'https://app.iberfit.cl/',
    disable_signup:true,
    password_min_length:8,
    external_anonymous_users_enabled:false,
    mailer_autoconfirm:false,
    mailer_allow_unverified_email_sign_ins:false,
    mailer_secure_email_change_enabled:true,
  };
  assert.equal(assertProductionAuthBaseline(baseline),true);
  assert.throws(()=>assertProductionAuthBaseline({...baseline,site_url:'https://m26-canary.iberfit.cl/'}),/SITE_URL_REQUIRED/u);
  assert.throws(()=>assertProductionAuthBaseline({...baseline,disable_signup:false}),/PUBLIC_SIGNUP_MUST_BE_DISABLED/u);
  assert.throws(()=>assertProductionAuthBaseline({...baseline,password_min_length:6}),/PASSWORD_BASELINE_REQUIRED/u);
  assert.throws(()=>assertProductionAuthBaseline({...baseline,external_anonymous_users_enabled:true}),/ANONYMOUS_USERS_FORBIDDEN/u);
  assert.throws(()=>assertProductionAuthBaseline({...baseline,mailer_autoconfirm:true}),/CONFIRMATION_REQUIRED/u);
  assert.throws(()=>assertProductionAuthBaseline({...baseline,mailer_allow_unverified_email_sign_ins:true}),/UNVERIFIED_SIGNIN_FORBIDDEN/u);
  assert.throws(()=>assertProductionAuthBaseline({...baseline,mailer_secure_email_change_enabled:false}),/SECURE_CHANGE_REQUIRED/u);

  const smtp={
    smtp_host:'smtp.provider.test',
    smtp_admin_email:'no-reply@iberfit.cl',
    smtp_user:'iberfit-smtp-user',
    smtp_sender_name:'IBERFIT',
    smtp_port:587,
  };
  assert.equal(assertCustomSmtp(smtp),true);
  assert.throws(()=>assertCustomSmtp({}),/IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED/u);
  assert.throws(()=>assertCustomSmtp({...smtp,smtp_user:''}),/IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED/u);
  assert.throws(()=>assertCustomSmtp({...smtp,smtp_sender_name:''}),/IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED/u);
  assert.throws(()=>assertCustomSmtp({...smtp,smtp_port:70000}),/IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED/u);
});

test('la publicación remota queda limitada al proyecto PROD y exige confirmación exacta',()=>{
  const source=read('scripts/auth/sync-hosted-auth-emails.mjs');
  const workflow=read('.github/workflows/hosted-auth-email-sync.yml');
  assert.equal(__hostedAuthEmailInternals.PROD_REF,'pjhmrhejsoofmouedavw');
  assert.equal(__hostedAuthEmailInternals.PROD_SITE_URL,'https://app.iberfit.cl/');
  assert.equal(__hostedAuthEmailInternals.EXACT_CONFIRMATION,'SYNC_IBERFIT_AUTH_EMAILS_PROD');
  assert.equal(__hostedAuthEmailInternals.PUBLIC_ISOTYPE_URL,'https://app.iberfit.cl/public/isotipo-iberfit.png');
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

test('la promoción activa OTP solo con sincronización y verificación SMTP fail-closed',()=>{
  const workflow=read('.github/workflows/production-promote.yml');
  const app=read('src/m26/app/application.js');
  assert.match(app,/export const EMAIL_OTP_DEPLOYMENT_READY=true;/u);
  assert.match(workflow,/Resolve privileged email OTP rollout gate/u);
  assert.match(workflow,/grep -Fq 'export const EMAIL_OTP_DEPLOYMENT_READY=true;' src\/m26\/app\/application\.js/u);
  assert.match(workflow,/if: \$\{\{ steps\.email-otp\.outputs\.enabled == 'true' \}\}/u);
  const sync=workflow.indexOf('Sync and verify IBERFIT Hosted Auth emails before cutover');
  const deploy=workflow.indexOf('Deploy exact certified surface to production with Wrangler');
  assert.ok(sync>=0&&deploy>sync);
  const block=workflow.slice(sync,deploy);
  assert.match(block,/sync-hosted-auth-emails\.mjs --sync/u);
  const syncSource=read('scripts/auth/sync-hosted-auth-emails.mjs');
  assert.match(syncSource,/assertProductionAuthBaseline\(before\)/u);
  assert.match(syncSource,/assertCustomSmtp\(before\)/u);
  assert.match(syncSource,/IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED/u);
});
