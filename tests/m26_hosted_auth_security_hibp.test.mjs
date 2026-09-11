import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  __hostedAuthSecurityInternals,
} from '../scripts/auth/sync-hosted-auth-security.mjs';
import {
  __applicationInternals,
} from '../src/m26/app/application.js';

const read=(file)=>fs.readFileSync(file,'utf8');

test('Hosted Auth hardening is scoped to leaked-password protection only',()=>{
  assert.deepEqual(__hostedAuthSecurityInternals.ALLOWED_PATCH_KEYS,['password_hibp_enabled']);
  assert.deepEqual(
    __hostedAuthSecurityInternals.sanitizePatch({password_hibp_enabled:true}),
    {password_hibp_enabled:true},
  );
  assert.throws(
    ()=>__hostedAuthSecurityInternals.sanitizePatch({password_hibp_enabled:true,mailer_autoconfirm:true}),
    /IBERFIT_AUTH_SECURITY_PATCH_SCOPE_INVALID/u,
  );
  assert.throws(
    ()=>__hostedAuthSecurityInternals.sanitizePatch({password_hibp_enabled:'true'}),
    /IBERFIT_AUTH_SECURITY_HIBP_BOOLEAN_REQUIRED/u,
  );
});

test('QA and PROD use exact project refs and explicit independent confirmations',()=>{
  const {TARGETS}=__hostedAuthSecurityInternals;
  assert.equal(TARGETS.qa.projectRef,'gjztkdwfmunnzhtvxrsu');
  assert.equal(TARGETS.prod.projectRef,'pjhmrhejsoofmouedavw');
  assert.equal(TARGETS.qa.confirmation,'ENABLE_IBERFIT_HIBP_QA');
  assert.equal(TARGETS.prod.confirmation,'ENABLE_IBERFIT_HIBP_PROD');
  assert.equal(TARGETS.qa.rollbackConfirmation,'ROLLBACK_IBERFIT_HIBP_QA');
  assert.equal(TARGETS.prod.rollbackConfirmation,null);
});

test('only the exact HIBP PATCH 402 is classified as a plan limitation',()=>{
  const {ManagementApiError,isPlanLimitedHibpError}=__hostedAuthSecurityInternals;
  assert.equal(isPlanLimitedHibpError(new ManagementApiError('PATCH',402)),true);
  assert.equal(isPlanLimitedHibpError(new ManagementApiError('GET',402)),false);
  assert.equal(isPlanLimitedHibpError(new ManagementApiError('PATCH',401)),false);
  assert.equal(isPlanLimitedHibpError(new ManagementApiError('PATCH',403)),false);
  assert.equal(isPlanLimitedHibpError(new ManagementApiError('PATCH',429)),false);
  assert.equal(isPlanLimitedHibpError(new ManagementApiError('PATCH',500)),false);
});

test('QA workflow assesses HIBP, validates real logins and rolls back only if it changed',()=>{
  const workflow=read('.github/workflows/hosted-auth-security-hardening.yml');
  assert.match(workflow,/environment: m26-canary-readonly/u);
  assert.match(workflow,/sync-hosted-auth-security\.mjs --enable --target qa/u);
  assert.match(workflow,/run_authenticated_readonly_gate\.mjs/u);
  assert.match(workflow,/plan_limited_pro_feature/u);
  assert.match(workflow,/managementStatus===402/u);
  assert.match(workflow,/failure\(\) && steps\.hibp\.outputs\.changed == 'true'/u);
  assert.match(workflow,/sync-hosted-auth-security\.mjs --restore-qa --target qa/u);
  assert.match(workflow,/SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/u);
});

test('production promotion assesses QA and PROD before Cloudflare cutover',()=>{
  const workflow=read('.github/workflows/production-promote.yml');
  const qaAssess=workflow.indexOf('Assess or enable QA leaked-password protection before production');
  const qaLogin=workflow.indexOf('Validate QA authenticated access after password-security assessment');
  const prodAssess=workflow.indexOf('Assess or enable leaked-password protection in PROD');
  const discover=workflow.indexOf('Discover exact Cloudflare production target');
  const deploy=workflow.indexOf('Deploy exact certified surface to production with Wrangler');
  assert.ok(qaAssess>=0);
  assert.ok(qaLogin>qaAssess);
  assert.ok(prodAssess>qaLogin);
  assert.ok(discover>prodAssess);
  assert.ok(deploy>discover);
  const qaBlock=workflow.slice(qaAssess,prodAssess);
  assert.match(qaBlock,/ENABLE_IBERFIT_HIBP_QA/u);
  assert.match(qaBlock,/run_authenticated_readonly_gate\.mjs/u);
  assert.match(qaBlock,/steps\.qa-hibp\.outputs\.changed == 'true'/u);
  const prodBlock=workflow.slice(prodAssess,discover);
  assert.match(prodBlock,/ENABLE_IBERFIT_HIBP_PROD/u);
  assert.match(prodBlock,/sync-hosted-auth-security\.mjs --enable --target prod/u);
  assert.match(prodBlock,/SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/u);
  assert.match(workflow,/recovery\/hosted-auth-security\//u);
});

test('management token cannot be printed or embedded in evidence',()=>{
  const source=read('scripts/auth/sync-hosted-auth-security.mjs');
  assert.doesNotMatch(source,/console\.log\([^\n]*token/iu);
  assert.doesNotMatch(source,/writeEvidence\([^\n]*token/iu);
  assert.doesNotMatch(source,/SUPABASE_ACCESS_TOKEN\s*[:=]\s*['"`]/u);
});

test('IBERFIT explains weak or leaked password failures without mislabeling credentials',()=>{
  const weak={status:400,message:'Password is weak because it appears in a leaked password list',body:{code:'weak_password'}};
  assert.match(__applicationInternals.loginFailureMessage(weak),/renovarse por seguridad/u);
  assert.match(__applicationInternals.loginFailureMessage(weak),/Olvidaste tu contraseña/u);
  assert.match(__applicationInternals.recoveryPasswordError(weak),/débil o expuesta/u);
  assert.equal(
    __applicationInternals.loginFailureMessage({status:400,message:'invalid login credentials',body:{code:'invalid_credentials'}}),
    'El correo o la contraseña no coinciden.',
  );
});
