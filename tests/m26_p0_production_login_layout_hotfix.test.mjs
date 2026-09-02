import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const migrationPath='supabase/migrations/20260902033214_p0_restore_primary_auth_read_bootstrap_v1.sql';

test('P0 production hotfix separates authenticated reads from privileged mutations',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');

  for(const name of [
    'iberfit_bootstrap_v26',
    'iberfit_appointment_change_requests_v13',
    'iberfit_admin_bootstrap_v14',
    'iberfit_communication_bootstrap_v14',
    'm26_backend_bootstrap_v43',
    'm26_wearable_bootstrap_v44',
  ]){
    assert.match(sql,new RegExp(`create or replace function public\\.${name}\\(`,'u'));
  }

  assert.doesNotMatch(sql,/iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.doesNotMatch(sql,/create or replace function public\.iberfit_command_preflight_v26\(/u);
  assert.doesNotMatch(sql,/create or replace function public\.iberfit_execute_command_v26\(/u);
  assert.doesNotMatch(sql,/create or replace function public\.iberfit_admin_execute_v14\(/u);

  const hardening=fs.readFileSync(
    'supabase/migrations/20260830044500_rc65_c2_c3_privileged_server_enforcement.sql',
    'utf8'
  );
  assert.match(
    hardening,
    /create or replace function public\.iberfit_command_preflight_v26\([\s\S]*?perform public\.iberfit_require_privileged_assurance_v65d\(\);/u
  );
  assert.match(
    hardening,
    /create or replace function public\.iberfit_execute_command_v26\([\s\S]*?perform public\.iberfit_require_privileged_assurance_v65d\(\);/u
  );
});

test('login surface is native full-screen, responsive and never clips a short viewport',()=>{
  const css=fs.readFileSync('public/m26/preauth-critical.css','utf8').replace(/\r\n?/gu,'\n').trimEnd();

  assert.match(css,/\.m26-auth-page\{[^}]*display:flex;[^}]*align-items:flex-start;[^}]*justify-content:center;/u);
  const authCardRule=css.match(/\.m26-auth-card\{([^}]*)\}/u)?.[1]||'';
  assert.match(authCardRule,/margin-block:auto(?:;|$)/u);
  assert.match(authCardRule,/border:0(?:;|$)/u);
  assert.match(authCardRule,/border-radius:0(?:;|$)/u);
  assert.match(authCardRule,/background:transparent(?:;|$)/u);
  assert.match(authCardRule,/box-shadow:none(?:;|$)/u);
  assert.match(css,/\.m26-auth-brand\{[^}]*justify-items:center/u);
  assert.match(css,/\.m26-auth-logo\{[^}]*margin:0;[^}]*object-fit:contain/u);
  assert.match(css,/\.m26-password-toggle/u);
  assert.match(css,/\.m26-remember-email/u);
  assert.match(css,/@media\(max-height:760px\) and \(min-width:581px\)/u);
  assert.match(css,/@media\(max-width:580px\)/u);
  assert.match(css,/\.m26-auth-notice\.is-error/u);

  const html=fs.readFileSync('public/m26/index.html','utf8');
  const inline=html.match(/<style data-iberfit-preauth-critical>([\s\S]*?)<\/style>/u)?.[1];
  assert.equal(inline,css);
  assert.match(html,/class="m26-auth-logo" src="\/public\/isotipo-iberfit\.png"/u);
  assert.match(html,/<p class="m26-eyebrow">IBERFIT<\/p>/u);
  assert.match(html,/<h1 id="m26-auth-title"/u);
  assert.match(html,/data-password-toggle/u);
  assert.match(html,/name="rememberEmail"/u);
  assert.match(html,/\/src\/m26\/design\/auth-native\.css/u);

  const hash=crypto.createHash('sha256').update(inline,'utf8').digest('base64');
  const headers=fs.readFileSync('public/m26/_headers','utf8');
  assert.ok(headers.includes(`style-src 'self' 'sha256-${hash}';`));
});
